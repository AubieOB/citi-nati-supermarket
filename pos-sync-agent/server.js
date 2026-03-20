require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const axios = require('axios');

// Import modules for POS write-back
const transactionManager = require('./lib/transaction-manager');
const invoiceWriteback = require('./lib/invoice-writeback');
const stockUpdates = require('./lib/stock-updates');
const priceUpdates = require('./lib/price-updates');
const commandQueueClient = require('./lib/command-queue-client');
const commandExecutor = require('./lib/command-executor');

const app = express();
app.use(express.json());

const ENABLE_DIRECT_WRITEBACK_DEBUG = process.env.ENABLE_DIRECT_POS_WRITEBACK_DEBUG === 'true';
const SQL_SERVER = process.env.DB_SERVER || 'localhost';
const SQL_DATABASE = process.env.DB_NAME || process.env.DB_DATABASE || 'POS';
const SQL_USER = process.env.DB_USER || '';

// SQL Server configuration
const sqlConfig = {
  user: SQL_USER,
  password: process.env.DB_PASSWORD,
  server: SQL_SERVER,
  database: SQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true, // needed for local SQL Server
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Connection pool
let pool;

/** Initialize SQL connection pool */
async function initializePool() {
  if (!pool) {
    try {
      console.log(`[DB CONFIG] SQL user: ${SQL_USER || '(not set)'}`);
      console.log(`[DB CONFIG] SQL server: ${SQL_SERVER}`);
      console.log(`[DB CONFIG] SQL database: ${SQL_DATABASE}`);
      pool = new sql.ConnectionPool(sqlConfig);
      await pool.connect();
      console.log('Connected to SQL Server');
    } catch (err) {
      console.error('[DB CONFIG ERROR] Failed to connect to SQL Server with configured credentials');
      console.error('Failed to create connection pool:', err.message);
      throw err;
    }
  }
  return pool;
}

/** Middleware: API Key Validation */
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-pos-secret'];
  if (!apiKey || apiKey !== process.env.POS_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API key' });
  }
  next();
}

