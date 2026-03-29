const sql = require('mssql');
const axios = require('axios');
const { getSyncMetadata } = require('./config');

class ReportingSyncService {
  constructor(config, state) {
    this.config = config;
    this.state = state;
    this.branchTag = `[BRANCH:${config.branch.branchCode}|REPORTING]`;
  }

  async fetchInvoiceHeaders(pool, batchSize = 100) {
    try {
      const lastSyncedInvoiceNo = this.state.getLastSyncedInvoiceNo();

      const request = pool.request();
      request.input('lastSyncedInvoiceNo', sql.Int, lastSyncedInvoiceNo);
      request.input('batchSize', sql.Int, batchSize);

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
            Bank_CARD_EXPIARY,
            QuoteNo
        FROM invoice
        WHERE InvoiceNo > @lastSyncedInvoiceNo
        ORDER BY InvoiceNo ASC
      `;

      const result = await request.query(query);
      console.log(`${this.branchTag} [FETCH] Fetched ${result.recordset.length} invoice headers`);

      return result.recordset || [];
    } catch (error) {
      console.error(`${this.branchTag} [FETCH] Error fetching invoice headers:`, error.message);
      throw error;
    }
  }

  async fetchInvoiceDetails(pool, invoiceCodes) {
    if (!invoiceCodes || invoiceCodes.length === 0) {
      return {};
    }

    try {
      const request = pool.request();

      // Build parameterized IN clause for invoice codes
      const placeholders = invoiceCodes.map((_, idx) => `@invoiceCode${idx}`).join(',');
      invoiceCodes.forEach((code, idx) => {
        request.input(`invoiceCode${idx}`, sql.Int, code);
      });

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
            DiscountAmount,
            CostPrice,
            GrnDate
        FROM invoicedetails
        WHERE InvoiceCode IN (${placeholders})
        ORDER BY InvoiceCode ASC, InvDetailID ASC
      `;

      const result = await request.query(query);
      console.log(`${this.branchTag} [FETCH] Fetched ${result.recordset.length} invoice details`);

      // Build map: invoiceCode -> [details]
      const detailsMap = {};
      result.recordset.forEach((detail) => {
        if (!detailsMap[detail.InvoiceCode]) {
          detailsMap[detail.InvoiceCode] = [];
        }
        detailsMap[detail.InvoiceCode].push(detail);
      });

      return detailsMap;
    } catch (error) {
      console.error(`${this.branchTag} [FETCH] Error fetching invoice details:`, error.message);
      throw error;
    }
  }

  normalizeInvoiceRow(row) {
    if (!row) return null;

    return {
      invoiceNo: Number(row.InvoiceNo),
      invoiceSerialNo: Number(row.InvoiceSerialNo),
      refNo: row.RefNo || null,
      invoiceDate: row.InvoiceDate ? row.InvoiceDate.toISOString().slice(0, 10) : null,
      invoiceTime: row.InvoiceTime ? row.InvoiceTime.toISOString() : null,
      customerCode: row.CustomerCode || null,
      locationCode: row.LocationCode || null,
      grossSale: Number(row.GrossSale || 0),
      vat: Number(row.VAT || 0),
      discount: Number(row.Discount || 0),
      netSale: Number(row.NetSale || 0),
      invoiceType: row.InvoiceType || null,
      tillId: Number(row.TillID || 0),
      payMethod1: row.PayMethod1 || null,
      tenAmt1: Number(row.TenAmt1 || 0),
      chqNo1: row.ChqNo1 || null,
      payMethod2: row.PayMethod2 || null,
      tenAmt2: Number(row.TenAmt2 || 0),
      chqNo2: row.ChqNo2 || null,
      userName: row.UserName || null,
      priceTypeCode: row.PriceTypeCode || null,
      repCode: row.RepCode || null,
      uploadStatus: row.UploadStatus || null,
      customerDetails: row.CustomerDetails || null,
      cashSaleNo: Number(row.CashSaleNo || 0),
      levyAmount: Number(row.LevyAmount || 0),
      reserved: row.Reserved || null,
      discountAmount: Number(row.DiscountAmount || 0),
      fiscalReceiptNo: row.FiscalReceiptNo || null,
      bankCode: row.BankCode || null,
      bankName: row.Bank_Name || null,
      bankCardHolder: row.Bank_CARD_HOLDER || null,
      bankCardNo: row.Bank_CARD_NO || null,
      bankCardExpiry: row.Bank_CARD_EXPIARY || null,
      quoteNo: row.QuoteNo || null,
    };
  }

