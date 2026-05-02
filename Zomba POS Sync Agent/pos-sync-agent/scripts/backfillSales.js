/**
 * Sales Backfill CLI Script
 * Run manually to backfill historical sales data from POS to backend
 * 
 * Usage:
 *   node scripts/backfillSales.js
 *   npm run backfill:sales
 * 
 * Environment variables required (from .env):
 *   - BACKFILL_SALES_ENABLED=true
 *   - BACKFILL_SALES_FROM=2023-01-01
 *   - BACKFILL_SALES_TO=2026-04-28
 *   - BACKFILL_BATCH_SIZE=100
 *   - POS_DB_SERVER, POS_DB_NAME, POS_DB_USER, POS_DB_PASSWORD
 *   - BACKEND_URL, BACKEND_API_TOKEN
 *   - BRANCH_CODE, SYNC_SOURCE_CODE, POS_LOCATION_CODE
 */

require('dotenv').config();
const sql = require('mssql');
const axios = require('axios');
const { buildConfig, getSyncMetadata } = require('../lib/config');
const { getSubLocationByCode } = require('../lib/sub-locations');

// Build configuration
const appConfig = buildConfig();
const BRANCH_TAG = appConfig.branch.logPrefix || `[${appConfig.branch.branchCode} SYNC]`;