/** Send products to live server API endpoint - with batching for large datasets */
async function sendProductsToLiveServer(products) {
  try {
    if (!process.env.LIVE_SERVER_URL) {
      console.error('[POS SYNC] ERROR: LIVE_SERVER_URL not configured in .env');
      return { success: false, error: 'LIVE_SERVER_URL not configured' };
    }

    console.log(`[POS SYNC] Sending ${products.length} products to live server (batching)...`);

    // Batch size to avoid payload too large errors - reduced for faster processing
    const BATCH_SIZE = 100;
    const batches = [];

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      batches.push(products.slice(i, i + BATCH_SIZE));
    }

    console.log(`[POS SYNC] Split into ${batches.length} batches of up to ${BATCH_SIZE} products`);

    let totalSynced = 0;
    let totalErrors = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[POS SYNC] Sending batch ${batchIndex + 1}/${batches.length} (${batch.length} products)...`);

      try {
        const response = await axios.post(
          `${process.env.LIVE_SERVER_URL}/api/products/pos-sync/push`,
          {
            products: batch.map(p => ({
              sourceCode: p.ProductCode,
              name: p.ProductName,
              price: p.SellingPrice,
              stock: p.QuantityAvailable,
              barcode: p.Barcode || '',
              category: p.CategoryName || 'Uncategorized',
              expiryDate: p.ExpiryDate ? (p.ExpiryDate instanceof Date ? p.ExpiryDate.toISOString() : p.ExpiryDate) : null,
              expirySource: p.ExpirySource || null,
            })),
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-pos-secret': process.env.POS_SECRET,
            },
            timeout: 120000,
          }
        );

        if (response.data.success) {
          totalSynced += response.data.synced || batch.length;
          console.log(`[POS SYNC] ✅ Batch ${batchIndex + 1} sent successfully`);
        }
      } catch (batchError) {
        totalErrors++;
        console.error(`[POS SYNC] ❌ Batch ${batchIndex + 1} failed:`, batchError.message);
      }
    }

    const summary = {
      success: totalErrors === 0,
      totalProducts: products.length,
      batchesSent: batches.length,
      batchesFailed: totalErrors,
      totalSynced,
    };

    console.log(`[POS SYNC] ✅ Sync complete:`, summary);
    return summary;
  } catch (error) {
    console.error('[POS SYNC] ❌ Failed to send products to live server:');
    console.error(error.message);
    return { success: false, error: error.message };
  }
}

function rejectDirectWritebackInProduction(req, res, next) {
  if (ENABLE_DIRECT_WRITEBACK_DEBUG) {
    return next();
  }

  return res.status(410).json({
    success: false,
    error: 'Direct write-back endpoint is DEBUG_ONLY. Production uses command queue polling.',
  });
}

/** Fetch products from POS with category information */
async function fetchProductsFromPOS() {
  try {
    if (!pool) await initializePool();

    // Get location code from environment or default to 'SH'
    const LOCATION_CODE = process.env.POS_LOCATION_CODE || 'SH';

    // REAL-TIME STOCK + PRICE
    // Stock = SUM(QtyIn) - SUM(QtyOut) from ProductActivity
    // Price = Most recent FPrice from productprices (by PriceID DESC = latest record)
    const query = `
      SELECT 
          p.ProductCode,
          p.ProductName,
          ISNULL(p.Barcode,'') AS Barcode,
          ISNULL(pt.ProductTypeName, 'General') AS CategoryName,
          ISNULL(SUM(pa.QtyIn), 0) - ISNULL(SUM(pa.QtyOut), 0) AS QuantityAvailable,
          ISNULL(
              (SELECT TOP 1 FPrice FROM POS.dbo.productprices WHERE ProductCode = p.ProductCode AND LocationCode = @LocationCode ORDER BY PriceID DESC),
              (SELECT TOP 1 FPrice FROM POS.dbo.productprices WHERE ProductCode = p.ProductCode ORDER BY PriceID DESC)
          ) AS SellingPrice
      FROM POS.dbo.productsmaster p
      LEFT JOIN POS.dbo.producttypes pt ON p.ProductTypeCode = pt.ProductTypeCode
      LEFT JOIN POS.dbo.ProductActivity pa ON p.ProductCode = pa.ProductCode AND pa.LocationCode = @LocationCode
      GROUP BY p.ProductCode, p.ProductName, p.Barcode, pt.ProductTypeName
      ORDER BY p.ProductCode
    `;

    const request = pool.request();
    request.input('LocationCode', sql.VarChar(10), LOCATION_CODE);
    const result = await request.query(query);
    
    console.log(`[POS FETCH] ✅ Fetched ${result.recordset.length} products from location: ${LOCATION_CODE}`);
    console.log(`[POS FETCH] Stock: SUM(QtyIn) - SUM(QtyOut)`);
    console.log(`[POS FETCH] Price: Most recent FPrice (by PriceID DESC)`);
    
    // Debug log first 5 products
    if (result.recordset.length > 0) {
      console.log(`[POS FETCH] Sample products:`);
      result.recordset.slice(0, 5).forEach(product => {
        console.log(`  - ${product.ProductCode}: ${product.ProductName} | Stock: ${product.QuantityAvailable} | Price: ${product.SellingPrice}`);
      });
    }

    // Enrich each product with expiry data from the same SQL Server
    const expiryMap = await buildExpiryMapFromPOS();
    let enrichedWithExpiry = 0;
    const enrichedRecords = result.recordset.map(product => {
      const code = String(product.ProductCode || '').trim();
      const expiry = expiryMap.get(code);
      if (expiry) enrichedWithExpiry++;
      return {
        ...product,
        ExpiryDate: expiry ? expiry.expiryDate : null,
        ExpirySource: expiry ? expiry.source : null,
      };
    });
    console.log(`[POS FETCH][EXPIRY] products enriched with expiry=${enrichedWithExpiry}`);
    const sampleEnriched = enrichedRecords.find(p => p.ExpiryDate);
    if (sampleEnriched) {
      const daysToExpiry = Math.round((sampleEnriched.ExpiryDate - new Date()) / (1000 * 60 * 60 * 24));
      console.log(`[POS FETCH][EXPIRY] sample enriched product:`, {
        productCode: sampleEnriched.ProductCode,
        expiryDate: sampleEnriched.ExpiryDate.toISOString().slice(0, 10),
        daysToExpiry,
        expirySource: sampleEnriched.ExpirySource,
      });
    }

    return enrichedRecords;
  } catch (err) {
    console.error('[POS FETCH] Error fetching products:', err.message);
    return [];
  }
}

/**
 * Builds a Map<ProductCode, { expiryDate: Date, source: string }> from SQL Server.
 * Primary: stockdetails (stock movement source of truth)
 * Fallback: vw_WillExpire_Products
 * Business rule: for each ProductCode, pick the LATEST expiry date among rows
 * that have positive remaining stock. "Latest" = newest batch currently on shelf.
 * Never fall back to stale historical expired rows if active stock exists.
 */
async function buildExpiryMapFromPOS() {
  try {
    if (!pool) await initializePool();
    const locationCode = process.env.POS_LOCATION_CODE || 'SH';
    const result = await fetchExpiryCandidates({
      days: 3650,
      locationCode,
      includeExpired: true,  // fetch all so we can apply our own selection rule
      source: 'stockdetails',
      productCodes: [],
    });
    const source = result.source;
    const rows = result.products || [];
    console.log(`[POS FETCH][EXPIRY] expiry rows fetched: count=${rows.length}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const MIN_DATE = new Date('2000-01-01T00:00:00.000Z');

    // Group by ProductCode — only keep rows with valid dates
    const grouped = new Map();
    for (const row of rows) {
      const code = String(row.ProductCode || '').trim();
      if (!code || !row.ExpiryDate) continue;
      const d = new Date(row.ExpiryDate);
      if (isNaN(d.getTime()) || d < MIN_DATE) continue;
      if (!grouped.has(code)) grouped.set(code, []);
      grouped.get(code).push(row);
    }
    console.log(`[POS FETCH][EXPIRY] grouped products: ${grouped.size}`);

    const expiryMap = new Map();
    let totalSkipped = 0;

    const toGrnRank = (value) => {
      if (value == null) return Number.MIN_SAFE_INTEGER;
      const parsed = Number(String(value).trim());
      return Number.isFinite(parsed) ? parsed : Number.MIN_SAFE_INTEGER;
    };

    for (const [code, entries] of grouped.entries()) {
      // Keep only rows with positive remaining stock (active batches)
      const activeRows = entries.filter(
        e => e.RemainingQty != null && e.RemainingQty > 0
      );

      const skippedCount = entries.length - activeRows.length;
      totalSkipped += skippedCount;

      if (activeRows.length === 0) {
        // No active stock at all — skip this product entirely
        continue;
      }

      // Sort by latest stock add first (GRNNo DESC), expiry date DESC as tie-breaker.
      activeRows.sort((a, b) => {
        const grnDiff = toGrnRank(b.LatestGRNNo) - toGrnRank(a.LatestGRNNo);
        if (grnDiff !== 0) return grnDiff;
        return new Date(b.ExpiryDate) - new Date(a.ExpiryDate);
      });
      const chosen = activeRows[0];
      const chosenDate = new Date(chosen.ExpiryDate);

      expiryMap.set(code, { expiryDate: chosenDate, source });

      if (expiryMap.size <= 3) {
        console.log(`[POS FETCH][EXPIRY] selected latest stock-add row: productCode=${code} grnNo=${chosen.LatestGRNNo || 'n/a'} expiryDate=${chosenDate.toISOString().slice(0,10)} activeRows=${activeRows.length} skipped=${skippedCount}`);
      }
    }

    console.log(`[POS FETCH][EXPIRY] expiry map size=${expiryMap.size}`);
    console.log(`[POS FETCH][EXPIRY] skipped historical rows count=${totalSkipped}`);
    return expiryMap;
  } catch (err) {
    console.error('[POS FETCH][EXPIRY] buildExpiryMapFromPOS failed:', err.message);
    return new Map();
  }
}