  normalizeDetailRow(row) {
    if (!row) return null;

    return {
      invDetailId: Number(row.InvDetailID),
      invoiceCode: Number(row.InvoiceCode),
      productCode: row.ProductCode || null,
      productName: row.ProductName || null,
      qty: Number(row.Qty || 0),
      priceTypeCode: row.PriceTypeCode || null,
      unitPrice: Number(row.UnitPrice || 0),
      bulkPrice: Number(row.BulkPrice || 0),
      discount: Number(row.Discount || 0),
      discountAmount: Number(row.DiscountAmount || 0),
      amount: Number(row.Amount || 0),
      startSerialNo: row.StartSerialNo || null,
      endSerialNo: row.EndSerialNo || null,
      taxRate: Number(row.TaxRate || 0),
      taxAmount: Number(row.TaxAmount || 0),
      fPrice: Number(row.FPrice || 0),
      uploadStatus: row.UploadStatus || null,
      locationCode: row.LocationCode || null,
      levyRate: Number(row.LevyRate || 0),
      levyAmount: Number(row.LevyAmount || 0),
      printed: row.Printed || null,
      subQty: Number(row.Sub_Qty || 0),
      costPrice: Number(row.CostPrice || 0),
      grnDate: row.GrnDate ? row.GrnDate.toISOString().slice(0, 10) : null,
    };
  }

  buildPayload(headers, detailsMap) {
    const invoices = headers.map((header) => {
      const normalized = this.normalizeInvoiceRow(header);
      const details = detailsMap[header.InvoiceNo] || [];

      return {
        ...normalized,
        details: details.map((d) => this.normalizeDetailRow(d)),
      };
    });

    const metadata = getSyncMetadata(this.config);

    return {
      ...metadata,
      invoices,
      invoiceCount: invoices.length,
      detailCount: Object.values(detailsMap).flat().length,
    };
  }

  async sendToBackend(payload) {
    try {
      if (!this.config.backend.baseUrl) {
        throw new Error('BACKEND_BASE_URL not configured');
      }

      const endpoint = this.config.reporting.backendReportingEndpoint || '/api/pos-sync/reporting/invoices';
      const fullUrl = `${this.config.backend.baseUrl}${endpoint}`;

      console.log(`${this.branchTag} [SEND] Posting ${payload.invoiceCount} invoices to ${endpoint}`);

      const response = await axios.post(fullUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-pos-secret': this.config.backend.apiToken,
          'x-branch-code': this.config.branch.branchCode,
          'x-sync-source-code': this.config.branch.syncSourceCode,
        },
        timeout: 60000,
      });

      if (response.data && response.data.success) {
        console.log(`${this.branchTag} [SEND] ✅ Backend acknowledged ${payload.invoiceCount} invoices`);
        return {
          success: true,
          invoiceCount: payload.invoiceCount,
          detailCount: payload.detailCount,
        };
      }

      throw new Error(`Backend returned success=false: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.error(`${this.branchTag} [SEND] ❌ Failed to send to backend:`, error.message);
      throw error;
    }
  }

  async syncBatch(pool, batchSize) {
    try {
      console.log(`${this.branchTag} [SYNC] Starting batch sync (batch size: ${batchSize})`);

      // Fetch invoice headers
      const headers = await this.fetchInvoiceHeaders(pool, batchSize);

      if (headers.length === 0) {
        console.log(`${this.branchTag} [SYNC] No new invoices to sync`);
        return {
          success: true,
          invoiceCount: 0,
          detailCount: 0,
          checkpoint: this.state.getLastSyncedInvoiceNo(),
        };
      }

      const invoiceCodes = headers.map((h) => h.InvoiceNo);

      // Fetch related invoice details
      const detailsMap = await this.fetchInvoiceDetails(pool, invoiceCodes);

      // Build payload
      const payload = this.buildPayload(headers, detailsMap);

      // Send to backend
      const sendResult = await this.sendToBackend(payload);

      // Update checkpoint only after successful backend acknowledgment
      const lastInvoiceNo = Math.max(...invoiceCodes);
      const saved = this.state.updateCheckpoint(lastInvoiceNo, headers.length);

      if (!saved) {
        console.warn(`${this.branchTag} [SYNC] ⚠️ Checkpoint save failed, but backend acknowledged sync`);
      }

      console.log(`${this.branchTag} [SYNC] ✅ Sync batch complete: ${headers.length} invoices, checkpoint=${lastInvoiceNo}`);

      return {
        success: true,
        invoiceCount: sendResult.invoiceCount,
        detailCount: sendResult.detailCount,
        checkpoint: lastInvoiceNo,
      };
    } catch (error) {
      console.error(`${this.branchTag} [SYNC] ❌ Batch sync failed:`, error.message);
      throw error;
    }
  }
}

module.exports = ReportingSyncService;
