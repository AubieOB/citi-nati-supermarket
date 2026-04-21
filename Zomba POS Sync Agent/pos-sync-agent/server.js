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
const { buildConfig, getBranchTag, getSyncMetadata, validateStartupConfig } = require('./lib/config');
const ReportingSyncService = require('./lib/reporting-sync');
const ReportingSyncState = require('./lib/reporting-sync-state');

const app = express();
app.use(express.json());

const appConfig = buildConfig();
const BRANCH_TAG = getBranchTag(appConfig);
const SYNC_LOG_PREFIX = appConfig.branch.logPrefix || `[${appConfig.branch.branchCode} SYNC]`;
const ENABLE_DIRECT_WRITEBACK_DEBUG = appConfig.server.enableDirectWritebackDebug;
const SQL_SERVER = appConfig.posDb.server;
const SQL_DATABASE = appConfig.posDb.database;
const SQL_USER = appConfig.posDb.user;

// SQL Server configuration
const sqlConfig = {
  user: SQL_USER,
  password: appConfig.posDb.password,
  server: SQL_SERVER,
  database: SQL_DATABASE,
  connectionTimeout: appConfig.posDb.connectionTimeoutMs,
  requestTimeout: appConfig.posDb.requestTimeoutMs,
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

/** Reporting sync service and state */
let reportingSyncState;
let reportingSyncService;

/** Expiry batch cache - refreshed every 5 minutes so heavy view query doesn't block every 15s product push tick */
let expiryBatchCache = null;
let expiryBatchCachedAt = 0;
const EXPIRY_BATCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ZOMBA_OPERATIONAL_LOCATION_CODES = ['SH', 'BAR', 'ST999'];
const PRODUCT_ACTIVITY_FRESHNESS_WINDOW_MINUTES = Number.parseInt(process.env.PRODUCT_ACTIVITY_FRESHNESS_WINDOW_MINUTES || '5', 10);
let liveStockSourceConfig = null;
const ENABLE_DELTA_PRODUCT_SYNC = String(process.env.ENABLE_DELTA_PRODUCT_SYNC || 'true').trim().toLowerCase() !== 'false';
const DELTA_FULL_SYNC_EVERY_CYCLES = Number.parseInt(process.env.DELTA_FULL_SYNC_EVERY_CYCLES || '40', 10);
let lastProductSyncSnapshot = new Map();
let productSyncCycleCounter = 0;

function buildProductDeltaKey(product) {
  const productCode = String(product && product.ProductCode ? product.ProductCode : '').trim().toUpperCase();
  const locationCode = String(product && product.LocationCode ? product.LocationCode : '').trim().toUpperCase();
  return `${locationCode}::${productCode}`;
}

function normalizeDateValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return String(value).trim();
  }
  return date.toISOString();
}

function buildProductDeltaSignature(product) {
  return [
    Number(product && product.QuantityAvailable ? product.QuantityAvailable : 0),
    Number(product && product.SellingPrice ? product.SellingPrice : 0),
    String(product && product.ProductName ? product.ProductName : '').trim(),
    String(product && product.CategoryName ? product.CategoryName : '').trim(),
    String(product && product.Barcode ? product.Barcode : '').trim(),
    normalizeDateValue(product && product.ExpiryDate ? product.ExpiryDate : ''),
    Number(product && product.ExpiryBatchCount ? product.ExpiryBatchCount : 0),
  ].join('|');
}

function normalizeOperationalLocationCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'RES') return 'ST999';
  return normalized;
}

function parseOperationalLocationCodes(rawCodes) {
  const source = String(rawCodes || '').trim();
  if (!source) return [];

  const unique = new Set();
  const resolved = [];
  const parts = source.split(',');
  for (const part of parts) {
    const normalized = normalizeOperationalLocationCode(part);
    if (!normalized) continue;
    if (!ZOMBA_OPERATIONAL_LOCATION_CODES.includes(normalized)) continue;
    if (unique.has(normalized)) continue;
    unique.add(normalized);
    resolved.push(normalized);
  }

  return resolved;
}

