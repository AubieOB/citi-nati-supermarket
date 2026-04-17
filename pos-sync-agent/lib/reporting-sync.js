const sql = require('mssql');
const axios = require('axios');
const { getSyncMetadata } = require('./config');

class ReportingSyncService {
  constructor(config, state) {
    this.config = config;
    this.state = state;
    this.branchTag = `[BRANCH:${config.branch.branchCode}|REPORTING]`;
    this.latestCostColumnConfig = null;
  }

  async getTableColumns(pool, tableName) {
    const request = pool.request();
    request.input('tableName', sql.VarChar(128), tableName);
    const result = await request.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION
    `);
    return new Set((result.recordset || []).map((row) => String(row.COLUMN_NAME || '').trim()));
  }

  async resolveLatestCostColumnConfig(pool) {
    if (this.latestCostColumnConfig) {
      return this.latestCostColumnConfig;
    }

    const [stockDetailsColumns, stocksColumns] = await Promise.all([
      this.getTableColumns(pool, 'stockdetails'),
      this.getTableColumns(pool, 'stocks'),
    ]);

    const pickFirst = (columns, candidates) => candidates.find((column) => columns.has(column)) || null;

    const costColumn = pickFirst(stockDetailsColumns, ['CostPrice', 'UnitCost', 'BuyingPrice', 'PurchasePrice', 'AvgCost']);
    const stockDateColumn = pickFirst(stocksColumns, ['GRNDate', 'GrnDate', 'ReceivedDate', 'StockDate', 'CreatedAt', 'CreatedOn', 'EntryDate', 'Date']);
    const stockRefColumn = pickFirst(stocksColumns, ['ReferenceNo', 'ReceiptReference', 'RefNo']);

    this.latestCostColumnConfig = {
      costExpr: costColumn ? `CAST(sd.${costColumn} AS decimal(18, 4))` : 'NULL',
      grnDateExpr: stockDateColumn ? `CAST(s.${stockDateColumn} AS datetime)` : 'NULL',
      grnReferenceExpr: stockRefColumn ? `CAST(s.${stockRefColumn} AS varchar(100))` : 'CAST(sd.GRNNo AS varchar(100))',
    };

    console.log(`${this.branchTag} [LATEST COST] Resolved POS columns`, {
      costColumn: costColumn || null,
      stockDateColumn: stockDateColumn || null,
      stockRefColumn: stockRefColumn || null,
    });

    return this.latestCostColumnConfig;
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

  async sendInvoicesToBackend(payload) {
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

  async fetchLatestProductCosts(pool) {
    const columnConfig = await this.resolveLatestCostColumnConfig(pool);
    const request = pool.request();
    request.input('LocationCode', sql.VarChar(10), this.config.posDb.locationCode);

    const query = `
      WITH ranked_costs AS (
        SELECT
          sd.ProductCode,
          pm.ProductName,
          s.LocationCode,
          CAST(sd.GRNNo AS varchar(100)) AS LatestGRNNo,
          ${columnConfig.grnReferenceExpr} AS LatestGRNReference,
          ${columnConfig.grnDateExpr} AS LatestGRNDate,
          ${columnConfig.costExpr} AS LatestUnitCost,
          CAST(sd.StockDetailID AS varchar(100)) AS StockDetailID,
          ROW_NUMBER() OVER (
            PARTITION BY sd.ProductCode
            ORDER BY
              CASE WHEN ${columnConfig.grnDateExpr} IS NULL THEN 1 ELSE 0 END ASC,
              ${columnConfig.grnDateExpr} DESC,
              CAST(sd.StockDetailID AS varchar(100)) DESC,
              sd.GRNNo DESC
          ) AS rn
        FROM POS.dbo.stockdetails sd
        INNER JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
        LEFT JOIN POS.dbo.productsmaster pm ON pm.ProductCode = sd.ProductCode
        WHERE s.LocationCode = @LocationCode
          AND sd.ProductCode IS NOT NULL
      )
      SELECT
        ProductCode,
        ProductName,
        LocationCode,
        LatestGRNNo,
        LatestGRNReference,
        LatestGRNDate,
        LatestUnitCost,
        StockDetailID
      FROM ranked_costs
      WHERE rn = 1
      ORDER BY ProductCode ASC
    `;

    const result = await request.query(query);
    const rows = (result.recordset || []).map((row) => ({
      productCode: row.ProductCode == null ? null : String(row.ProductCode).trim(),
      productName: row.ProductName == null ? null : String(row.ProductName).trim(),
      locationCode: row.LocationCode == null ? null : String(row.LocationCode).trim(),
      latestGrnNo: row.LatestGRNNo == null ? null : String(row.LatestGRNNo).trim(),
      latestGrnReference: row.LatestGRNReference == null ? null : String(row.LatestGRNReference).trim(),
      latestGrnDate: row.LatestGRNDate instanceof Date ? row.LatestGRNDate.toISOString() : (row.LatestGRNDate || null),
      latestUnitCost: row.LatestUnitCost == null ? null : Number(row.LatestUnitCost),
      stockDetailId: row.StockDetailID == null ? null : String(row.StockDetailID).trim(),
      sourceUpdatedAt: row.LatestGRNDate instanceof Date ? row.LatestGRNDate.toISOString() : (row.LatestGRNDate || null),
    })).filter((row) => row.productCode);

    console.log(`${this.branchTag} [LATEST COST] Fetched ${rows.length} latest product cost rows`);
    return rows;
  }

  async sendLatestProductCostsToBackend(latestProductCosts) {
    try {
      if (!this.config.backend.baseUrl) {
        throw new Error('BACKEND_BASE_URL not configured');
      }

      const endpoint = this.config.reporting.backendLatestProductCostEndpoint || '/api/pos-sync/reporting/latest-product-costs';
      const fullUrl = `${this.config.backend.baseUrl}${endpoint}`;
      const metadata = getSyncMetadata(this.config);
      const batchSize = 500;
      let sent = 0;

      for (let index = 0; index < latestProductCosts.length; index += batchSize) {
        const batch = latestProductCosts.slice(index, index + batchSize);
        console.log(`${this.branchTag} [LATEST COST] Posting batch ${Math.floor(index / batchSize) + 1} with ${batch.length} products to ${endpoint}`);

        const response = await axios.post(fullUrl, {
          ...metadata,
          latestProductCosts: batch,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'x-pos-secret': this.config.backend.apiToken,
            'x-branch-code': this.config.branch.branchCode,
            'x-sync-source-code': this.config.branch.syncSourceCode,
          },
          timeout: 60000,
        });

        if (!response.data || !response.data.success) {
          throw new Error(`Backend returned success=false: ${JSON.stringify(response.data)}`);
        }

        sent += batch.length;
      }

      return { success: true, productCount: sent };
    } catch (error) {
      console.error(`${this.branchTag} [LATEST COST] ❌ Failed to send to backend:`, error.message);
      throw error;
    }
  }

  async syncBatch(pool, batchSize) {
    try {
      console.log(`${this.branchTag} [SYNC] Starting batch sync (batch size: ${batchSize})`);

      let invoiceCount = 0;
      let detailCount = 0;
      let checkpoint = this.state.getLastSyncedInvoiceNo();

      // Fetch invoice headers
      const headers = await this.fetchInvoiceHeaders(pool, batchSize);

      if (headers.length === 0) {
        console.log(`${this.branchTag} [SYNC] No new invoices to sync`);
      } else {
        const invoiceCodes = headers.map((h) => h.InvoiceNo);

        // Fetch related invoice details
        const detailsMap = await this.fetchInvoiceDetails(pool, invoiceCodes);

        // Build payload
        const payload = this.buildPayload(headers, detailsMap);

        // Send to backend
        const sendResult = await this.sendInvoicesToBackend(payload);

        // Update checkpoint only after successful backend acknowledgment
        const lastInvoiceNo = Math.max(...invoiceCodes);
        const saved = this.state.updateCheckpoint(lastInvoiceNo, headers.length);

        if (!saved) {
          console.warn(`${this.branchTag} [SYNC] ⚠️ Checkpoint save failed, but backend acknowledged sync`);
        }

        checkpoint = lastInvoiceNo;
        invoiceCount = sendResult.invoiceCount;
        detailCount = sendResult.detailCount;
      }

      const latestProductCosts = await this.fetchLatestProductCosts(pool);
      const latestCostResult = await this.sendLatestProductCostsToBackend(latestProductCosts);

      console.log(`${this.branchTag} [SYNC] ✅ Sync batch complete: ${invoiceCount} invoices, ${latestCostResult.productCount} latest cost rows, checkpoint=${checkpoint}`);

      return {
        success: true,
        invoiceCount,
        detailCount,
        latestProductCostCount: latestCostResult.productCount,
        checkpoint,
      };
    } catch (error) {
      console.error(`${this.branchTag} [SYNC] ❌ Batch sync failed:`, error.message);
      throw error;
    }
  }
}

module.exports = ReportingSyncService;
