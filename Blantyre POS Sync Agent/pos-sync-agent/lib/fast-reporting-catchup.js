const sql = require('mssql');
const axios = require('axios');
const { getSyncMetadata } = require('./config');
const { getSubLocationByCode } = require('./sub-locations');

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

class FastReportingCatchup {
  constructor(pool, appConfig) {
    this.pool = pool;
    this.appConfig = appConfig;
    this.running = false;
    this.stopped = false;
    this.timer = null;
    this.lastInvoiceNo = 0;
    this.columnsCache = {};
    this.logPrefix = appConfig.branch.logPrefix || `[${appConfig.branch.branchCode} SYNC]`;
  }

  async getTableColumns(tableName) {
    if (this.columnsCache[tableName]) return this.columnsCache[tableName];

    const request = this.pool.request();
    request.input('tableName', sql.VarChar(128), tableName);

    const result = await request.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION
    `);

    const columns = new Set((result.recordset || []).map((row) => String(row.COLUMN_NAME || '').trim()));
    this.columnsCache[tableName] = columns;
    return columns;
  }

  async resolveColumnSupport() {
    const invoiceColumns = await this.getTableColumns('invoice');
    const detailColumns = await this.getTableColumns('invoicedetails');

    return {
      hasInvoiceCode: invoiceColumns.has('InvoiceCode'),
      hasQuoteNo: invoiceColumns.has('QuoteNo'),
      hasCostPrice: detailColumns.has('CostPrice'),
      hasGrnDate: detailColumns.has('GrnDate'),
    };
  }

  buildDateRange() {
    const to = new Date();
    const from = new Date(
      to.getTime() - this.appConfig.reporting.fastCatchupLookbackHours * 60 * 60 * 1000
    );

    return { from, to };
  }

  async fetchInvoiceHeaders() {
    const { from, to } = this.buildDateRange();
    const support = await this.resolveColumnSupport();

    const request = this.pool.request();
    request.input('fromDate', sql.DateTime, from);
    request.input('toDate', sql.DateTime, to);
    request.input('batchSize', sql.Int, this.appConfig.reporting.fastCatchupBatchSize);
    request.input('lastInvoiceNo', sql.Int, this.lastInvoiceNo);

    const invoiceCodeSelect = support.hasInvoiceCode
      ? 'InvoiceCode'
      : support.hasQuoteNo
        ? 'QuoteNo AS InvoiceCode'
        : 'InvoiceNo AS InvoiceCode';

    const quoteNoSelect = support.hasQuoteNo ? ', QuoteNo' : ', NULL AS QuoteNo';

    const result = await request.query(`
      SELECT TOP (@batchSize)
        InvoiceNo,
        ${invoiceCodeSelect},
        InvoiceSerialNo,
        RefNo,
        InvoiceDate,
        InvoiceTime,
        CustomerCode,
        LocationCode,
        GrossSale,
        VAT,
        Discount,
        NetSale,
        InvoiceType,
        TillID,
        PayMethod1,
        TenAmt1,
        ChqNo1,
        PayMethod2,
        TenAmt2,
        ChqNo2,
        UserName,
        PriceTypeCode,
        RepCode,
        UploadStatus,
        CustomerDetails,
        CashSaleNo,
        LevyAmount,
        Reserved,
        DiscountAmount,
        FiscalReceiptNo,
        BankCode,
        Bank_Name,
        Bank_CARD_HOLDER,
        Bank_CARD_NO,
        Bank_CARD_EXPIARY
        ${quoteNoSelect}
      FROM invoice
      WHERE InvoiceDate >= @fromDate
        AND InvoiceDate <= @toDate
        AND InvoiceNo > @lastInvoiceNo
      ORDER BY InvoiceNo ASC
    `);

    return result.recordset || [];
  }

  async fetchInvoiceDetails(invoiceCodes) {
    if (!invoiceCodes.length) return {};

    const support = await this.resolveColumnSupport();
    const request = this.pool.request();

    const placeholders = invoiceCodes.map((_, idx) => `@invoiceCode${idx}`).join(',');
    invoiceCodes.forEach((code, idx) => {
      request.input(`invoiceCode${idx}`, sql.Int, code);
    });

    const costPriceSelect = support.hasCostPrice ? ', CostPrice' : ', NULL AS CostPrice';
    const grnDateSelect = support.hasGrnDate ? ', GrnDate' : ', NULL AS GrnDate';

    const result = await request.query(`
      SELECT
        InvDetailID,
        InvoiceCode,
        ProductCode,
        Qty,
        PriceTypeCode,
        UnitPrice,
        BulkPrice,
        Discount,
        Amount,
        StartSerialNo,
        EndSerialNo,
        TaxRate,
        TaxAmount,
        FPrice,
        UploadStatus,
        ProductName,
        LocationCode,
        LevyRate,
        LevyAmount,
        Printed,
        Sub_Qty,
        DiscountAmount
        ${costPriceSelect}
        ${grnDateSelect}
      FROM invoicedetails
      WHERE InvoiceCode IN (${placeholders})
      ORDER BY InvoiceCode ASC, InvDetailID ASC
    `);

    const map = {};
    for (const detail of result.recordset || []) {
      const key = Number(detail.InvoiceCode);
      if (!map[key]) map[key] = [];
      map[key].push(detail);
    }

    return map;
  }

  normalizeInvoice(row, detailsMap) {
    const invoiceCode = Number(row.InvoiceCode);
    const invoiceSubLocation = getSubLocationByCode(row.LocationCode);

    return {
      invoiceNo: Number(row.InvoiceNo),
      invoiceCode,
      invoiceSerialNo: Number(row.InvoiceSerialNo),
      refNo: row.RefNo || null,
      invoiceDate: toIso(row.InvoiceDate),
      invoiceTime: toIso(row.InvoiceTime),
      customerCode: row.CustomerCode || null,
      customerDetails: row.CustomerDetails || null,
      locationCode: row.LocationCode || this.appConfig.posDb.locationCode,
      grossSale: Number(row.GrossSale) || 0,
      vat: Number(row.VAT) || 0,
      discount: Number(row.Discount) || 0,
      netSale: Number(row.NetSale) || 0,
      invoiceType: row.InvoiceType || null,
      tillId: toNumberOrNull(row.TillID),
      payMethod1: row.PayMethod1 || null,
      tenAmt1: toNumberOrNull(row.TenAmt1),
      chqNo1: row.ChqNo1 || null,
      payMethod2: row.PayMethod2 || null,
      tenAmt2: toNumberOrNull(row.TenAmt2),
      chqNo2: row.ChqNo2 || null,
      userName: row.UserName || null,
      priceTypeCode: row.PriceTypeCode || null,
      repCode: row.RepCode || null,
      uploadStatus: toNumberOrNull(row.UploadStatus),
      cashSaleNo: toNumberOrNull(row.CashSaleNo),
      levyAmount: Number(row.LevyAmount) || 0,
      reserved: toNumberOrNull(row.Reserved),
      discountAmount: Number(row.DiscountAmount) || 0,
      fiscalReceiptNo: row.FiscalReceiptNo || null,
      bankCode: row.BankCode || null,
      bankName: row.Bank_Name || null,
      bankCardHolder: row.Bank_CARD_HOLDER || null,
      bankCardNo: row.Bank_CARD_NO || null,
      bankCardExpiry: row.Bank_CARD_EXPIARY || null,
      quoteNo: row.QuoteNo || null,
      subLocation: invoiceSubLocation,
      details: (detailsMap[invoiceCode] || []).map((d) => ({
        invDetailId: Number(d.InvDetailID),
        invoiceCode: Number(d.InvoiceCode),
        productCode: d.ProductCode || null,
        productName: d.ProductName || null,
        qty: Number(d.Qty) || 0,
        priceTypeCode: d.PriceTypeCode || null,
        unitPrice: Number(d.UnitPrice) || 0,
        bulkPrice: Number(d.BulkPrice) || 0,
        discount: Number(d.Discount) || 0,
        amount: Number(d.Amount) || 0,
        startSerialNo: d.StartSerialNo || null,
        endSerialNo: d.EndSerialNo || null,
        taxRate: Number(d.TaxRate) || 0,
        taxAmount: Number(d.TaxAmount) || 0,
        fPrice: Number(d.FPrice) || 0,
        uploadStatus: toNumberOrNull(d.UploadStatus),
        locationCode: d.LocationCode || this.appConfig.posDb.locationCode,
        levyRate: Number(d.LevyRate) || 0,
        levyAmount: Number(d.LevyAmount) || 0,
        printed: toNumberOrNull(d.Printed),
        subQty: Number(d.Sub_Qty) || 0,
        discountAmount: Number(d.DiscountAmount) || 0,
        costPrice: d.CostPrice == null ? null : Number(d.CostPrice),
        grnDate: toIso(d.GrnDate),
      })),
    };
  }

  async pushToBackend(invoices) {
    const backendUrl = this.appConfig.backend.baseUrl;
    const endpoint = this.appConfig.reporting.backendReportingEndpoint;

    const payload = {
      branchCode: this.appConfig.branch.branchCode,
      branchName: this.appConfig.branch.branchName,
      locationId: this.appConfig.branch.locationId,
      syncSourceCode: this.appConfig.branch.syncSourceCode,
      syncedAt: new Date().toISOString(),
      invoices,
      metadata: getSyncMetadata(this.appConfig, {
        fastCatchupMode: true,
        importedAt: new Date().toISOString(),
      }),
    };

    const response = await axios.post(`${backendUrl}${endpoint}`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-pos-secret': this.appConfig.backend.apiToken,
        'x-branch-code': this.appConfig.branch.branchCode,
        'x-sync-source-code': this.appConfig.branch.syncSourceCode,
      },
      timeout: 120000,
    });

    return response.data;
  }

  async tick() {
    if (this.running || this.stopped) return;

    this.running = true;
    let nextDelay = this.appConfig.reporting.fastCatchupIdlePollMs;

    try {
      const headers = await this.fetchInvoiceHeaders();

      if (headers.length > 0) {
        const invoiceCodes = headers.map((h) => Number(h.InvoiceCode)).filter(Boolean);
        const detailsMap = await this.fetchInvoiceDetails(invoiceCodes);
        const invoices = headers.map((h) => this.normalizeInvoice(h, detailsMap));

        const result = await this.pushToBackend(invoices);

        this.lastInvoiceNo = Math.max(...headers.map((h) => Number(h.InvoiceNo)));

        console.log(`${this.logPrefix} [FAST REPORTING CATCHUP] synced batch`, {
          invoices: invoices.length,
          lastInvoiceNo: this.lastInvoiceNo,
          backend: result && result.data ? result.data : result,
        });

        nextDelay = this.appConfig.reporting.fastCatchupPollMs;
      } else {
        console.log(`${this.logPrefix} [FAST REPORTING CATCHUP] caught up`, {
          lastInvoiceNo: this.lastInvoiceNo,
        });

        nextDelay = this.appConfig.reporting.fastCatchupIdlePollMs;
      }
    } catch (error) {
      console.error(`${this.logPrefix} [FAST REPORTING CATCHUP] failed:`, error.message);
      nextDelay = this.appConfig.reporting.fastCatchupIdlePollMs;
    } finally {
      this.running = false;

      if (!this.stopped) {
        this.timer = setTimeout(() => this.tick(), nextDelay);
      }
    }
  }

  start() {
    if (this.stopped === false && this.timer) return;
    this.stopped = false;

    console.log(`${this.logPrefix} [FAST REPORTING CATCHUP] started`, {
      pollMs: this.appConfig.reporting.fastCatchupPollMs,
      idlePollMs: this.appConfig.reporting.fastCatchupIdlePollMs,
      lookbackHours: this.appConfig.reporting.fastCatchupLookbackHours,
      batchSize: this.appConfig.reporting.fastCatchupBatchSize,
    });

    this.tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = FastReportingCatchup;