async function getTableColumns(tableName) {
  const request = pool.request();
  request.input('TableName', sql.VarChar(128), tableName);
  const result = await request.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = @TableName
    ORDER BY ORDINAL_POSITION
  `);
  return new Set((result.recordset || []).map((row) => String(row.COLUMN_NAME || '').trim()));
}

function pickFirst(columns, candidates) {
  return candidates.find((column) => columns.has(column)) || null;
}

async function resolveLiveStockSourceConfig() {
  if (liveStockSourceConfig) {
    return liveStockSourceConfig;
  }

  const [dailyStockBalanceColumns, productActivityColumns] = await Promise.all([
    getTableColumns('DailyStockBalance'),
    getTableColumns('ProductActivity'),
  ]);

  const hasDailyStockBalance = dailyStockBalanceColumns.has('ProductCode')
    && dailyStockBalanceColumns.has('LocationCode')
    && dailyStockBalanceColumns.has('StockDate')
    && dailyStockBalanceColumns.has('StockBalance');

  const hasProductActivity = productActivityColumns.has('ProductCode')
    && productActivityColumns.has('LocationCode')
    && productActivityColumns.has('QtyIn')
    && productActivityColumns.has('QtyOut');

  const productActivityTimestampColumn = hasProductActivity
    ? pickFirst(productActivityColumns, [
      'ActivityDate',
      'TransactionDate',
      'TransDate',
      'DocDate',
      'VoucherDate',
      'EntryDate',
      'CreatedAt',
      'CreatedOn',
      'ModifiedAt',
      'UpdatedAt',
    ])
    : null;

  liveStockSourceConfig = {
    hasDailyStockBalance,
    hasProductActivity,
    productActivityTimestampColumn,
  };

  console.log(`${SYNC_LOG_PREFIX} stock source configuration resolved`, {
    hasDailyStockBalance,
    hasProductActivity,
    productActivityTimestampColumn,
    preferredSource: hasDailyStockBalance
      ? 'DailyStockBalance'
      : (hasProductActivity ? 'ProductActivity' : 'Unavailable'),
  });

  return liveStockSourceConfig;
}

async function getCachedExpiryBatches() {
  const now = Date.now();
  if (expiryBatchCache && (now - expiryBatchCachedAt) < EXPIRY_BATCH_CACHE_TTL_MS) {
    console.log(`[POS FETCH][EXPIRY] using cached expiry batch map (age=${Math.round((now - expiryBatchCachedAt) / 1000)}s, size=${expiryBatchCache.size})`);
    return expiryBatchCache;
  }
  console.log('[POS FETCH][EXPIRY] refreshing expiry batch cache...');
  const freshMap = await buildActiveExpiryBatchesFromPOS();
  expiryBatchCache = freshMap;
  expiryBatchCachedAt = Date.now();
  console.log(`[POS FETCH][EXPIRY] expiry batch cache refreshed: ${freshMap.size} products`);
  return freshMap;
}

/** Initialize SQL connection pool */
async function initializePool() {
  if (!pool) {
    try {
      console.log(`${BRANCH_TAG} [DB CONFIG] SQL user: ${SQL_USER || '(not set)'}`);
      console.log(`${BRANCH_TAG} [DB CONFIG] SQL server: ${SQL_SERVER}`);
      console.log(`${BRANCH_TAG} [DB CONFIG] SQL database: ${SQL_DATABASE}`);
      console.log(`${BRANCH_TAG} [DB CONFIG] SQL connection timeout: ${appConfig.posDb.connectionTimeoutMs}ms`);
      console.log(`${BRANCH_TAG} [DB CONFIG] SQL request timeout: ${appConfig.posDb.requestTimeoutMs}ms`);
      pool = new sql.ConnectionPool(sqlConfig);
      await pool.connect();
      console.log(`${BRANCH_TAG} Connected to SQL Server`);
    } catch (err) {
      console.error(`${BRANCH_TAG} [DB CONFIG ERROR] Failed to connect to SQL Server with configured credentials`);
      console.error(`${BRANCH_TAG} Failed to create connection pool:`, err.message);
      throw err;
    }
  }
  return pool;
}

/** Middleware: API Key Validation */
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-pos-secret'];
  if (!apiKey || apiKey !== appConfig.server.agentApiSecret) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API key' });
  }
  next();
}

function requireFeature(flagName, moduleName) {
  return (req, res, next) => {
    if (appConfig.features[flagName]) {
      return next();
    }

    return res.status(503).json({
      success: false,
      error: `${moduleName} is disabled for this branch deployment`,
      branchCode: appConfig.branch.branchCode,
      syncSourceCode: appConfig.branch.syncSourceCode,
    });
  };
}

function requireAllFeatures(flagNames, moduleName) {
  return (req, res, next) => {
    const disabled = flagNames.filter((flagName) => !appConfig.features[flagName]);
    if (disabled.length === 0) {
      return next();
    }

    return res.status(503).json({
      success: false,
      error: `${moduleName} is disabled for this branch deployment`,
      disabledFlags: disabled,
      branchCode: appConfig.branch.branchCode,
      syncSourceCode: appConfig.branch.syncSourceCode,
    });
  };
}

/** Send products to live server API endpoint - with batching for large datasets */
async function sendProductsToLiveServer(products, syncContext = {}) {
  try {
    if (!appConfig.backend.baseUrl) {
      console.error(`${BRANCH_TAG} [POS SYNC] ERROR: BACKEND_BASE_URL not configured`);
      return { success: false, error: 'BACKEND_BASE_URL not configured' };
    }

    console.log(`${SYNC_LOG_PREFIX} Sending ${products.length} products to backend (batching)`);

    const syncedLocations = Array.isArray(syncContext.syncLocations) && syncContext.syncLocations.length > 0
      ? syncContext.syncLocations
      : Array.from(new Set(products.map((product) => String(product.LocationCode || '').trim()).filter(Boolean)));
    const overallLocationBreakdown = products.reduce((acc, product) => {
      const key = String(product.LocationCode || 'UNKNOWN').trim() || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    console.log(`${SYNC_LOG_PREFIX} stock resolution mode`, {
      mode: 'LOCATION_SPECIFIC',
      aggregationEnabled: false,
      operationalLocations: syncedLocations,
      batchLocationBreakdown: overallLocationBreakdown,
    });

    // Batch size to avoid payload too large errors - reduced for faster processing
    const BATCH_SIZE = 100;
    const batches = [];

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      batches.push(products.slice(i, i + BATCH_SIZE));
    }

    console.log(`${SYNC_LOG_PREFIX} Split into ${batches.length} batches of up to ${BATCH_SIZE} products`);

    let totalSynced = 0;
    let totalErrors = 0;
    const MAX_BATCH_ATTEMPTS = 2;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchLocationBreakdown = batch.reduce((acc, product) => {
        const key = String(product.LocationCode || 'UNKNOWN').trim() || 'UNKNOWN';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const batchLocations = Object.keys(batchLocationBreakdown);
      const syncMetadata = getSyncMetadata(appConfig, {
        locationCode: batchLocations.length === 1 ? batchLocations[0] : null,
        syncedLocations,
        stockResolutionMode: 'LOCATION_SPECIFIC',
        aggregationEnabled: false,
        batchLocationBreakdown,
      });
      console.log(`${SYNC_LOG_PREFIX} Sending products batch ${batchIndex + 1}/${batches.length} (${batch.length} rows)`, {
        batchLocationBreakdown,
        attemptLimit: MAX_BATCH_ATTEMPTS,
      });

      let batchCompleted = false;
      for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
        try {
          const response = await axios.post(
            `${appConfig.backend.baseUrl}/api/products/pos-sync/push`,
            {
              products: batch.map(p => ({
                sourceCode: p.ProductCode,
                name: p.ProductName,
                price: p.SellingPrice,
                stock: p.QuantityAvailable,
                stockSource: p.StockSource || null,
                stockDate: p.StockDate ? (p.StockDate instanceof Date ? p.StockDate.toISOString() : p.StockDate) : null,
                barcode: p.Barcode || '',
                category: p.CategoryName || 'Uncategorized',
                expiryDate: p.ExpiryDate ? (p.ExpiryDate instanceof Date ? p.ExpiryDate.toISOString() : p.ExpiryDate) : null,
                expirySource: p.ExpirySource || null,
                nearestExpiryDate: p.ExpiryDate ? (p.ExpiryDate instanceof Date ? p.ExpiryDate.toISOString() : p.ExpiryDate) : null,
                expiryBatchCount: Number.isFinite(Number(p.ExpiryBatchCount)) ? Number(p.ExpiryBatchCount) : 0,
                daysToExpiry: Number.isFinite(Number(p.DaysToExpiry)) ? Number(p.DaysToExpiry) : null,
                expiryStatus: p.ExpiryStatus || null,
                expiryBatches: Array.isArray(p.ExpiryBatches) ? p.ExpiryBatches : [],
                branchCode: appConfig.branch.branchCode,
                branchName: appConfig.branch.branchName,
                locationCode: p.LocationCode || appConfig.posDb.locationCode,
              })),
              metadata: syncMetadata,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'x-pos-secret': appConfig.backend.apiToken,
                'x-branch-code': appConfig.branch.branchCode,
                'x-sync-source-code': appConfig.branch.syncSourceCode,
              },
              timeout: 120000,
            }
          );

          if (response.data.success) {
            totalSynced += response.data.synced || batch.length;
            batchCompleted = true;
            console.log(`${SYNC_LOG_PREFIX} products synced (batch ${batchIndex + 1}/${batches.length}, attempt ${attempt}/${MAX_BATCH_ATTEMPTS})`, {
              batchLocationBreakdown,
            });
            break;
          }
        } catch (batchError) {
          const httpStatus = batchError && batchError.response ? batchError.response.status : null;
          const responseBody = batchError && batchError.response ? batchError.response.data : null;
          console.error(`${SYNC_LOG_PREFIX} error (products batch ${batchIndex + 1}/${batches.length}, attempt ${attempt}/${MAX_BATCH_ATTEMPTS}):`, batchError.message);
          console.error(`${SYNC_LOG_PREFIX} batch ${batchIndex + 1} location breakdown:`, batchLocationBreakdown);
          if (httpStatus) {
            console.error(`${SYNC_LOG_PREFIX} batch ${batchIndex + 1} HTTP status: ${httpStatus}`);
          }
          if (responseBody) {
            console.error(`${SYNC_LOG_PREFIX} batch ${batchIndex + 1} response body:`, JSON.stringify(responseBody).slice(0, 1000));
          }

          if (attempt === MAX_BATCH_ATTEMPTS) {
            totalErrors++;
          }
        }
      }

      if (!batchCompleted) {
        console.error(`${SYNC_LOG_PREFIX} batch ${batchIndex + 1}/${batches.length} failed after ${MAX_BATCH_ATTEMPTS} attempts`);
      }
    }

    const summary = {
      success: totalErrors === 0,
      totalProducts: products.length,
      batchesSent: batches.length,
      batchesFailed: totalErrors,
      totalSynced,
      metadata: getSyncMetadata(appConfig, {
        locationCode: null,
        syncedLocations,
        stockResolutionMode: 'LOCATION_SPECIFIC',
        aggregationEnabled: false,
      }),
    };

    console.log(`${SYNC_LOG_PREFIX} products sync complete`, summary);
    return summary;
  } catch (error) {
    console.error(`${SYNC_LOG_PREFIX} error (products sync):`, error.message);
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

/** Fetch products from POS with category information for a specific operational location. */
async function fetchProductsFromPOS(locationCode) {
  try {
    if (!pool) await initializePool();

    // Use provided location code or fall back to environment
    const LOCATION_CODE = locationCode || appConfig.posDb.locationCode;

    const stockConfig = await resolveLiveStockSourceConfig();
    const safeActivityTimestampColumn = stockConfig.productActivityTimestampColumn
      ? String(stockConfig.productActivityTimestampColumn).replace(/[^A-Za-z0-9_]/g, '')
      : null;
    const productActivityTimestampExpr = safeActivityTimestampColumn
      ? `MAX(TRY_CONVERT(datetime2, pa.[${safeActivityTimestampColumn}])) AS ActivityLatestAt`
      : 'NULL AS ActivityLatestAt';
    const query = stockConfig.hasDailyStockBalance && stockConfig.hasProductActivity
      ? `
      WITH latest_daily AS (
        SELECT
          ProductCode,
          LocationCode,
          StockDate,
          StockBalance,
          ROW_NUMBER() OVER (
            PARTITION BY ProductCode, LocationCode
            ORDER BY StockDate DESC
          ) AS rn
        FROM POS.dbo.DailyStockBalance
        WHERE LocationCode = @LocationCode
          AND CAST(StockDate AS date) <= CAST(GETDATE() AS date)
      ),
      product_activity AS (
        SELECT
          ProductCode,
          LocationCode,
          SUM(ISNULL(QtyIn, 0) - ISNULL(QtyOut, 0)) AS ActivityStockBalance
          ,${productActivityTimestampExpr}
        FROM POS.dbo.ProductActivity
        AS pa
        WHERE LocationCode = @LocationCode
        GROUP BY ProductCode, LocationCode
      )
      SELECT
          p.ProductCode,
          p.ProductName,
          ISNULL(p.Barcode, '') AS Barcode,
          ISNULL(pt.ProductTypeName, 'General') AS CategoryName,
          CASE
            WHEN pa.ActivityLatestAt IS NOT NULL AND (ds.StockDate IS NULL OR pa.ActivityLatestAt > ds.StockDate)
              THEN pa.ActivityLatestAt
            WHEN pa.ProductCode IS NOT NULL
              AND pa.ActivityLatestAt IS NULL
              AND ds.StockBalance IS NOT NULL
              AND ISNULL(pa.ActivityStockBalance, 0) <> ISNULL(ds.StockBalance, 0)
              THEN GETDATE()
            ELSE ds.StockDate
          END AS StockDate,
          ISNULL(
            CASE
              WHEN pa.ActivityLatestAt IS NOT NULL AND (ds.StockDate IS NULL OR pa.ActivityLatestAt > ds.StockDate)
                THEN pa.ActivityStockBalance
              WHEN pa.ProductCode IS NOT NULL
                AND pa.ActivityLatestAt IS NULL
                AND ds.StockBalance IS NOT NULL
                AND ISNULL(pa.ActivityStockBalance, 0) <> ISNULL(ds.StockBalance, 0)
                THEN pa.ActivityStockBalance
              ELSE COALESCE(ds.StockBalance, pa.ActivityStockBalance)
            END,
            0
          ) AS QuantityAvailable,
          CASE
            WHEN pa.ActivityLatestAt IS NOT NULL AND (ds.StockDate IS NULL OR pa.ActivityLatestAt > ds.StockDate) THEN 'ProductActivityFresh'
            WHEN pa.ProductCode IS NOT NULL
              AND pa.ActivityLatestAt IS NULL
              AND ds.StockBalance IS NOT NULL
              AND ISNULL(pa.ActivityStockBalance, 0) <> ISNULL(ds.StockBalance, 0)
              THEN 'ProductActivityDivergence'
            WHEN ds.StockBalance IS NOT NULL THEN 'DailyStockBalance'
            WHEN pa.ProductCode IS NOT NULL THEN 'ProductActivity'
            ELSE 'NoStockRow'
          END AS StockSource,
          ISNULL(lp.FPrice, 0) AS SellingPrice,
          CASE
            WHEN lp.FPrice IS NOT NULL THEN 'PriceByLocation'
            ELSE 'NoPriceRow'
          END AS PriceSource
      FROM POS.dbo.productsmaster p
      LEFT JOIN POS.dbo.producttypes pt ON p.ProductTypeCode = pt.ProductTypeCode
      LEFT JOIN latest_daily ds ON ds.ProductCode = p.ProductCode AND ds.LocationCode = @LocationCode AND ds.rn = 1
      LEFT JOIN product_activity pa ON pa.ProductCode = p.ProductCode AND pa.LocationCode = @LocationCode
      OUTER APPLY (
        SELECT TOP 1 FPrice
        FROM POS.dbo.productprices
        WHERE ProductCode = p.ProductCode
          AND LocationCode = @LocationCode
        ORDER BY PriceID DESC
      ) lp
      ORDER BY p.ProductCode
    `
      : stockConfig.hasDailyStockBalance
      ? `
      WITH latest_stock AS (
        SELECT
          ProductCode,
          LocationCode,
          StockDate,
          StockBalance,
          ROW_NUMBER() OVER (
            PARTITION BY ProductCode, LocationCode
            ORDER BY StockDate DESC
          ) AS rn
        FROM POS.dbo.DailyStockBalance
        WHERE LocationCode = @LocationCode
          AND CAST(StockDate AS date) <= CAST(GETDATE() AS date)
      )
      SELECT
          p.ProductCode,
          p.ProductName,
          ISNULL(p.Barcode, '') AS Barcode,
          ISNULL(pt.ProductTypeName, 'General') AS CategoryName,
          ls.StockDate,
          ISNULL(ls.StockBalance, 0) AS QuantityAvailable,
          CASE
            WHEN ls.StockBalance IS NOT NULL THEN 'DailyStockBalance'
            ELSE 'NoStockRow'
          END AS StockSource,
          ISNULL(
              (SELECT TOP 1 FPrice FROM POS.dbo.productprices WHERE ProductCode = p.ProductCode AND LocationCode = @LocationCode ORDER BY PriceID DESC),
              0
          ) AS SellingPrice,
          CASE
            WHEN (SELECT TOP 1 FPrice FROM POS.dbo.productprices WHERE ProductCode = p.ProductCode AND LocationCode = @LocationCode ORDER BY PriceID DESC) IS NOT NULL THEN 'PriceByLocation'
            ELSE 'NoPriceRow'
          END AS PriceSource
      FROM POS.dbo.productsmaster p
      LEFT JOIN POS.dbo.producttypes pt ON p.ProductTypeCode = pt.ProductTypeCode
      LEFT JOIN latest_stock ls ON ls.ProductCode = p.ProductCode AND ls.LocationCode = @LocationCode AND ls.rn = 1
      ORDER BY p.ProductCode
    `
      : stockConfig.hasProductActivity
      ? `
      WITH product_activity AS (
        SELECT
          ProductCode,
          LocationCode,
          SUM(ISNULL(QtyIn, 0) - ISNULL(QtyOut, 0)) AS ActivityStockBalance
        FROM POS.dbo.ProductActivity
        WHERE LocationCode = @LocationCode
        GROUP BY ProductCode, LocationCode
      )
      SELECT
          p.ProductCode,
          p.ProductName,
          ISNULL(p.Barcode, '') AS Barcode,
          ISNULL(pt.ProductTypeName, 'General') AS CategoryName,
          NULL AS StockDate,
          ISNULL(pa.ActivityStockBalance, 0) AS QuantityAvailable,
          CASE
            WHEN pa.ProductCode IS NOT NULL THEN 'ProductActivity'
            ELSE 'NoStockRow'
          END AS StockSource,
          ISNULL(
              (SELECT TOP 1 FPrice FROM POS.dbo.productprices WHERE ProductCode = p.ProductCode AND LocationCode = @LocationCode ORDER BY PriceID DESC),
              0
          ) AS SellingPrice,
          CASE
            WHEN (SELECT TOP 1 FPrice FROM POS.dbo.productprices WHERE ProductCode = p.ProductCode AND LocationCode = @LocationCode ORDER BY PriceID DESC) IS NOT NULL THEN 'PriceByLocation'
            ELSE 'NoPriceRow'
          END AS PriceSource
      FROM POS.dbo.productsmaster p
      LEFT JOIN POS.dbo.producttypes pt ON p.ProductTypeCode = pt.ProductTypeCode
      LEFT JOIN product_activity pa ON pa.ProductCode = p.ProductCode AND pa.LocationCode = @LocationCode
      ORDER BY p.ProductCode
    `
      : `
      SELECT
          p.ProductCode,
          p.ProductName,
          ISNULL(p.Barcode, '') AS Barcode,
          ISNULL(pt.ProductTypeName, 'General') AS CategoryName,
          NULL AS StockDate,
          0 AS QuantityAvailable,
          'NoStockRow' AS StockSource,
          ISNULL(
              (SELECT TOP 1 FPrice FROM POS.dbo.productprices WHERE ProductCode = p.ProductCode AND LocationCode = @LocationCode ORDER BY PriceID DESC),
              0
          ) AS SellingPrice,
          CASE
            WHEN (SELECT TOP 1 FPrice FROM POS.dbo.productprices WHERE ProductCode = p.ProductCode AND LocationCode = @LocationCode ORDER BY PriceID DESC) IS NOT NULL THEN 'PriceByLocation'
            ELSE 'NoPriceRow'
          END AS PriceSource
      FROM POS.dbo.productsmaster p
      LEFT JOIN POS.dbo.producttypes pt ON p.ProductTypeCode = pt.ProductTypeCode
      ORDER BY p.ProductCode
    `;

    const request = pool.request();
    request.input('LocationCode', sql.VarChar(10), LOCATION_CODE);

    // Log BEFORE query so BAR/ST999 fetch attempts are visible even if SQL throws
    console.log(`${SYNC_LOG_PREFIX} [FETCH] querying POS for location: ${LOCATION_CODE}`, {
      stockReadLocations: [LOCATION_CODE],
      aggregationMode: false,
      stockResolutionMode: 'LOCATION_SPECIFIC',
      stockSourceMode: stockConfig.hasDailyStockBalance && stockConfig.hasProductActivity
        ? 'DailyStockBalance+FreshProductActivityFallback'
        : (stockConfig.hasDailyStockBalance
          ? 'DailyStockBalance'
          : (stockConfig.hasProductActivity ? 'ProductActivity' : 'Unavailable')),
      productActivityTimestampColumn: safeActivityTimestampColumn,
      productActivityFreshnessWindowMinutes: PRODUCT_ACTIVITY_FRESHNESS_WINDOW_MINUTES,
    });

    const result = await request.query(query);

    console.log(`${SYNC_LOG_PREFIX} [FETCH] done — fetched ${result.recordset.length} products for location ${LOCATION_CODE}`);
    console.log(`${SYNC_LOG_PREFIX} price mode: PriceByLocation from ${LOCATION_CODE} only (no cross-location fallback)`);

    const stockSourceSummary = result.recordset.reduce((acc, row) => {
      const key = String(row.StockSource || 'Unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const priceSourceSummary = result.recordset.reduce((acc, row) => {
      const key = String(row.PriceSource || 'Unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const noStockCount = stockSourceSummary.NoStockRow || 0;
    const totalCount = result.recordset.length;
    if (totalCount > 0 && noStockCount === totalCount) {
      console.warn(`${SYNC_LOG_PREFIX} [STOCK WARNING] ALL ${totalCount} products for location '${LOCATION_CODE}' resolved with NoStockRow`);
    } else if (totalCount > 0 && noStockCount > 0) {
      console.log(`${SYNC_LOG_PREFIX} [STOCK INFO] ${noStockCount}/${totalCount} products for '${LOCATION_CODE}' resolved with NoStockRow`);
    }
    console.log(`${SYNC_LOG_PREFIX} stock-source diagnostics`, {
      locationCode: LOCATION_CODE,
      stockReadLocations: [LOCATION_CODE],
      aggregationMode: false,
      stockResolutionMode: 'LOCATION_SPECIFIC',
      sourceBreakdown: stockSourceSummary,
      priceSourceBreakdown: priceSourceSummary,
    });
    
    // Debug log first 5 products (with location and stock source)
    if (result.recordset.length > 0) {
      console.log(`${SYNC_LOG_PREFIX} [DEBUG] sample product stock (locationCode=${LOCATION_CODE}):`);
      result.recordset.slice(0, 5).forEach(product => {
        const stockDateLabel = product.StockDate ? new Date(product.StockDate).toISOString().slice(0, 10) : 'NULL';
        console.log(`${SYNC_LOG_PREFIX} [DEBUG]  ${product.ProductCode}: ${product.ProductName} | stockDate=${stockDateLabel} | stock=${product.QuantityAvailable} | source=${product.StockSource} | price=${product.SellingPrice} | priceSource=${product.PriceSource}`);
      });
    }

    const debugProductCode = String(process.env.STOCK_DEBUG_PRODUCT_CODE || '').trim();
    if (debugProductCode) {
      const matched = result.recordset.find((row) => String(row.ProductCode || '').trim() === debugProductCode);
      if (matched) {
        const stockDateLabel = matched.StockDate ? new Date(matched.StockDate).toISOString().slice(0, 19) : 'NULL';
        console.log(`${SYNC_LOG_PREFIX} [STOCK DEBUG] productCode=${debugProductCode} locationCode=${LOCATION_CODE} stockSource=${matched.StockSource} stockDate=${stockDateLabel} resolvedStock=${Number(matched.QuantityAvailable || 0)} price=${Number(matched.SellingPrice || 0)} priceSource=${matched.PriceSource || 'Unknown'}`);
      } else {
        console.log(`${SYNC_LOG_PREFIX} [STOCK DEBUG] productCode=${debugProductCode} locationCode=${LOCATION_CODE} not found in fetched product set`);
      }
    }

    // Enrich each product with active expiry batches from the same SQL Server.
    // Use the 5-minute cache so the heavy vw_WillExpire_Products view query does not
    // block every 15-second product-push tick (preventing isAutoSyncRunning from releasing).
    const expiryBatchesMap = await getCachedExpiryBatches();
    let enrichedWithExpiry = 0;
    const enrichedRecords = result.recordset.map(product => {
      const code = String(product.ProductCode || '').trim();
      const liveStockQty = Number(product.QuantityAvailable || 0);
      const batches = reconcileBatchesWithLiveStock(expiryBatchesMap.get(code) || [], liveStockQty);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcomingBatches = batches
        .filter((batch) => {
          const d = new Date(batch.expiryDate);
          d.setHours(0, 0, 0, 0);
          return d >= today;
        })
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

      const nearestBatch = upcomingBatches[0] || null;
      if (nearestBatch) enrichedWithExpiry++;

      const daysToExpiry = nearestBatch
        ? Math.ceil((new Date(nearestBatch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      const expiryStatus = daysToExpiry == null
        ? null
        : (daysToExpiry < 0
          ? 'Expired'
          : (daysToExpiry <= 7 ? 'Expiring Soon' : (daysToExpiry <= 30 ? 'Near Expiry' : 'OK')));

      const nearestExpiryDate = nearestBatch ? new Date(nearestBatch.expiryDate) : null;

      return {
        ...product,
        LocationCode: LOCATION_CODE,
        ExpiryDate: nearestExpiryDate,
        ExpirySource: nearestBatch ? nearestBatch.source : null,
        ExpiryBatchCount: batches.length,
        DaysToExpiry: daysToExpiry,
        ExpiryStatus: expiryStatus,
        ExpiryBatches: batches,
      };
    });
    console.log(`[POS FETCH][EXPIRY] products enriched with expiry=${enrichedWithExpiry}`);
    const sampleEnriched = enrichedRecords.find(p => p.ExpiryDate || (Array.isArray(p.ExpiryBatches) && p.ExpiryBatches.length > 0));
    if (sampleEnriched) {
      const sampleNearestExpiry = sampleEnriched.ExpiryDate ? new Date(sampleEnriched.ExpiryDate) : null;
      console.log(`[POS FETCH][EXPIRY] sample enriched product:`, {
        productCode: sampleEnriched.ProductCode,
        nearestExpiryDate: sampleNearestExpiry && !Number.isNaN(sampleNearestExpiry.getTime()) ? sampleNearestExpiry.toISOString().slice(0, 10) : null,
        expiryBatchCount: sampleEnriched.ExpiryBatchCount || 0,
        daysToExpiry: sampleEnriched.DaysToExpiry,
        expiryStatus: sampleEnriched.ExpiryStatus,
        expirySource: sampleEnriched.ExpirySource,
        sampleBatches: (sampleEnriched.ExpiryBatches || []).slice(0, 2),
      });
    }

    return enrichedRecords;
  } catch (err) {
    console.error('[POS FETCH] Error fetching products:', err.message);
    return [];
  }
}

function getOperationalSyncLocations() {
  if (appConfig.branch.branchCode === 'ZOMBA') {
    const rawConfigured = String(process.env.POS_OPERATIONAL_LOCATION_CODES || '').trim();
    const configured = parseOperationalLocationCodes(rawConfigured);
    if (configured.length > 0) {
      return configured;
    }

    console.warn(`${BRANCH_TAG} [OPERATIONAL LOCATIONS] POS_OPERATIONAL_LOCATION_CODES not set or invalid; defaulting to full Zomba operational scope: ${ZOMBA_OPERATIONAL_LOCATION_CODES.join(', ')}`);
    return [...ZOMBA_OPERATIONAL_LOCATION_CODES];
  }

  return [appConfig.posDb.locationCode];
}

function reconcileBatchesWithLiveStock(batches, liveStockQty) {
  // No reconciliation needed. Each row from vw_WillExpire_Products already has
  // accurate StockBalance. Return batches as-is without modification or reallocation.
  if (!Array.isArray(batches) || batches.length === 0) {
    return [];
  }

  return batches
    .filter((batch) => Number.isFinite(batch.remainingQty) && batch.remainingQty > 0)
    .sort((left, right) => {
      const leftExp = (left && left.expiryDate) ? new Date(left.expiryDate).getTime() : Number.POSITIVE_INFINITY;
      const rightExp = (right && right.expiryDate) ? new Date(right.expiryDate).getTime() : Number.POSITIVE_INFINITY;
      return leftExp - rightExp;
    });
}

function encodeExpiryBatchReference(stockDetailId, grnNo) {
  const normalizedStockDetailId = String(stockDetailId || '').trim();
  const normalizedGrnNo = String(grnNo || '').trim();

  if (!normalizedStockDetailId && !normalizedGrnNo) {
    return null;
  }

  const parts = [];
  if (normalizedStockDetailId) parts.push(`SD:${normalizedStockDetailId}`);
  if (normalizedGrnNo) parts.push(`GRN:${normalizedGrnNo}`);
  return parts.join('|');
}

function getExpiryBatchDebugProductCode() {
  const raw = process.env.EXPIRY_BATCH_DEBUG_PRODUCT_CODE || process.env.EXPIRY_BATCH_DEBUG_PRODUCT || '';
  const normalized = String(raw).trim();
  return normalized || null;
}

function shouldDebugExpiryBatch(productCode) {
  const target = getExpiryBatchDebugProductCode();
  if (!target) {
    return false;
  }

  return String(productCode || '').trim().toUpperCase() === target.toUpperCase();
}

/**
 * Builds a Map<ProductCode, Batch[]> from SQL Server using vw_WillExpire_Products.
 * Each StockDetailID is one complete batch. No grouping, no aggregation.
 */
async function buildActiveExpiryBatchesFromPOS(locationCode) {
  try {
    if (!pool) await initializePool();
    const normalizedLocationCode = locationCode || appConfig.posDb.locationCode;
    
    // Fetch all expiry rows from view - no pre-filtering by days here
    const result = await fetchExpiryCandidates({
      days: 3650,
      locationCode: normalizedLocationCode,
      includeExpired: true,  // fetch all rows, apply date logic in agent
      source: 'view',  // prefer vw_WillExpire_Products
      productCodes: [],
    });
    
    const rows = result.products || [];
    console.log(`[POS FETCH][EXPIRY] rows fetched from view: count=${rows.length}`);

    const MIN_DATE = new Date('2000-01-01T00:00:00.000Z');
    const expiryBatchesMap = new Map();
    let processedCount = 0;
    let skippedCount = 0;

    // Process each row as ONE standalone batch (identified by StockDetailID)
    for (const row of rows) {
      const code = String(row.ProductCode || '').trim();
      if (!code || !row.ExpiryDate) {
        skippedCount++;
        continue;
      }
      
      const d = new Date(row.ExpiryDate);
      if (isNaN(d.getTime()) || d < MIN_DATE) {
        skippedCount++;
        continue;
      }
      
      const stockBalance = Number(row.StockBalance || 0);
      if (stockBalance <= 0) {
        skippedCount++;
        continue;
      }

      const stockDetailId = row.StockDetailID != null ? String(row.StockDetailID).trim() : null;
      const grnNo = row.GRNNo != null ? String(row.GRNNo).trim() : null;
      const stockQty = row.StockQty == null ? null : Number(row.StockQty);
      const debugEnabled = shouldDebugExpiryBatch(code);

      if (debugEnabled) {
        console.log(`[EXPIRY BATCH] source rows from vw_WillExpire_Products for product ${code}`, {
          stockDetailId,
          expiryDate: d.toISOString(),
          stockBalance,
        });
        console.log(`[EXPIRY BATCH] joined stockdetails rows for product ${code}`, {
          stockDetailId,
          grnNo,
          stockQty,
          stockBalance,
        });
      }

      const batch = {
        productCode: code,
        stockDetailId,
        grnNo,
        expiryDate: d.toISOString(),
        remainingQty: stockBalance,
        locationCode: normalizedLocationCode,
        batchNo: encodeExpiryBatchReference(stockDetailId, grnNo),
        source: result.source,
      };

      if (debugEnabled) {
        console.log(`[EXPIRY BATCH] final batch payload for product ${code}`, {
          stockDetailId,
          grnNo,
          stockQty,
          stockBalance,
          finalRemainingQty: batch.remainingQty,
          batch,
        });
      }

      if (!expiryBatchesMap.has(code)) {
        expiryBatchesMap.set(code, []);
      }
      expiryBatchesMap.get(code).push(batch);
      processedCount++;
    }

    // Sort batches per product by expiry date
    for (const batches of expiryBatchesMap.values()) {
      batches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    }

    console.log(`[POS FETCH][EXPIRY] expiry batch map size=${expiryBatchesMap.size}`);
    console.log(`[POS FETCH][EXPIRY] rows processed=${processedCount}`);
    console.log(`[POS FETCH][EXPIRY] rows skipped=${skippedCount}`);

    // Log sample batches per product
    let sampleLog = 0;
    for (const [code, batches] of expiryBatchesMap.entries()) {
      if (sampleLog < 3) {
        console.log(`[POS FETCH][EXPIRY] product ${code}: ${batches.length} batches`);
        batches.slice(0, 2).forEach((b, idx) => {
          console.log(`  batch ${idx + 1}: StockDetailID=${b.stockDetailId || 'N/A'} GRN=${b.grnNo || 'N/A'} qty=${b.remainingQty} expiry=${new Date(b.expiryDate).toISOString().slice(0, 10)}`);
        });
        sampleLog++;
      }
    }

    return expiryBatchesMap;
  } catch (err) {
    console.error('[POS FETCH][EXPIRY] buildActiveExpiryBatchesFromPOS failed:', err.message);
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
  const normalized = String(value || appConfig.posDb.locationCode || 'SH').trim().toUpperCase();
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
  const remainingQty = pickFirstValue(row, ['StockBalance', 'stockBalance', 'RemainingQty', 'remainingQty']);

  return {
    ProductCode: pickFirstValue(row, ['ProductCode', 'productCode']),
    StockDetailID: pickFirstValue(row, ['StockDetailID', 'stockDetailId']),
    ExpiryDate: toIsoDateOrNull(expiryDate),
    RemainingQty: remainingQty == null ? null : Number(remainingQty),
    StockBalance: remainingQty == null ? null : Number(remainingQty),
    StockQty: (() => {
      const value = pickFirstValue(row, ['StockQty', 'stockQty']);
      return value == null ? null : Number(value);
    })(),
    GRNNo: pickFirstValue(row, ['GRNNo', 'grnNo', 'LatestGRNNo', 'latestGRNNo']),
    LatestGRNNo: pickFirstValue(row, ['GRNNo', 'grnNo', 'LatestGRNNo', 'latestGRNNo']),
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
    ? `vw.ExpiryDate >= @MinValidDate`
    : `vw.ExpiryDate >= @MinValidDate
       AND vw.ExpiryDate >= CAST(GETDATE() AS date)
       AND vw.ExpiryDate < DATEADD(DAY, @ExpiryDays, CAST(GETDATE() AS date))`;

  const viewQuery = `
      SELECT
        vw.ProductCode,
        vw.StockDetailID,
        vw.ExpiryDate,
        vw.StockBalance,
        sd.GRNNo,
        sd.StockQty
      FROM POS.dbo.vw_WillExpire_Products vw
      LEFT JOIN POS.dbo.stockdetails sd
        ON vw.StockDetailID = sd.StockDetailID
      WHERE ${rangeClause}
        AND vw.ExpiryDate IS NOT NULL
        AND vw.StockBalance > 0
        ${buildProductCodeFilter('vw')}
      ORDER BY vw.ProductCode ASC, vw.ExpiryDate ASC
    `;

  // Always use the view for accurate batch-level data
  const query = viewQuery;

  let result;
  let resolvedSource = 'view';

  try {
    result = await request.query(query);
  } catch (error) {
    console.error('[EXPIRY] vw_WillExpire_Products query failed:', error.message);
    throw error;
  }

  const products = (result.recordset || [])
    .map((row) => ({
      ProductCode: row.ProductCode,
      StockDetailID: row.StockDetailID,
      ExpiryDate: row.ExpiryDate,
      StockBalance: Number(row.StockBalance || 0),
      StockQty: row.StockQty == null ? null : Number(row.StockQty),
      GRNNo: row.GRNNo == null ? null : String(row.GRNNo).trim(),
    }))
    .filter((row) => row.ProductCode && row.ExpiryDate && row.StockBalance > 0);

  console.log(`[EXPIRY] fetched ${products.length} expiry batch rows from vw_WillExpire_Products`);

  return {
    days: safeDays,
    locationCode: safeLocationCode,
    includeExpired: safeIncludeExpired,
    source: resolvedSource,
    products,
  };
}

/**
 * Manual endpoint: fetch and sync products
 */
app.get('/pos-sync/products', validateApiKey, requireFeature('enableReportingSync', 'Reporting sync'), async (req, res) => {
  try {
    console.log('[POS SYNC] /pos-sync/products endpoint called');
    
    // Fetch products from operational location scope only.
    const allProducts = [];
    const syncLocations = getOperationalSyncLocations();
    
    console.log('[POS SYNC] operational stock scope diagnostics', {
      branchCode: appConfig.branch.branchCode,
      configuredLocationCode: appConfig.posDb.locationCode,
      includedLocations: syncLocations,
      mode: appConfig.branch.branchCode === 'ZOMBA' ? 'CONFIGURED_ZOMBA_OPERATIONAL_LOCATIONS' : 'CONFIGURED_LOCATION_ONLY',
      stockSource: 'DailyStockBalance preferred, freshness-aware ProductActivity fallback',
      stockResolutionMode: 'LOCATION_SPECIFIC',
      aggregationEnabled: false,
    });

    for (const locationCode of syncLocations) {
      try {
        const locationProducts = await fetchProductsFromPOS(locationCode);
        console.log(`[POS SYNC] Fetched ${locationProducts.length} products from ${locationCode} (stock from ${locationCode})`);
        allProducts.push(...locationProducts);
      } catch (locationErr) {
        console.error(`[POS SYNC] Error fetching products from ${locationCode}:`, locationErr.message);
        // Continue with other locations even if one fails
      }
    }

    const locationBreakdown = allProducts.reduce((acc, product) => {
      const key = String(product.LocationCode || 'UNKNOWN').trim() || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    console.log(`[POS SYNC] Fetched ${allProducts.length} products from operational scope: ${syncLocations.join(', ')}`);
    console.log('[POS SYNC] stock read locations', syncLocations);
    console.log('[POS SYNC] aggregation mode: disabled');
    console.log('[POS SYNC] location breakdown', locationBreakdown);

    if (!allProducts || allProducts.length === 0) {
      return res.json({
        success: true,
        count: 0,
        data: [],
        message: 'No products found',
      });
    }

    // Send to live server
    const syncResult = await sendProductsToLiveServer(allProducts, { syncLocations });

    res.json({
      success: true,
      count: allProducts.length,
      data: allProducts,
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

    const LOCATION_CODE = appConfig.posDb.locationCode;

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

    const requestedLocationCode = normalizeOperationalLocationCode(req.query.locationCode || appConfig.posDb.locationCode || 'SH');
    const LOCATION_CODE = requestedLocationCode || 'SH';
    const rows = await fetchProductsFromPOS(LOCATION_CODE);
    const normalizedRows = rows.map((row) => ({
      ProductCode: row.ProductCode,
      ProductName: row.ProductName,
      LocationCode: row.LocationCode || LOCATION_CODE,
      AvailableStock: Number(row.QuantityAvailable || 0),
      StockDate: row.StockDate || null,
      StockSource: row.StockSource || 'Unknown',
    }));

    console.log(`[/pos-sync/stock-by-location] Fetched stock for ${normalizedRows.length} products at location ${LOCATION_CODE} using live preferred source`);
    normalizedRows.slice(0, 5).forEach((row) => {
      const stockDateLabel = row.StockDate ? new Date(row.StockDate).toISOString().slice(0, 10) : 'NULL';
      console.log(`[ZOMBA STOCK] product=${row.ProductCode} source=${row.StockSource} location=${row.LocationCode} stockDate=${stockDateLabel} stock=${Number(row.AvailableStock || 0)}`);
    });

    res.json({
      success: true,
      count: normalizedRows.length,
      data: normalizedRows,
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
app.post('/pos-sync/write-invoice', validateApiKey, requireAllFeatures(['enableOnlineOrderWriteback', 'enableInvoiceWriteback'], 'Invoice write-back'), rejectDirectWritebackInProduction, async (req, res) => {
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
app.post('/pos-sync/update-stock', validateApiKey, requireAllFeatures(['enableStockWriteback', 'enableManualStockSync'], 'Stock write-back'), rejectDirectWritebackInProduction, async (req, res) => {
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
app.post('/pos-sync/update-prices', validateApiKey, requireFeature('enablePriceSync', 'Price sync'), rejectDirectWritebackInProduction, async (req, res) => {
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
app.post('/pos-sync/apply-promotion', validateApiKey, requireFeature('enablePromotionSync', 'Promotion sync'), async (req, res) => {
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
      productCode: (result && result.result && result.result.productCode),
      priceId: (result && result.result && result.result.insertedRow && result.result.insertedRow.priceId),
      locationCode: (result && result.result && result.result.locationCode),
      priceTypeCode: (result && result.result && result.result.priceTypeCode),
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
app.post('/pos-sync/revert-promotion', validateApiKey, requireFeature('enablePromotionSync', 'Promotion sync'), async (req, res) => {
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
      productCode: (result && result.result && result.result.productCode),
      priceId: (result && result.result && result.result.insertedRow && result.result.insertedRow.priceId),
      locationCode: (result && result.result && result.result.locationCode),
      priceTypeCode: (result && result.result && result.result.priceTypeCode),
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
app.get('/pos-sync/promotion-preview/:productCode', validateApiKey, requireFeature('enablePromotionSync', 'Promotion sync'), async (req, res) => {
  try {
    console.log('[PROMO] GET /pos-sync/promotion-preview called');

    if (!pool) await initializePool();

    const { productCode } = req.params;
    const locationCode = req.query.locationCode || appConfig.posDb.locationCode;
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
app.get('/pos-sync/get-resolved-price/:productCode', validateApiKey, requireFeature('enablePromotionSync', 'Promotion sync'), async (req, res) => {
  try {
    if (!pool) await initializePool();

    const { productCode } = req.params;
    const locationCode = req.query.locationCode || appConfig.posDb.locationCode;
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
  res.json({
    success: true,
    message: 'POS Sync Agent is running',
    timestamp: new Date().toISOString(),
    branchCode: appConfig.branch.branchCode,
    branchName: appConfig.branch.branchName,
    syncSourceCode: appConfig.branch.syncSourceCode,
  });
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
  if (reportingSyncInterval) {
    clearInterval(reportingSyncInterval);
    console.log('Reporting sync interval cleared');
  }
  if (commandPollInterval) {
    clearInterval(commandPollInterval);
    console.log('Command poll interval cleared');
  }
  if (emergencySalesPollInterval) {
    clearInterval(emergencySalesPollInterval);
    console.log('Emergency sales poll interval cleared');
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
const SYNC_INTERVAL_MS = appConfig.polling.reportingSyncIntervalMs;
let isAutoSyncRunning = false;

/** Command polling interval */
let commandPollInterval;
const COMMAND_POLL_INTERVAL_MS = appConfig.polling.commandPollIntervalMs;
const ENABLE_POS_COMMAND_POLLING = appConfig.modules.commandPolling;
let isCommandPollRunning = false;

/** Emergency sales polling interval */
let emergencySalesPollInterval;
const EMERGENCY_SALES_POLL_INTERVAL_MS = appConfig.polling.emergencySalesPollIntervalMs;
const ENABLE_EMERGENCY_SALES_SYNC = appConfig.modules.emergencySalesSync;
let isEmergencySalesPollRunning = false;

/** Reporting sync interval */
let reportingSyncInterval;
const REPORTING_SYNC_INTERVAL_MS = appConfig.reporting.pollingIntervalMs;
let isReportingSyncRunning = false;

/**
 * Automatic sync function - runs on interval
 */
async function autoSync() {
  if (!appConfig.features.enableReportingSync) {
    return;
  }

  if (isAutoSyncRunning) {
    console.log(`${BRANCH_TAG} [AUTO SYNC] Skipped tick - previous cycle still running`);
    return;
  }

  isAutoSyncRunning = true;
  try {
    // Fetch products from operational location scope only.
    const allProducts = [];
    const syncLocations = getOperationalSyncLocations();
    
    console.log(`${BRANCH_TAG} [AUTO SYNC] operational stock scope diagnostics`, {
      branchCode: appConfig.branch.branchCode,
      configuredLocationCode: appConfig.posDb.locationCode,
      includedLocations: syncLocations,
      mode: appConfig.branch.branchCode === 'ZOMBA' ? 'CONFIGURED_ZOMBA_OPERATIONAL_LOCATIONS' : 'CONFIGURED_LOCATION_ONLY',
      stockSource: 'DailyStockBalance preferred, freshness-aware ProductActivity fallback',
      stockResolutionMode: 'LOCATION_SPECIFIC',
      aggregationEnabled: false,
    });

    const locationResults = await Promise.allSettled(
      syncLocations.map(async (locationCode) => {
        const locationProducts = await fetchProductsFromPOS(locationCode);
        return {
          locationCode,
          products: locationProducts,
        };
      })
    );

    for (const locationResult of locationResults) {
      if (locationResult.status === 'fulfilled') {
        const { locationCode, products: locationProducts } = locationResult.value;
        console.log(`${BRANCH_TAG} [AUTO SYNC] Fetched ${locationProducts.length} products from ${locationCode} (stock from ${locationCode})`);
        allProducts.push(...locationProducts);
        continue;
      }

      const failedIndex = locationResults.indexOf(locationResult);
      const failedLocationCode = syncLocations[failedIndex] || 'UNKNOWN';
      const failureReason = locationResult.reason && locationResult.reason.message
        ? locationResult.reason.message
        : locationResult.reason;
      console.error(`${BRANCH_TAG} [AUTO SYNC] Error fetching products from ${failedLocationCode}:`, failureReason);
      // Continue with other locations even if one fails
    }

    const autoSyncLocationBreakdown = allProducts.reduce((acc, product) => {
      const key = String(product.LocationCode || 'UNKNOWN').trim() || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log(`${BRANCH_TAG} [AUTO SYNC] stock read locations: ${syncLocations.join(', ')}`);
    console.log(`${BRANCH_TAG} [AUTO SYNC] aggregation mode: disabled`);
    console.log(`${BRANCH_TAG} [AUTO SYNC] location breakdown`, autoSyncLocationBreakdown);
    
    if (allProducts.length > 0) {
      productSyncCycleCounter += 1;

      const shouldForceFullSync = !ENABLE_DELTA_PRODUCT_SYNC
        || lastProductSyncSnapshot.size === 0
        || (!Number.isNaN(DELTA_FULL_SYNC_EVERY_CYCLES) && DELTA_FULL_SYNC_EVERY_CYCLES > 0 && (productSyncCycleCounter % DELTA_FULL_SYNC_EVERY_CYCLES) === 0);

      let productsToSync = allProducts;
      let nextSnapshot = null;

      if (!shouldForceFullSync) {
        nextSnapshot = new Map();
        const changedProducts = [];
        for (const product of allProducts) {
          const key = buildProductDeltaKey(product);
          const signature = buildProductDeltaSignature(product);
          nextSnapshot.set(key, signature);

          const previousSignature = lastProductSyncSnapshot.get(key);
          if (previousSignature !== signature) {
            changedProducts.push(product);
          }
        }

        productsToSync = changedProducts;
      }

      console.log(`${BRANCH_TAG} [AUTO SYNC] Total: ${allProducts.length} products from operational scope (${syncLocations.join(', ')})`);
      console.log(`${BRANCH_TAG} [AUTO SYNC] delta sync`, {
        enabled: ENABLE_DELTA_PRODUCT_SYNC,
        cycle: productSyncCycleCounter,
        forceFullSync: shouldForceFullSync,
        queued: productsToSync.length,
      });

      if (productsToSync.length > 0) {
        const syncResult = await sendProductsToLiveServer(productsToSync, { syncLocations });
        if (syncResult && syncResult.success) {
          if (shouldForceFullSync || !nextSnapshot) {
            nextSnapshot = new Map();
            for (const product of allProducts) {
              nextSnapshot.set(buildProductDeltaKey(product), buildProductDeltaSignature(product));
            }
          }
          lastProductSyncSnapshot = nextSnapshot;
        }
      } else {
        console.log(`${BRANCH_TAG} [AUTO SYNC] No product changes detected for this cycle`);
        if (nextSnapshot) {
          lastProductSyncSnapshot = nextSnapshot;
        }
      }
    } else {
      console.log(`${BRANCH_TAG} [AUTO SYNC] No products found from any location`);
    }
  } catch (err) {
    console.error(`${BRANCH_TAG} [AUTO SYNC] Error:`, err.message);
  } finally {
    isAutoSyncRunning = false;
  }
}

function isCommandTypeEnabled(commandType) {
  const { features } = appConfig;

  switch (commandType) {
    case 'UPDATE_PRICE':
      return features.enablePriceSync;
    case 'UPDATE_PRODUCT_NAME':
      return features.enableProductNameSync;
    case 'UPDATE_STOCK':
      return features.enableStockWriteback && features.enableManualStockSync;
    case 'APPLY_PROMOTION':
    case 'REVERT_PROMOTION':
      return features.enablePromotionSync;
    case 'WRITE_INVOICE':
      return features.enableOnlineOrderWriteback && features.enableInvoiceWriteback;
    default:
      return false;
  }
}

function isLikelyNonRetryableCommandError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('permission')
    || text.includes('denied')
    || text.includes('invalid column')
    || text.includes('invalid object')
    || text.includes('schema')
    || text.includes('does not exist')
    || text.includes('missing payload')
    || text.includes('missing productcode')
    || text.includes('unsupported command type')
  );
}

async function pollAndProcessCommands() {
  if (!ENABLE_POS_COMMAND_POLLING) {
    return;
  }

  if (isCommandPollRunning) {
    console.log(`${BRANCH_TAG} [POS COMMAND POLLER] Skipped tick - previous cycle still running`);
    return;
  }

  isCommandPollRunning = true;

  try {
    const commands = await commandQueueClient.pollCommands(10);

    if (!Array.isArray(commands) || commands.length === 0) {
      return;
    }

    console.log(`${BRANCH_TAG} [POS COMMAND POLLER] Claimed ${commands.length} command(s)`);

    for (const command of commands) {
      if (!isCommandTypeEnabled(command.commandType)) {
        const disabledMessage = `Command ${command.commandType} disabled by feature flags for branch ${appConfig.branch.branchCode}`;
        console.warn(`${BRANCH_TAG} [POS COMMAND EXECUTOR] skipping disabled command:`, {
          id: command.id,
          commandType: command.commandType,
        });
        await commandQueueClient.failCommand(command.id, disabledMessage, false);
        continue;
      }

      try {
        console.log(`${BRANCH_TAG} [POS COMMAND EXECUTOR] start:`, {
          id: command.id,
          commandType: command.commandType,
        });

        const resultSummary = await commandExecutor.executeCommand(pool, command);

        await commandQueueClient.completeCommand(command.id, resultSummary || {
          message: 'Command executed successfully',
        });

        console.log(`${BRANCH_TAG} [POS COMMAND EXECUTOR] success:`, {
          id: command.id,
          commandType: command.commandType,
        });
      } catch (error) {
        console.error(`${BRANCH_TAG} [POS COMMAND EXECUTOR ERROR] command failed:`, {
          id: command.id,
          commandType: command.commandType,
          error: error.message,
        });

        const isPrefixedNonRetryable = typeof error.message === 'string' && error.message.startsWith('NON_RETRYABLE:');
        const isNonRetryable = isPrefixedNonRetryable || isLikelyNonRetryableCommandError(error.message);
        const errorMessage = isNonRetryable
          ? error.message.replace('NON_RETRYABLE:', '').trim()
          : error.message;

        await commandQueueClient.failCommand(command.id, errorMessage, !isNonRetryable);
      }
    }
  } catch (err) {
    console.error(`${BRANCH_TAG} [POS COMMAND POLLER ERROR]`, err.message);
  } finally {
    isCommandPollRunning = false;
  }
}

async function writeEmergencySaleToPos(sale) {
  if (!sale || !sale.payload) {
    throw new Error('NON_RETRYABLE: emergency sale payload missing');
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    const resultSummary = await invoiceWriteback.writeBackInvoice(request, sale.payload);
    await transaction.commit();
    return resultSummary;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.log('[EMERGENCY SALES] rollback note:', rollbackErr.message);
    }
    throw error;
  }
}

async function pollAndProcessEmergencySales() {
  if (!ENABLE_EMERGENCY_SALES_SYNC) {
    return;
  }

  if (isEmergencySalesPollRunning) {
    console.log(`${BRANCH_TAG} [EMERGENCY SALES] Skipped tick - previous cycle still running`);
    return;
  }

  isEmergencySalesPollRunning = true;

  try {
    const sales = await commandQueueClient.pollPendingEmergencySales(10);

    if (!Array.isArray(sales) || sales.length === 0) {
      return;
    }

    console.log(`${BRANCH_TAG} [EMERGENCY SALES] Claimed ${sales.length} pending sale(s)`);

    for (const sale of sales) {
      try {
        const resultSummary = await writeEmergencySaleToPos(sale);

        await commandQueueClient.ackEmergencySaleSynced({
          sale_ref: sale.sale_ref,
          emergency_sale_id: sale.emergency_sale_id,
          pos_invoice_no: (resultSummary && resultSummary.invoiceCode) || null,
        });

        console.log(`${BRANCH_TAG} [EMERGENCY SALES] sync success:`, {
          saleRef: sale.sale_ref,
          emergencySaleId: sale.emergency_sale_id,
          invoiceCode: (resultSummary && resultSummary.invoiceCode) || null,
          alreadySynced: (resultSummary && resultSummary.alreadySynced) === true,
        });
      } catch (error) {
        console.error(`${BRANCH_TAG} [EMERGENCY SALES] sync failed:`, {
          saleRef: sale.sale_ref,
          emergencySaleId: sale.emergency_sale_id,
          error: error.message,
        });

        await commandQueueClient.ackEmergencySaleFailed({
          sale_ref: sale.sale_ref,
          emergency_sale_id: sale.emergency_sale_id,
          sync_error: error.message,
        });
      }
    }
  } catch (error) {
    console.error(`${BRANCH_TAG} [EMERGENCY SALES] poller error:`, error.message);
  } finally {
    isEmergencySalesPollRunning = false;
  }
}

async function pollAndProcessReportingSync() {
  if (!appConfig.features.enableReportingSync) {
    return;
  }

  if (!reportingSyncService) {
    console.warn(`${BRANCH_TAG} [REPORTING SYNC] Service not initialized`);
    return;
  }

  if (isReportingSyncRunning) {
    console.log(`${BRANCH_TAG} [REPORTING SYNC] Skipped tick - previous cycle still running`);
    return;
  }

  isReportingSyncRunning = true;

  try {
    console.log(`${BRANCH_TAG} [REPORTING SYNC] Polling started`);

    const result = await reportingSyncService.syncBatch(pool, appConfig.reporting.batchSize);

    if (result.success) {
      const latestCostSummary = result.latestProductCostThrottled
        ? 'latest cost sync throttled'
        : `${result.latestProductCostCount || 0} latest cost rows`;
      console.log(`${BRANCH_TAG} [REPORTING SYNC] ✅ Sync complete: ${result.invoiceCount} invoices, ${result.detailCount} details, ${latestCostSummary}, checkpoint=${result.checkpoint}`);
    }
  } catch (error) {
    console.error(`${BRANCH_TAG} [REPORTING SYNC] ❌ Polling error:`, error.message);
  } finally {
    isReportingSyncRunning = false;
  }
}

/** Start server */
const PORT = appConfig.server.port;
let autoSyncStarted = false;

function logStartupConfiguration() {
  const validation = validateStartupConfig(appConfig);
  const nodeVersion = process.version;
  const nodeMajor = Number.parseInt(String(nodeVersion).replace(/^v/, '').split('.')[0], 10);

  console.log(`${BRANCH_TAG} [BOOT] Runtime: Node ${nodeVersion}`);
  if (Number.isInteger(nodeMajor) && nodeMajor < 14) {
    console.warn(`${BRANCH_TAG} [BOOT][WARN] Node ${nodeVersion} may be too old for modern JS syntax. Recommended: Node 16+.`);
  }

  console.log(`${BRANCH_TAG} [BOOT] Branch: ${appConfig.branch.branchName} (${appConfig.branch.branchCode})`);
  console.log(`${BRANCH_TAG} [BOOT] Source: ${appConfig.branch.syncSourceCode} | LocationId: ${appConfig.branch.locationId}`);
  console.log(`${BRANCH_TAG} [BOOT] Feature flags:`, appConfig.features);

  if (validation.warnings.length > 0) {
    validation.warnings.forEach((warning) => {
      console.warn(`${BRANCH_TAG} [BOOT][WARN] ${warning}`);
    });
  }

  if (!validation.valid) {
    validation.errors.forEach((error) => {
      console.error(`${BRANCH_TAG} [BOOT][ERROR] ${error}`);
    });
    throw new Error('Startup configuration validation failed');
  }
}

startServer();
async function startServer() {
  try {
    logStartupConfiguration();
    await initializePool();

    // Initialize reporting sync if enabled
    if (appConfig.features.enableReportingSync) {
      try {
        reportingSyncState = new ReportingSyncState(appConfig.branch.branchCode);
        reportingSyncService = new ReportingSyncService(appConfig, reportingSyncState);
        console.log(`${BRANCH_TAG} [REPORTING SYNC] Service initialized, checkpoint: ${reportingSyncState.getLastSyncedInvoiceNo()}`);
      } catch (err) {
        console.error(`${BRANCH_TAG} [REPORTING SYNC] Failed to initialize:`, err.message);
      }
    }

    app.listen(PORT, () => {
      console.log(`${BRANCH_TAG} POS Sync Agent listening on port ${PORT}`);
      console.log(`${BRANCH_TAG} API Key validation: ENABLED`);
      console.log(`${BRANCH_TAG} Database: ${SQL_SERVER}/${SQL_DATABASE}`);
      console.log(`${BRANCH_TAG} Backend: ${appConfig.backend.baseUrl || 'NOT CONFIGURED'}`);
      console.log(`${BRANCH_TAG} Polling interval: ${SYNC_INTERVAL_MS}ms (${Math.round(SYNC_INTERVAL_MS / 1000)}s)`);
      console.log(`${BRANCH_TAG} [PHASE 3 ROUTES] Registered:`, [
        'GET /pos-sync/expiry-products',
        'POST /pos-sync/apply-promotion',
        'POST /pos-sync/revert-promotion',
        'GET /pos-sync/promotion-preview/:productCode',
        'GET /pos-sync/get-resolved-price/:productCode',
      ]);
      console.log(`${BRANCH_TAG} [PHASE 3 COMMAND TYPES] Supported:`, [
        'APPLY_PROMOTION',
        'REVERT_PROMOTION',
      ]);

      // reporting sync module
      if (appConfig.modules.reportingSync && !autoSyncStarted) {
        autoSyncInterval = setInterval(autoSync, SYNC_INTERVAL_MS);
        autoSyncStarted = true;
        console.log(`${BRANCH_TAG} [AUTO SYNC] ✅ Reporting sync enabled`);
        autoSync().catch((error) => {
          console.error(`${BRANCH_TAG} [AUTO SYNC] Initial sync failed:`, error.message);
        });
      } else if (!appConfig.modules.reportingSync) {
        console.log(`${BRANCH_TAG} [AUTO SYNC] ⏸ Reporting sync disabled by ENABLE_REPORTING_SYNC=false`);
      }

      // online commerce / write-back command module
      if (ENABLE_POS_COMMAND_POLLING && appConfig.backend.baseUrl && appConfig.backend.apiToken) {
        commandPollInterval = setInterval(pollAndProcessCommands, COMMAND_POLL_INTERVAL_MS);
        console.log(`${BRANCH_TAG} [POS COMMAND POLLER] ✅ Polling enabled (${COMMAND_POLL_INTERVAL_MS}ms)`);
      } else {
        console.log(`${BRANCH_TAG} [POS COMMAND POLLER] ⏸ Polling disabled by feature flags/config`);
      }

      // emergency sales write-back module
      if (ENABLE_EMERGENCY_SALES_SYNC && appConfig.backend.baseUrl && appConfig.backend.apiToken) {
        emergencySalesPollInterval = setInterval(pollAndProcessEmergencySales, EMERGENCY_SALES_POLL_INTERVAL_MS);
        console.log(`${BRANCH_TAG} [EMERGENCY SALES] ✅ Sync polling enabled (${EMERGENCY_SALES_POLL_INTERVAL_MS}ms)`);
      } else {
        console.log(`${BRANCH_TAG} [EMERGENCY SALES] ⏸ Sync polling disabled by feature flags/config`);
      }

      // reporting sync module
      if (appConfig.features.enableReportingSync && reportingSyncService) {
        reportingSyncInterval = setInterval(pollAndProcessReportingSync, REPORTING_SYNC_INTERVAL_MS);
        console.log(`${BRANCH_TAG} [REPORTING SYNC] ✅ Polling enabled (${REPORTING_SYNC_INTERVAL_MS}ms, batch: ${appConfig.reporting.batchSize})`);
        // Run one initial sync immediately
        pollAndProcessReportingSync();
      } else if (!appConfig.features.enableReportingSync) {
        console.log(`${BRANCH_TAG} [REPORTING SYNC] ⏸ Polling disabled by ENABLE_REPORTING_SYNC=false`);
      }
    });
  } catch (err) {
    console.error(`${BRANCH_TAG} Failed to start server:`, err.message);
    process.exit(1);
  }
}

module.exports = app;
module.exports.getPool = () => pool;
