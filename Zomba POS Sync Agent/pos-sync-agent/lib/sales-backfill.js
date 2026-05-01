/**
 * Sales Backfill Module
 * Fetches historical invoices from POS SQL Server and pushes to backend API
 * Supports configurable date range and batch processing
 */

const sql = require('mssql');
const axios = require('axios');
const { getSyncMetadata } = require('./config');
const { enrichRowWithSubLocation, getSubLocationByCode } = require('./sub-locations');

class SalesBackfillService {
  constructor(config, pool) {
    this.config = config;
    this.pool = pool;
    this.branchTag = config.branch.logPrefix || `[${config.branch.branchCode} SYNC]`;
    this.invoiceDetailsColumnSupport = null;
  }

  async getTableColumns(tableName) {
    const request = this.pool.request();
    request.input('tableName', sql.VarChar(128), tableName);
    const result = await request.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION
    `);
    return new Set((result.recordset || []).map((row) => String(row.COLUMN_NAME || '').trim()));
  }

  async resolveInvoiceDetailsColumnSupport() {
    if (this.invoiceDetailsColumnSupport) {
      return this.invoiceDetailsColumnSupport;
    }

    try {
      const invoiceDetailsColumns = await this.getTableColumns('invoicedetails');
      this.invoiceDetailsColumnSupport = {
        hasCostPrice: invoiceDetailsColumns.has('CostPrice'),
        hasGrnDate: invoiceDetailsColumns.has('GrnDate'),
      };
      console.log(`${this.branchTag} [BACKFILL SCHEMA] invoicedetails optional columns`, this.invoiceDetailsColumnSupport);
    } catch (error) {
      this.invoiceDetailsColumnSupport = {
        hasCostPrice: false,
        hasGrnDate: false,
      };
      console.warn(`${this.branchTag} [BACKFILL SCHEMA][WARN] Could not detect invoicedetails optional columns: ${error.message}`);
    }

    return this.invoiceDetailsColumnSupport;
  }

  async resolveInvoiceQuoteNoSupport() {
    try {
      const invoiceColumns = await this.getTableColumns('invoice');
      return invoiceColumns.has('QuoteNo');
    } catch (error) {
      console.warn(`${this.branchTag} [BACKFILL SCHEMA][WARN] Could not detect invoice.QuoteNo: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetch historical invoice headers from POS within date range
   */
  async fetchHistoricalInvoiceHeaders(fromDate, toDate, batchSize = 100) {
    try {
      const hasQuoteNo = await this.resolveInvoiceQuoteNoSupport();
      const request = this.pool.request();
      
      request.input('fromDate', sql.Date, fromDate);
      request.input('toDate', sql.Date, toDate);
      request.input('batchSize', sql.Int, batchSize);

      const quoteNoSelect = hasQuoteNo ? ',\n            QuoteNo' : '';

      const query = `
        SELECT TOP (@batchSize)
            InvoiceNo,
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
            Bank_CARD_EXPIARY${quoteNoSelect}
        FROM invoice
        WHERE InvoiceDate >= @fromDate AND InvoiceDate <= @toDate
        ORDER BY InvoiceNo ASC
      `;

      const result = await request.query(query);
      console.log(`${this.branchTag} [SALES BACKFILL] Pulled ${result.recordset.length} invoices from POS (date range: ${fromDate} to ${toDate})`);

      return result.recordset || [];
    } catch (error) {
      console.error(`${this.branchTag} [SALES BACKFILL] Error fetching historical invoice headers:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch invoice details for given invoice codes
   */
  async fetchInvoiceDetails(invoiceCodes) {
    if (!invoiceCodes || invoiceCodes.length === 0) {
      return {};
    }

    try {
      const columnSupport = await this.resolveInvoiceDetailsColumnSupport();
      const request = this.pool.request();

      const placeholders = invoiceCodes.map((_, idx) => `@invoiceCode${idx}`).join(',');
      invoiceCodes.forEach((code, idx) => {
        request.input(`invoiceCode${idx}`, sql.Int, code);
      });

      const costPriceSelect = columnSupport.hasCostPrice ? ',\n            CostPrice' : '';
      const grnDateSelect = columnSupport.hasGrnDate ? ',\n            GrnDate' : '';

      const query = `
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
            DiscountAmount${costPriceSelect}${grnDateSelect}
        FROM invoicedetails
        WHERE InvoiceCode IN (${placeholders})
        ORDER BY InvoiceCode ASC, InvDetailID ASC
      `;

      const result = await request.query(query);
      console.log(`${this.branchTag} [SALES BACKFILL] Fetched ${result.recordset.length} invoice details`);

      const detailsMap = {};
      result.recordset.forEach((detail) => {
        if (!detailsMap[detail.InvoiceCode]) {
          detailsMap[detail.InvoiceCode] = [];
        }
        detailsMap[detail.InvoiceCode].push(detail);
      });

      return detailsMap;
    } catch (error) {
      console.error(`${this.branchTag} [SALES BACKFILL] Error fetching invoice details:`, error.message);
      throw error;
    }
  }

  /**
   * Normalize invoice header row for backend API
   */
  normalizeInvoiceRow(row) {
    if (!row) return null;

    const invoiceSubLocation = getSubLocationByCode(row.LocationCode);

    return {
      invoiceNo: Number(row.InvoiceNo),
      invoiceSerialNo: Number(row.InvoiceSerialNo),
      refNo: row.RefNo || null,
      invoiceDate: row.InvoiceDate instanceof Date ? row.InvoiceDate.toISOString() : row.InvoiceDate,
      invoiceTime: row.InvoiceTime || null,
      customerCode: row.CustomerCode || null,
      locationCode: row.LocationCode || this.config.posDb.locationCode,
      grossSale: Number(row.GrossSale) || 0,
      vat: Number(row.VAT) || 0,
      discount: Number(row.Discount) || 0,
      netSale: Number(row.NetSale) || 0,
      invoiceType: row.InvoiceType || null,
      tillID: row.TillID || null,
      payMethod1: row.PayMethod1 || null,
      tenAmt1: Number(row.TenAmt1) || null,
      chqNo1: row.ChqNo1 || null,
      payMethod2: row.PayMethod2 || null,
      tenAmt2: Number(row.TenAmt2) || null,
      chqNo2: row.ChqNo2 || null,
      userName: row.UserName || null,
      priceTypeCode: row.PriceTypeCode || null,
      repCode: row.RepCode || null,
      uploadStatus: row.UploadStatus || null,
      customerDetails: row.CustomerDetails || null,
      cashSaleNo: Number(row.CashSaleNo) || null,
      levyAmount: Number(row.LevyAmount) || 0,
      reserved: row.Reserved || null,
      discountAmount: Number(row.DiscountAmount) || 0,
      fiscalReceiptNo: row.FiscalReceiptNo || null,
      bankCode: row.BankCode || null,
      bankName: row.Bank_Name || null,
      bankCardHolder: row.Bank_CARD_HOLDER || null,
      bankCardNo: row.Bank_CARD_NO || null,
      bankCardExpiary: row.Bank_CARD_EXPIARY || null,
      quoteNo: row.QuoteNo || null,
      subLocation: invoiceSubLocation,
      syncSourceCode: this.config.branch.syncSourceCode,
      branchCode: this.config.branch.branchCode,
    };
  }

  /**
   * Normalize invoice detail row for backend API
   */
  normalizeDetailRow(row) {
    if (!row) return null;

    return {
      invDetailID: Number(row.InvDetailID),
      invoiceCode: Number(row.InvoiceCode),
      productCode: row.ProductCode || null,
      qty: Number(row.Qty) || 0,
      priceTypeCode: row.PriceTypeCode || null,
      unitPrice: Number(row.UnitPrice) || 0,
      bulkPrice: Number(row.BulkPrice) || 0,
      discount: Number(row.Discount) || 0,
      amount: Number(row.Amount) || 0,
      startSerialNo: row.StartSerialNo || null,
      endSerialNo: row.EndSerialNo || null,
      taxRate: Number(row.TaxRate) || 0,
      taxAmount: Number(row.TaxAmount) || 0,
      fPrice: Number(row.FPrice) || 0,
      uploadStatus: row.UploadStatus || null,
      productName: row.ProductName || null,
      locationCode: row.LocationCode || this.config.posDb.locationCode,
      levyRate: Number(row.LevyRate) || 0,
      levyAmount: Number(row.LevyAmount) || 0,
      printed: row.Printed || null,
      subQty: Number(row.Sub_Qty) || 0,
      discountAmount: Number(row.DiscountAmount) || 0,
      costPrice: row.CostPrice ? Number(row.CostPrice) : null,
      grnDate: row.GrnDate ? (row.GrnDate instanceof Date ? row.GrnDate.toISOString() : row.GrnDate) : null,
    };
  }

  /**
   * Push batch of invoices to backend API
   */
  async pushBatchToBackend(invoices, detailsMap) {
    const backendUrl = this.config.backend.baseUrl;
    const apiToken = this.config.backend.apiToken;
    const endpoint = this.config.backfill.backendEndpoint;

    if (!backendUrl) {
      throw new Error('Backend URL not configured');
    }

    const payload = {
      invoices: invoices.map((inv) => ({
        ...inv,
        details: detailsMap[inv.invoiceNo] || [],
      })),
      metadata: getSyncMetadata(this.config, {
        backfillMode: true,
        importedAt: new Date().toISOString(),
      }),
    };

    try {
      const response = await axios.post(
        `${backendUrl}${endpoint}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-pos-secret': apiToken,
            'x-branch-code': this.config.branch.branchCode,
            'x-sync-source-code': this.config.branch.syncSourceCode,
          },
          timeout: 120000,
        }
      );

      return {
        success: response.data?.success ?? true,
        synced: response.data?.synced ?? invoices.length,
        skipped: response.data?.skipped ?? 0,
        errors: response.data?.errors ?? [],
      };
    } catch (error) {
      console.error(`${this.branchTag} [SALES BACKFILL] Error pushing batch to backend:`, error.message);
      throw error;
    }
  }

  /**
   * Run the full backfill process
   */
  async runBackfill() {
    const backfillConfig = this.config.backfill;
    
    if (!backfillConfig.enabled) {
      console.log(`${this.branchTag} [SALES BACKFILL] Backfill is disabled (BACKFILL_SALES_ENABLED=false)`);
      return { success: true, message: 'Backfill disabled' };
    }

    if (!backfillConfig.fromDate || !backfillConfig.toDate) {
      throw new Error('Backfill date range not configured. Set BACKFILL_SALES_FROM and BACKFILL_SALES_TO');
    }

    console.log(`${this.branchTag} [SALES BACKFILL] Starting historical sales backfill from ${backfillConfig.fromDate} to ${backfillConfig.toDate}`);

    const fromDate = backfillConfig.fromDate;
    const toDate = backfillConfig.toDate;
    const batchSize = backfillConfig.batchSize || 100;

    let totalInvoicesPulled = 0;
    let totalInvoicesSynced = 0;
    let totalBatches = 0;
    let batchNumber = 1;

    while (true) {
      const invoices = await this.fetchHistoricalInvoiceHeaders(fromDate, toDate, batchSize);
      
      if (invoices.length === 0) {
        console.log(`${this.branchTag} [SALES BACKFILL] No more invoices to process`);
        break;
      }

      totalInvoicesPulled += invoices.length;
      totalBatches++;

      const normalizedInvoices = invoices.map((inv) => this.normalizeInvoiceRow(inv));
      const invoiceCodes = invoices.map((inv) => Number(inv.InvoiceCode));
      const detailsMap = await this.fetchInvoiceDetails(invoiceCodes);

      console.log(`${this.branchTag} [SALES BACKFILL] Pushing batch ${batchNumber}`);
      
      try {
        const result = await this.pushBatchToBackend(normalizedInvoices, detailsMap);
        totalInvoicesSynced += result.synced;
        console.log(`${this.branchTag} [SALES BACKFILL] Batch ${batchNumber} completed: ${result.synced} synced, ${result.skipped} skipped`);
      } catch (error) {
        console.error(`${this.branchTag} [SALES BACKFILL] Batch ${batchNumber} failed: ${error.message}`);
      }

      batchNumber++;

      if (batchNumber > 1000) {
        console.warn(`${this.branchTag} [SALES BACKFILL] Reached safety limit of 1000 batches`);
        break;
      }
    }

    const summary = {
      success: true,
      totalInvoicesPulled,
      totalInvoicesSynced,
      totalBatches,
      fromDate,
      toDate,
    };

    console.log(`${this.branchTag} [SALES BACKFILL] Completed successfully:`, summary);
    return summary;
  }
}

module.exports = SalesBackfillService;