// SQL Server configuration
const sqlConfig = {
  user: appConfig.posDb.user,
  password: appConfig.posDb.password,
  server: appConfig.posDb.server,
  database: appConfig.posDb.database,
  connectionTimeout: appConfig.posDb.connectionTimeoutMs,
  requestTimeout: appConfig.posDb.requestTimeoutMs,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool;

async function initializePool() {
  if (!pool) {
    console.log(`${BRANCH_TAG} [BACKFILL] Connecting to SQL Server: ${appConfig.posDb.server}/${appConfig.posDb.database}`);
    pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    console.log(`${BRANCH_TAG} [BACKFILL] Connected to SQL Server`);
  }
  return pool;
}

async function getTableColumns(tableName) {
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

async function resolveInvoiceDetailsColumnSupport() {
  try {
    const invoiceDetailsColumns = await getTableColumns('invoicedetails');
    return {
      hasCostPrice: invoiceDetailsColumns.has('CostPrice'),
      hasGrnDate: invoiceDetailsColumns.has('GrnDate'),
    };
  } catch (error) {
    console.warn(`${BRANCH_TAG} [BACKFILL][WARN] Could not detect invoicedetails columns: ${error.message}`);
    return { hasCostPrice: false, hasGrnDate: false };
  }
}

async function resolveInvoiceQuoteNoSupport() {
  try {
    const invoiceColumns = await getTableColumns('invoice');
    return invoiceColumns.has('QuoteNo');
  } catch (error) {
    console.warn(`${BRANCH_TAG} [BACKFILL][WARN] Could not detect invoice.QuoteNo: ${error.message}`);
    return false;
  }
}

async function fetchHistoricalInvoiceHeaders(fromDate, toDate, batchSize = 100, lastInvoiceNo = 0) {
  const hasQuoteNo = await resolveInvoiceQuoteNoSupport();
  const request = pool.request();
  
  request.input('fromDate', sql.Date, fromDate);
  request.input('toDate', sql.Date, toDate);
  request.input('batchSize', sql.Int, batchSize);
  request.input('lastInvoiceNo', sql.Int, lastInvoiceNo);

  const quoteNoSelect = hasQuoteNo ? ',\n            QuoteNo' : '';

  // FIX: Use cursor-based pagination with WHERE InvoiceNo > @lastInvoiceNo
  // This prevents infinite loop by advancing through records
  const query = `
    SELECT TOP (@batchSize)
        InvoiceNo,
        InvoiceCode,
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
      AND InvoiceNo > @lastInvoiceNo
    ORDER BY InvoiceNo ASC
  `;

  const result = await request.query(query);
  console.log(`${BRANCH_TAG} [BACKFILL] Pulled ${result.recordset.length} invoices from POS (cursor: > ${lastInvoiceNo}, date range: ${fromDate} to ${toDate})`);

  return result.recordset || [];
}

async function fetchInvoiceDetails(invoiceCodes) {
  if (!invoiceCodes || invoiceCodes.length === 0) {
    return {};
  }

  const columnSupport = await resolveInvoiceDetailsColumnSupport();
  const request = pool.request();

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
  console.log(`${BRANCH_TAG} [BACKFILL] Fetched ${result.recordset.length} invoice details`);

  const detailsMap = {};
  result.recordset.forEach((detail) => {
    // FIX: Use InvoiceNo (display number) as key to match live reporting behavior
    // This ensures details are properly mapped to invoices
    if (!detailsMap[detail.InvoiceCode]) {
      detailsMap[detail.InvoiceCode] = [];
    }
    detailsMap[detail.InvoiceCode].push(detail);
  });

  return detailsMap;
}

function normalizeInvoiceRow(row) {
  if (!row) return null;

  const invoiceSubLocation = getSubLocationByCode(row.LocationCode);

  return {
    invoiceNo: Number(row.InvoiceNo),
    invoiceCode: Number(row.InvoiceCode),
    invoiceSerialNo: Number(row.InvoiceSerialNo),
    refNo: row.RefNo || null,
    invoiceDate: row.InvoiceDate instanceof Date ? row.InvoiceDate.toISOString() : row.InvoiceDate,
    invoiceTime: row.InvoiceTime || null,
    customerCode: row.CustomerCode || null,
    locationCode: row.LocationCode || appConfig.posDb.locationCode,
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
    syncSourceCode: appConfig.branch.syncSourceCode,
    branchCode: appConfig.branch.branchCode,
  };
}

function normalizeDetailRow(row) {
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
    locationCode: row.LocationCode || appConfig.posDb.locationCode,
    levyRate: Number(row.LevyRate) || 0,
    levyAmount: Number(row.LevyAmount) || 0,
    printed: row.Printed || null,
    subQty: Number(row.Sub_Qty) || 0,
    discountAmount: Number(row.DiscountAmount) || 0,
    costPrice: row.CostPrice ? Number(row.CostPrice) : null,
    grnDate: row.GrnDate ? (row.GrnDate instanceof Date ? row.GrnDate.toISOString() : row.GrnDate) : null,
  };
}

async function pushBatchToBackend(invoices, detailsMap) {
  const backendUrl = appConfig.backend.baseUrl;
  const apiToken = appConfig.backend.apiToken;
  const endpoint = appConfig.backfill.backendEndpoint;

  if (!backendUrl) {
    throw new Error('Backend URL not configured');
  }

  const payload = {
    invoices: invoices.map((inv) => ({
      ...inv,
      details: (detailsMap[inv.invoiceCode] || []).map(d => normalizeDetailRow(d)),
    })),
    metadata: getSyncMetadata(appConfig, {
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
          'x-branch-code': appConfig.branch.branchCode,
          'x-sync-source-code': appConfig.branch.syncSourceCode,
        },
        timeout: 120000,
      }
    );

    const responseData = response && response.data ? response.data : {};
    return {
      success: typeof responseData.success !== 'undefined' && responseData.success !== null ? responseData.success : true,
      synced: typeof responseData.synced !== 'undefined' && responseData.synced !== null ? responseData.synced : invoices.length,
      skipped: typeof responseData.skipped !== 'undefined' && responseData.skipped !== null ? responseData.skipped : 0,
      errors: Array.isArray(responseData.errors) ? responseData.errors : [],
    };
  } catch (error) {
    console.error(`${BRANCH_TAG} [BACKFILL] Error pushing batch to backend:`, error.message);
    throw error;
  }
}