function normalizeExpirySource(value) {
  return String(value || 'view').toLowerCase() === 'stockdetails' ? 'stockdetails' : 'view';
}

function normalizeExpiryDays(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 14;
}

function normalizeLocationCode(value) {
  const normalized = String(value || process.env.POS_LOCATION_CODE || 'SH').trim().toUpperCase();
  return normalized || 'SH';
}

function normalizeBooleanFlag(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value == null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeExpiryIncludeExpired(query) {
  if (query.includeExpired != null) {
    return normalizeBooleanFlag(query.includeExpired, false);
  }

  if (query.filter != null) {
    return String(query.filter).toLowerCase() === 'expired';
  }

  return false;
}

function summarizeExpiryRequest(query) {
  const rawProductCodes = query.productCodesCsv || query.productCodes;
  return {
    days: query.days,
    locationCode: query.locationCode,
    includeExpired: query.includeExpired,
    source: query.source,
    filter: query.filter,
    productCodes: rawProductCodes,
  };
}

function normalizeExpiryProductCodes(value) {
  if (value == null || value === '') {
    return [];
  }

  const values = Array.isArray(value)
    ? value
    : String(value).split(',');

  return Array.from(new Set(values
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
}

function validateExpiryRequest(query) {
  const requested = summarizeExpiryRequest(query);
  const normalized = {
    days: normalizeExpiryDays(query.days),
    locationCode: normalizeLocationCode(query.locationCode),
    includeExpired: normalizeExpiryIncludeExpired(query),
    source: normalizeExpirySource(query.source),
    productCodes: normalizeExpiryProductCodes(query.productCodesCsv || query.productCodes),
  };

  const issues = [];
  if (requested.days != null && String(requested.days) !== String(normalized.days)) {
    issues.push(`days normalized to ${normalized.days}`);
  }
  if (requested.locationCode != null && String(requested.locationCode).trim().toUpperCase() !== normalized.locationCode) {
    issues.push(`locationCode normalized to ${normalized.locationCode}`);
  }
  if (requested.includeExpired != null && normalizeBooleanFlag(requested.includeExpired, normalized.includeExpired) !== normalized.includeExpired) {
    issues.push(`includeExpired normalized to ${normalized.includeExpired}`);
  }
  if (requested.source != null && requested.source !== normalized.source) {
    issues.push(`source normalized to ${normalized.source}`);
  }

  return {
    valid: issues.length === 0,
    requested,
    normalized,
    issues,
  };
}

function summarizePromotionRequest(body) {
  const promotionalPrice = body.promotionalPrice != null ? body.promotionalPrice : body.promoPrice;
  const restorePrice = body.restorePrice != null ? body.restorePrice : body.originalPrice;

  return {
    productCode: body.productCode,
    promotionalPrice,
    restorePrice,
    locationCode: body.locationCode,
    priceTypeCode: body.priceTypeCode,
    reasonCode: body.reasonCode,
    updatePromotionalFlag: body.updatePromotionalFlag === true,
  };
}

function pickFirstValue(row, candidates) {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return null;
}

function toIsoDateOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function mapExpiryRow(row, fallbackLocationCode) {
  const expiryDate = pickFirstValue(row, ['ExpiryDate', 'expiryDate']);
  const remainingQty = pickFirstValue(row, [
    'RemainingQty',
    'remainingQty',
    'Quantity',
    'quantity',
    'StockBalance',
    'AvailableStock',
    'StockQty',
  ]);

  return {
    ProductCode: pickFirstValue(row, ['ProductCode', 'productCode']),
    ExpiryDate: toIsoDateOrNull(expiryDate),
    RemainingQty: remainingQty == null ? null : Number(remainingQty),
    LatestGRNNo: pickFirstValue(row, ['LatestGRNNo', 'latestGRNNo', 'GRNNo', 'grnNo']),
    ProductName: pickFirstValue(row, ['ProductName', 'productName', 'Description', 'description']),
    locationCode: pickFirstValue(row, ['LocationCode', 'locationCode']) || fallbackLocationCode,
    currentPrice: (() => {
      const value = pickFirstValue(row, ['FPrice', 'CurrentPrice', 'SellingPrice', 'currentPrice']);
      return value == null ? null : Number(value);
    })(),
    priceTypeCode: pickFirstValue(row, ['PriceTypeCode', 'priceTypeCode']),
    promoStatus: pickFirstValue(row, ['Promotional', 'promoStatus', 'PromotionStatus', 'IsPromotional']),
  };
}

async function fetchExpiryCandidates({ days, locationCode, includeExpired, source, productCodes }) {
  if (!pool) {
    await initializePool();
  }

  const safeSource = normalizeExpirySource(source);
  const safeDays = normalizeExpiryDays(days);
  const safeLocationCode = normalizeLocationCode(locationCode);
  const safeIncludeExpired = normalizeBooleanFlag(includeExpired, false);
  const safeProductCodes = normalizeExpiryProductCodes(productCodes);
  const productCodesCsv = safeProductCodes.length > 0 ? safeProductCodes.join(',') : null;
  const request = pool.request();
  request.input('MinValidDate', sql.Date, new Date('2000-01-01T00:00:00.000Z'));
  request.input('ExpiryDays', sql.Int, safeDays);
  request.input('LocationCode', sql.VarChar(10), safeLocationCode);
  // Only add STRING_SPLIT filter when there are actual product codes to filter by.
  // STRING_SPLIT requires SQL Server 2016+ (compat level 130); omitting it when
  // the list is empty avoids a compile-time error on older instances.
  if (productCodesCsv) {
    request.input('ProductCodesCsv', sql.NVarChar(sql.MAX), productCodesCsv);
  }

  const buildProductCodeFilter = (alias) => {
    if (!productCodesCsv) return '';
    return `
       AND LTRIM(RTRIM(CAST(${alias}.ProductCode AS NVARCHAR(100)))) IN (
         SELECT LTRIM(RTRIM(value))
         FROM STRING_SPLIT(@ProductCodesCsv, ',')
       )`;
  };

  const rangeClause = safeIncludeExpired
    ? `ExpiryDate >= @MinValidDate`
    : `ExpiryDate >= @MinValidDate
       AND ExpiryDate >= CAST(GETDATE() AS date)
       AND ExpiryDate < DATEADD(DAY, @ExpiryDays, CAST(GETDATE() AS date))`;

  const stockDetailsQuery = `
      SELECT
        sd.ProductCode,
        sd.ExpiryDate,
        MAX(sd.GRNNo) AS LatestGRNNo,
        SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0)) AS RemainingQty
      FROM POS.dbo.stockdetails sd
      WHERE ${rangeClause}
        AND sd.ExpiryDate IS NOT NULL
        ${buildProductCodeFilter('sd')}
      GROUP BY sd.ProductCode, sd.ExpiryDate
      HAVING SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0)) > 0
      ORDER BY sd.ExpiryDate ASC, sd.ProductCode ASC
    `;

  const viewQuery = `
      SELECT *
      FROM POS.dbo.vw_WillExpire_Products vw
      WHERE ${rangeClause}
        AND vw.ExpiryDate IS NOT NULL
        ${buildProductCodeFilter('vw')}
      ORDER BY vw.ExpiryDate ASC
    `;

  const query = safeSource === 'stockdetails'
    ? `
      ${stockDetailsQuery}
    `
    : viewQuery;

  let result;
  let resolvedSource = safeSource;

  try {
    result = await request.query(query);
    if (safeSource !== 'stockdetails' && (!result.recordset || result.recordset.length === 0)) {
      console.warn('[EXPIRY] primary vw_WillExpire_Products returned 0 rows, falling back to stockdetails');
      const fallbackRequest = pool.request();
      fallbackRequest.input('MinValidDate', sql.Date, new Date('2000-01-01T00:00:00.000Z'));
      fallbackRequest.input('ExpiryDays', sql.Int, safeDays);
      fallbackRequest.input('LocationCode', sql.VarChar(10), safeLocationCode);
      if (productCodesCsv) {
        fallbackRequest.input('ProductCodesCsv', sql.NVarChar(sql.MAX), productCodesCsv);
      }
      result = await fallbackRequest.query(stockDetailsQuery);
      resolvedSource = 'stockdetails';
    }
  } catch (error) {
    if (safeSource !== 'stockdetails') {
      console.warn('[EXPIRY] primary vw_WillExpire_Products query failed, falling back to stockdetails:', error.message);
      const fallbackRequest = pool.request();
      fallbackRequest.input('MinValidDate', sql.Date, new Date('2000-01-01T00:00:00.000Z'));
      fallbackRequest.input('ExpiryDays', sql.Int, safeDays);
      fallbackRequest.input('LocationCode', sql.VarChar(10), safeLocationCode);
      if (productCodesCsv) {
        fallbackRequest.input('ProductCodesCsv', sql.NVarChar(sql.MAX), productCodesCsv);
      }
      result = await fallbackRequest.query(stockDetailsQuery);
      resolvedSource = 'stockdetails';
    } else {
      throw error;
    }
  }

  const products = (result.recordset || [])
    .map((row) => mapExpiryRow(row, safeLocationCode))
    .filter((row) => row.ProductCode && row.ExpiryDate)
    .filter((row) => !row.ExpiryDate.startsWith('1900-01-01'))
    .filter((row) => row.RemainingQty == null || row.RemainingQty > 0);

  console.log(`[EXPIRY] fetched ${products.length} expiry rows within ${safeDays} days from ${resolvedSource} (includeExpired=${safeIncludeExpired}, productCodes=${safeProductCodes.length})`);

  return {
    days: safeDays,
    locationCode: safeLocationCode,
    includeExpired: safeIncludeExpired,
    source: resolvedSource,
    products,
    sql: {
      primary: safeSource === 'stockdetails' ? stockDetailsQuery.trim() : viewQuery.trim(),
      fallback: stockDetailsQuery.trim(),
    },
  };
}

/**
 * Manual endpoint: fetch and sync products
 */
app.get('/pos-sync/products', validateApiKey, async (req, res) => {
  try {
    console.log('[POS SYNC] /pos-sync/products endpoint called');
    
    const products = await fetchProductsFromPOS();
    console.log(`[POS SYNC] Fetched ${products.length} products from Global POS`);

    if (!products || products.length === 0) {
      return res.json({
        success: true,
        count: 0,
        data: [],
        message: 'No products found',
      });
    }

    // Send to live server
    const syncResult = await sendProductsToLiveServer(products);

    res.json({
      success: true,
      count: products.length,
      data: products,
      syncResult: syncResult,
    });
  } catch (err) {
    console.error('[POS SYNC] Error in /pos-sync/products:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /pos-sync/expiry-products
 * Fetch expired or near-expiry products from POS.
 * Query params:
 *   filter=expired|expiring
 *   days=7|14|30
 *   source=view|stockdetails
 */
app.get('/pos-sync/expiry-products', validateApiKey, async (req, res) => {
  try {
    const validation = validateExpiryRequest(req.query);
    console.log('[EXPIRY] /expiry-products request received');
    console.log('[EXPIRY] params', {
      days: validation.requested.days,
      locationCode: validation.requested.locationCode,
      includeExpired: validation.requested.includeExpired,
      source: validation.requested.source,
      filter: validation.requested.filter,
    });

    if (validation.valid) {
      console.log('[EXPIRY] /expiry-products validation success:', validation.normalized);
    } else {
      console.warn('[EXPIRY] /expiry-products validation fallback:', {
        issues: validation.issues,
        normalized: validation.normalized,
      });
    }

    console.log('[EXPIRY] DB query start');
    const result = await fetchExpiryCandidates(validation.normalized);
    console.log('[EXPIRY] DB query success count', result.products.length);

    return res.json({
      success: true,
      days: result.days,
      locationCode: result.locationCode,
      includeExpired: result.includeExpired,
      source: result.source,
      count: result.products.length,
      productCodesCount: validation.normalized.productCodes.length,
      data: result.products,
    });
  } catch (err) {
    console.error('[EXPIRY] /expiry-products DB query failed:', err.message);
    console.error('[EXPIRY] Error in /pos-sync/expiry-products:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch expiry products',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * DEBUG: Check producttypes table columns
 */
app.get('/debug/producttypes-columns', validateApiKey, async (req, res) => {
  try {
    if (!pool) await initializePool();

    const columnsQuery = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'producttypes' AND TABLE_SCHEMA = 'dbo'
      ORDER BY ORDINAL_POSITION
    `;

    const columnsResult = await pool.request().query(columnsQuery);
    const columns = columnsResult.recordset.map(r => r.COLUMN_NAME);

    const dataQuery = `SELECT TOP 5 * FROM POS.dbo.producttypes`;
    const dataResult = await pool.request().query(dataQuery);

    res.json({
      success: true,
      columns: columns,
      sampleData: dataResult.recordset,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * DEBUG: Check stockdetails table columns
 */
app.get('/debug/stockdetails-columns', validateApiKey, async (req, res) => {
  try {
    if (!pool) await initializePool();

    const columnsQuery = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'stockdetails' AND TABLE_SCHEMA = 'dbo'
      ORDER BY ORDINAL_POSITION
    `;

    const columnsResult = await pool.request().query(columnsQuery);
    const columns = columnsResult.recordset.map(r => r.COLUMN_NAME);

    const dataQuery = `SELECT TOP 5 * FROM POS.dbo.stockdetails`;
    const dataResult = await pool.request().query(dataQuery);

    res.json({
      success: true,
      columns: columns,
      sampleData: dataResult.recordset,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * DEBUG: Check stockinvoice or other stock tables for location info
 */
app.get('/debug/find-location-stock', validateApiKey, async (req, res) => {
  try {
    if (!pool) await initializePool();

    const LOCATION_CODE = process.env.POS_LOCATION_CODE || 'SH';

    // Check if stocks table (which had LocationCode) can be joined with stockdetails
    const query = `
      SELECT TOP 10
          s.LocationCode,
          s.GRNNo,
          sd.ProductCode,
          sd.StockQty,
          sd.StockOut
      FROM POS.dbo.stocks s
      INNER JOIN POS.dbo.stockdetails sd
          ON s.GRNNo = sd.GRNNo
      WHERE s.LocationCode = @LocationCode
    `;

    const request = pool.request();
    request.input('LocationCode', sql.VarChar(10), LOCATION_CODE);
    const result = await request.query(query);

    res.json({
      success: true,
      message: 'Stock with location info',
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /pos-sync/categories
 * Fetch all product categories/types
 */
app.get('/pos-sync/categories', validateApiKey, async (req, res) => {
  try {
    if (!pool) await initializePool();

    const query = `
      SELECT 
          ProductTypeCode,
          ProductTypeName AS CategoryName
      FROM POS.dbo.producttypes
      ORDER BY ProductTypeName
    `;

    const result = await pool.request().query(query);

    console.log(`[/pos-sync/categories] Fetched ${result.recordset.length} categories`);

    res.json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    console.error('Database query error:', err.message);
    console.error('Error details:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error: Failed to fetch categories',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * GET /pos-sync/stock-by-location
 * Fetch stock quantities by location (uses DailyStockBalance for real inventory)
 * Returns ProductCode, LocationCode, and current available stock
 */
app.get('/pos-sync/stock-by-location', validateApiKey, async (req, res) => {
  try {
    if (!pool) await initializePool();

    const LOCATION_CODE = process.env.POS_LOCATION_CODE || 'SH';

    const query = `
      SELECT 
          d.ProductCode,
          p.ProductName,
          d.LocationCode,
          d.StockBalance AS AvailableStock,
          d.StockDate
      FROM POS.dbo.DailyStockBalance d
      INNER JOIN POS.dbo.productsmaster p 
          ON d.ProductCode = p.ProductCode
      WHERE d.LocationCode = @LocationCode
      AND d.StockDate = (
          SELECT MAX(StockDate)
          FROM POS.dbo.DailyStockBalance
          WHERE LocationCode = @LocationCode
      )
      ORDER BY d.ProductCode
    `;

    const request = pool.request();
    request.input('LocationCode', sql.VarChar(10), LOCATION_CODE);
    const result = await request.query(query);

    console.log(`[/pos-sync/stock-by-location] Fetched stock for ${result.recordset.length} products at location ${LOCATION_CODE}`);

    res.json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    console.error('Database query error:', err.message);
    console.error('Error details:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error: Failed to fetch stock by location',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * ============================================================================
 * POS WRITE-BACK ENDPOINTS - INVOICE, STOCK, AND PRICE UPDATES
 * ============================================================================
 */

/**
 * POST /pos-sync/write-invoice
 * Write back invoice with items to POS database
 * 
 * Request body:
 * {
 *   "customerCode": "CUST001",
 *   "locationCode": "SH",
 *   "invoiceDate": "2026-03-10",
 *   "invoiceTime": "14:30",
 *   "items": [
 *     {
 *       "productCode": "PROD001",
 *       "productName": "Product Name",
 *       "qty": 2,
 *       "unitPrice": 100.00,
 *       "bulkPrice": 0,
 *       "discount": 0,
 *       "discountAmount": 0,
 *       "taxRate": 0.15,
 *       "taxAmount": 30.00,
 *       "isHidden": false
 *     }
 *   ],
 *   "grossSale": 230.00,
 *   "vat": 30.00,
 *   "discount": 0,
 *   "netSale": 230.00,
 *   "payMethod1": "CASH",
 *   "tenAmt1": 250.00,
 *   "userName": "CASHIER01",
 *   "priceTypeCode": "1"
 * }
 */
app.post('/pos-sync/write-invoice', validateApiKey, rejectDirectWritebackInProduction, async (req, res) => {
  try {
    console.log('[WRITEBACK] POST /pos-sync/write-invoice called');

    if (!pool) await initializePool();

    // Validate input
    const validation = transactionManager.validateInvoiceData(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid invoice data',
        errors: validation.errors,
      });
    }

    // Execute transaction
    const result = await transactionManager.executeTransaction(pool, async (request) => {
      // Validate stock availability before proceeding
      const stockValidation = await stockUpdates.validateStockAvailability(
        request,
        req.body.items,
        req.body.locationCode
      );

      if (!stockValidation.valid) {
        throw new Error(`Stock validation failed: ${stockValidation.errors.join(', ')}`);
      }

      // Write back invoice
      const invoiceResult = await invoiceWriteback.writeBackInvoice(request, req.body);

      // Update stock for all items
      await stockUpdates.updateStockForInvoiceItems(request, req.body.items, req.body.locationCode);

      return invoiceResult;
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to write invoice to POS',
        details: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Invoice written to POS successfully',
      invoiceCode: result.result.invoiceCode,
      cashSaleNo: result.result.cashSaleNo,
      itemCount: result.result.itemCount,
    });
  } catch (err) {
    console.error('[WRITEBACK] Error in /pos-sync/write-invoice:', err.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error: Failed to write invoice',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * POST /pos-sync/update-stock
 * Update stock for multiple products (e.g., stock adjustment)
 * 
 * Request body:
 * {
 *   "updates": [
 *     {
 *       "productCode": "PROD001",
 *       "locationCode": "SH",
 *       "qtyReduction": 5
 *     }
 *   ]
 * }
 */
app.post('/pos-sync/update-stock', validateApiKey, rejectDirectWritebackInProduction, async (req, res) => {
  try {
    console.log('[WRITEBACK] POST /pos-sync/update-stock called');

    if (!pool) await initializePool();

    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'updates must be a non-empty array',
      });
    }

    // Validate each update
    const errors = [];
    for (let i = 0; i < updates.length; i++) {
      const validation = transactionManager.validateStockData(updates[i]);
      if (!validation.valid) {
        errors.push(`Update ${i}: ${validation.errors.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock update data',
        errors,
      });
    }

    // Execute transaction
    const result = await transactionManager.executeTransaction(pool, async (request) => {
      const results = {
        successful: 0,
        failed: 0,
        failedItems: [],
      };

      for (const update of updates) {
        try {
          await stockUpdates.reduceStockOnSale(
            request,
            update.productCode,
            update.locationCode,
            update.qtyReduction
          );
          results.successful++;
        } catch (error) {
          console.error(`[STOCK UPDATE] Failed for ${update.productCode}:`, error.message);
          results.failed++;
          results.failedItems.push({
            productCode: update.productCode,
            error: error.message,
          });
        }
      }

      if (results.failed > 0) {
        throw new Error(`Failed to update ${results.failed} items`);
      }

      return results;
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update stock',
        details: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Stock updated successfully',
      successful: result.result.successful,
      failed: result.result.failed,
    });
  } catch (err) {
    console.error('[WRITEBACK] Error in /pos-sync/update-stock:', err.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error: Failed to update stock',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * POST /pos-sync/update-prices
 * Update prices for multiple products
 * 
 * Request body:
 * {
 *   "updates": [
 *     {
 *       "productCode": "PROD001",
 *       "newPrice": 125.50
 *     }
 *   ],
 *   "locationCode": "SH"
 * }
 */
app.post('/pos-sync/update-prices', validateApiKey, rejectDirectWritebackInProduction, async (req, res) => {
  try {
    console.log('[WRITEBACK] POST /pos-sync/update-prices called');

    if (!pool) await initializePool();

    const { updates, locationCode } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'updates must be a non-empty array',
      });
    }

    // Validate each update
    const errors = [];
    for (let i = 0; i < updates.length; i++) {
      const validation = transactionManager.validatePriceData(updates[i]);
      if (!validation.valid) {
        errors.push(`Update ${i}: ${validation.errors.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid price update data',
        errors,
      });
    }

    // Execute transaction
    const result = await transactionManager.executeTransaction(pool, async (request) => {
      return await priceUpdates.updateBulkPrices(request, updates, locationCode || 'SH');
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update prices',
        details: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Prices updated successfully',
      successful: result.result.successful,
      failed: result.result.failed,
    });
  } catch (err) {
    console.error('[WRITEBACK] Error in /pos-sync/update-prices:', err.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error: Failed to update prices',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * POST /pos-sync/apply-promotion
 * Apply promotional price to a product
 * 
 * Request body:
 * {
 *   "productCode": "PROD001",
 *   "promotionalPrice": 79.99,
 *   "locationCode": "SH"
 * }
 */
app.post('/pos-sync/apply-promotion', validateApiKey, async (req, res) => {
  try {
    console.log('[PROMO] /apply-promotion request received:', {
      endpoint: '/pos-sync/apply-promotion',
      body: summarizePromotionRequest(req.body),
    });

    if (!pool) await initializePool();

    const productCode = req.body.productCode;
    const promotionalPrice = Number(req.body.promotionalPrice != null ? req.body.promotionalPrice : req.body.promoPrice);
    const locationCode = req.body.locationCode;
    const priceTypeCode = req.body.priceTypeCode;
    const reasonCode = req.body.reasonCode;
    const updatePromotionalFlag = req.body.updatePromotionalFlag;

    if (!productCode || !Number.isFinite(promotionalPrice) || promotionalPrice <= 0) {
      console.warn('[PROMO] /apply-promotion validation failed:', {
        productCode,
        promotionalPrice,
      });
      return res.status(400).json({
        success: false,
        error: 'productCode and promotionalPrice (> 0) are required',
      });
    }

    console.log('[PROMO] /apply-promotion validation success:', {
      productCode,
      promotionalPrice,
      locationCode: locationCode || 'SH',
      priceTypeCode: priceTypeCode || 'RT',
      reasonCode: reasonCode || 'EXPIRY_CLEARANCE',
      updatePromotionalFlag: updatePromotionalFlag === true,
    });

    // Execute transaction
    console.log('[PROMO] /apply-promotion DB query start');
    const result = await transactionManager.executeTransaction(pool, async (request) => {
      return priceUpdates.applyPromotionalPrice(request, {
        productCode,
        promotionalPrice,
        locationCode: locationCode || 'SH',
        priceTypeCode: priceTypeCode || 'RT',
        reasonCode: reasonCode || 'EXPIRY_CLEARANCE',
        updatePromotionalFlag: updatePromotionalFlag === true,
      });
    });

    console.log('[PROMO] /apply-promotion DB query success:', {
      productCode: result?.result?.productCode,
      priceId: result?.result?.insertedRow?.priceId,
      locationCode: result?.result?.locationCode,
      priceTypeCode: result?.result?.priceTypeCode,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to apply promotion',
        details: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Promotion applied successfully',
      productCode: result.result.productCode,
      promotionalPrice: result.result.promotionalPrice,
      priceId: result.result.insertedRow.priceId,
      priceTypeCode: result.result.priceTypeCode,
      locationCode: result.result.locationCode,
    });
  } catch (err) {
    console.error('[PROMO] /apply-promotion DB query failed:', err.message);
    console.error('[WRITEBACK] Error in /pos-sync/apply-promotion:', err.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error: Failed to apply promotion',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * POST /pos-sync/revert-promotion
 * Revert product to standard price (disable promotion)
 * 
 * Request body:
 * {
 *   "productCode": "PROD001",
 *   "locationCode": "SH"
 * }
 */
app.post('/pos-sync/revert-promotion', validateApiKey, async (req, res) => {
  try {
    console.log('[PROMO] /revert-promotion request received:', {
      endpoint: '/pos-sync/revert-promotion',
      body: summarizePromotionRequest(req.body),
    });

    if (!pool) await initializePool();

    const productCode = req.body.productCode;
    const locationCode = req.body.locationCode;
    const priceTypeCode = req.body.priceTypeCode;
    const restorePriceValue = req.body.restorePrice != null ? req.body.restorePrice : req.body.originalPrice;
    const restorePrice = restorePriceValue == null ? null : Number(restorePriceValue);
    const reasonCode = req.body.reasonCode;
    const updatePromotionalFlag = req.body.updatePromotionalFlag;

    if (!productCode) {
      console.warn('[PROMO] /revert-promotion validation failed:', {
        productCode,
        restorePrice,
      });
      return res.status(400).json({
        success: false,
        error: 'productCode is required',
      });
    }

    if (restorePrice != null && (!Number.isFinite(restorePrice) || restorePrice <= 0)) {
      console.warn('[PROMO] /revert-promotion validation failed:', {
        productCode,
        restorePrice,
      });
      return res.status(400).json({
        success: false,
        error: 'restorePrice/originalPrice must be greater than 0 when provided',
      });
    }

    console.log('[PROMO] /revert-promotion validation success:', {
      productCode,
      locationCode: locationCode || 'SH',
      priceTypeCode: priceTypeCode || 'RT',
      restorePrice,
      reasonCode: reasonCode || 'EXPIRY_CLEARANCE',
      updatePromotionalFlag: updatePromotionalFlag === true,
    });

    // Execute transaction
    console.log('[PROMO] /revert-promotion DB query start');
    const result = await transactionManager.executeTransaction(pool, async (request) => {
      return priceUpdates.revertToStandardPrice(request, {
        productCode,
        locationCode: locationCode || 'SH',
        priceTypeCode: priceTypeCode || 'RT',
        restorePrice,
        reasonCode: reasonCode || 'EXPIRY_CLEARANCE',
        updatePromotionalFlag: updatePromotionalFlag === true,
      });
    });

    console.log('[PROMO] /revert-promotion DB query success:', {
      productCode: result?.result?.productCode,
      priceId: result?.result?.insertedRow?.priceId,
      locationCode: result?.result?.locationCode,
      priceTypeCode: result?.result?.priceTypeCode,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to revert promotion',
        details: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Promotion reverted successfully',
      productCode: result.result.productCode,
      restorePrice: result.result.restorePrice,
      priceId: result.result.insertedRow.priceId,
      priceTypeCode: result.result.priceTypeCode,
      locationCode: result.result.locationCode,
    });
  } catch (err) {
    console.error('[PROMO] /revert-promotion DB query failed:', err.message);
    console.error('[WRITEBACK] Error in /pos-sync/revert-promotion:', err.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error: Failed to revert promotion',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * GET /pos-sync/promotion-preview/:productCode
 * Preview the latest price row that currently resolves in POS.
 */
app.get('/pos-sync/promotion-preview/:productCode', validateApiKey, async (req, res) => {
  try {
    console.log('[PROMO] GET /pos-sync/promotion-preview called');

    if (!pool) await initializePool();

    const { productCode } = req.params;
    const locationCode = req.query.locationCode || process.env.POS_LOCATION_CODE || 'SH';
    const priceTypeCode = req.query.priceTypeCode || 'RT';

    const request = pool.request();
    const preview = await priceUpdates.previewPromotionPrice(request, productCode, locationCode, priceTypeCode);

    if (!preview.productExists) {
      return res.status(404).json({
        success: false,
        error: `Product ${productCode} does not exist in POS`,
      });
    }

    res.json({
      success: true,
      productCode,
      locationCode,
      priceTypeCode,
      latestPriceRow: preview.latestPriceRow,
    });
  } catch (err) {
    console.error('[PROMO] Error in /pos-sync/promotion-preview:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to preview promotion price',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * GET /pos-sync/get-resolved-price/:productCode
 * Backward-compatible alias for price preview.
 */
app.get('/pos-sync/get-resolved-price/:productCode', validateApiKey, async (req, res) => {
  try {
    if (!pool) await initializePool();

    const { productCode } = req.params;
    const locationCode = req.query.locationCode || process.env.POS_LOCATION_CODE || 'SH';
    const priceTypeCode = req.query.priceTypeCode || 'RT';
    const request = pool.request();
    const resolvedPrice = await priceUpdates.getResolvedPrice(request, productCode, locationCode, priceTypeCode);

    return res.json({
      success: true,
      productCode,
      price: resolvedPrice.price,
      isPromotional: resolvedPrice.isPromotional,
      priceId: resolvedPrice.priceId,
      priceDate: resolvedPrice.priceDate,
      locationCode: resolvedPrice.locationCode,
      priceTypeCode: resolvedPrice.priceTypeCode,
    });
  } catch (err) {
    console.error('[PROMO] Error in /pos-sync/get-resolved-price:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get resolved price',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/** Health check endpoint */
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'POS Sync Agent is running', timestamp: new Date().toISOString() });
});

/** 404 handler */
app.use((req, res) => res.status(404).json({ success: false, error: 'Not found' }));

/** Global error handler */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

/** Graceful shutdown */
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    console.log('Auto-sync interval cleared');
  }
  if (commandPollInterval) {
    clearInterval(commandPollInterval);
    console.log('Command poll interval cleared');
  }
  if (pool) {
    await pool.close();
    console.log('Database connection pool closed');
  }
  process.exit(0);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/** Auto-sync interval */
let autoSyncInterval;
const SYNC_INTERVAL_MS = process.env.SYNC_INTERVAL_MS || 60000; // 60 seconds default
let isAutoSyncRunning = false;

/** Command polling interval */
let commandPollInterval;
const COMMAND_POLL_INTERVAL_MS = parseInt(process.env.COMMAND_POLL_INTERVAL_MS || '5000', 10);
const ENABLE_POS_COMMAND_POLLING = process.env.ENABLE_POS_COMMAND_POLLING !== 'false';
let isCommandPollRunning = false;

/**
 * Automatic sync function - runs on interval
 */
async function autoSync() {
  if (isAutoSyncRunning) {
    console.log('[AUTO SYNC] Skipped tick - previous cycle still running');
    return;
  }

  isAutoSyncRunning = true;
  try {
    const products = await fetchProductsFromPOS();
    if (products.length > 0) {
      console.log(`[AUTO SYNC] Triggered - fetched ${products.length} products`);
      await sendProductsToLiveServer(products);
    }
  } catch (err) {
    console.error('[AUTO SYNC] Error:', err.message);
  } finally {
    isAutoSyncRunning = false;
  }
}

async function pollAndProcessCommands() {
  if (isCommandPollRunning) {
    console.log('[POS COMMAND POLLER] Skipped tick - previous cycle still running');
    return;
  }

  isCommandPollRunning = true;

  try {
    const commands = await commandQueueClient.pollCommands(10);

    if (!Array.isArray(commands) || commands.length === 0) {
      return;
    }

    console.log(`[POS COMMAND POLLER] Claimed ${commands.length} command(s)`);

    for (const command of commands) {
      try {
        console.log('[POS COMMAND EXECUTOR] start:', {
          id: command.id,
          commandType: command.commandType,
        });

        const resultSummary = await commandExecutor.executeCommand(pool, command);

        await commandQueueClient.completeCommand(command.id, resultSummary || {
          message: 'Command executed successfully',
        });

        console.log('[POS COMMAND EXECUTOR] success:', {
          id: command.id,
          commandType: command.commandType,
        });
      } catch (error) {
        console.error('[POS COMMAND EXECUTOR ERROR] command failed:', {
          id: command.id,
          commandType: command.commandType,
          error: error.message,
        });

        const isNonRetryable = typeof error.message === 'string' && error.message.startsWith('NON_RETRYABLE:');
        const errorMessage = isNonRetryable
          ? error.message.replace('NON_RETRYABLE:', '').trim()
          : error.message;

        await commandQueueClient.failCommand(command.id, errorMessage, !isNonRetryable);
      }
    }
  } catch (err) {
    console.error('[POS COMMAND POLLER ERROR]', err.message);
  } finally {
    isCommandPollRunning = false;
  }
}

/** Start server */
const PORT = process.env.PORT || 3001;
let autoSyncStarted = false;

startServer();
async function startServer() {
  try {
    await initializePool();
    app.listen(PORT, () => {
      console.log(`POS Sync Agent listening on port ${PORT}`);
      console.log(`API Key validation: ENABLED`);
      console.log(`Database: ${SQL_SERVER}/${SQL_DATABASE}`);
      console.log(`Live Server: ${process.env.LIVE_SERVER_URL || 'NOT CONFIGURED'}`);
      console.log(`Auto-sync interval: ${SYNC_INTERVAL_MS}ms (${Math.round(SYNC_INTERVAL_MS / 1000)}s)`);
      console.log('[PHASE 3 ROUTES] Registered:', [
        'GET /pos-sync/expiry-products',
        'POST /pos-sync/apply-promotion',
        'POST /pos-sync/revert-promotion',
        'GET /pos-sync/promotion-preview/:productCode',
        'GET /pos-sync/get-resolved-price/:productCode',
      ]);
      console.log('[PHASE 3 COMMAND TYPES] Supported:', [
        'APPLY_PROMOTION',
        'REVERT_PROMOTION',
      ]);

      // Start automatic sync if not already started
      if (!autoSyncStarted) {
        autoSyncInterval = setInterval(autoSync, SYNC_INTERVAL_MS);
        autoSyncStarted = true;
        console.log('[AUTO SYNC] ✅ Auto-sync enabled');
      }

      if (ENABLE_POS_COMMAND_POLLING && process.env.LIVE_SERVER_URL && process.env.POS_SECRET) {
        commandPollInterval = setInterval(pollAndProcessCommands, COMMAND_POLL_INTERVAL_MS);
        console.log(`[POS COMMAND POLLER] ✅ Polling enabled (${COMMAND_POLL_INTERVAL_MS}ms)`);
      } else {
        console.log('[POS COMMAND POLLER] ⚠️ Polling disabled (requires ENABLE_POS_COMMAND_POLLING=true, LIVE_SERVER_URL, POS_SECRET)');
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

module.exports = app;
module.exports.getPool = () => pool;