async function runBackfill() {
  const backfillConfig = appConfig.backfill;
  
  if (!backfillConfig.enabled) {
    console.log(`${BRANCH_TAG} [BACKFILL] Backfill is disabled (BACKFILL_SALES_ENABLED=false)`);
    console.log(`${BRANCH_TAG} [BACKFILL] Set BACKFILL_SALES_ENABLED=true in .env to enable backfill`);
    return { success: true, message: 'Backfill disabled' };
  }

  if (!backfillConfig.fromDate || !backfillConfig.toDate) {
    console.error(`${BRANCH_TAG} [BACKFILL] ERROR: Backfill date range not configured`);
    console.error(`${BRANCH_TAG} [BACKFILL] Set BACKFILL_SALES_FROM and BACKFILL_SALES_TO in .env`);
    process.exit(1);
  }

  console.log(`${BRANCH_TAG} [SALES BACKFILL] ===========================================`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] Starting historical sales backfill`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] Date range: ${backfillConfig.fromDate} to ${backfillConfig.toDate}`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] Batch size: ${backfillConfig.batchSize || 100}`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] Backend: ${appConfig.backend.baseUrl}${backfillConfig.backendEndpoint}`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] ===========================================`);

  const fromDate = backfillConfig.fromDate;
  const toDate = backfillConfig.toDate;
  const batchSize = backfillConfig.batchSize || 100;

  let totalInvoicesPulled = 0;
  let totalInvoicesSynced = 0;
  let totalBatches = 0;
  let batchNumber = 1;
  let lastInvoiceNo = 0; // Cursor for pagination
  const maxBatches = 2; // Limit to 2 batches for testing

  while (true) {
    // FIX: Pass lastInvoiceNo cursor for proper pagination
    const invoices = await fetchHistoricalInvoiceHeaders(fromDate, toDate, batchSize, lastInvoiceNo);
    
    if (invoices.length === 0) {
      console.log(`${BRANCH_TAG} [SALES BACKFILL] No more invoices to process`);
      break;
    }

    totalInvoicesPulled += invoices.length;
    totalBatches++;

    if (totalBatches >= maxBatches) {
      console.log(`${BRANCH_TAG} [SALES BACKFILL] Stopping after ${maxBatches} batches for testing`);
      break;
    }

    const normalizedInvoices = invoices.map((inv) => normalizeInvoiceRow(inv));
    const invoiceCodes = invoices.map((inv) => Number(inv.InvoiceCode));
    const detailsMap = await fetchInvoiceDetails(invoiceCodes);

    console.log(`${BRANCH_TAG} [SALES BACKFILL] Pushing batch ${batchNumber}`);
    
    try {
      const result = await pushBatchToBackend(normalizedInvoices, detailsMap);
      totalInvoicesSynced += result.synced;
      console.log(`${BRANCH_TAG} [SALES BACKFILL] Batch ${batchNumber} completed: ${result.synced} synced, ${result.skipped} skipped`);
    } catch (error) {
      console.error(`${BRANCH_TAG} [SALES BACKFILL] Batch ${batchNumber} failed: ${error.message}`);
    }

    // FIX: Update cursor to last invoice number for next iteration
    lastInvoiceNo = Math.max(...invoices.map((inv) => Number(inv.InvoiceNo)));
    batchNumber++;

    if (batchNumber > 1000) {
      console.warn(`${BRANCH_TAG} [SALES BACKFILL] Reached safety limit of 1000 batches`);
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

  console.log(`${BRANCH_TAG} [SALES BACKFILL] ===========================================`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] Completed successfully`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] Invoices pulled: ${totalInvoicesPulled}`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] Invoices synced: ${totalInvoicesSynced}`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] Total batches: ${totalBatches}`);
  console.log(`${BRANCH_TAG} [SALES BACKFILL] ===========================================`);

  return summary;
}

async function main() {
  try {
    await initializePool();
    await runBackfill();
  } catch (error) {
    console.error(`${BRANCH_TAG} [BACKFILL] FATAL ERROR:`, error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log(`${BRANCH_TAG} [BACKFILL] Database connection closed`);
    }
  }
}

main();