require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const axios = require('axios');

const app = express();
app.use(express.json());

// SQL Server configuration
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
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
      pool = new sql.ConnectionPool(sqlConfig);
      await pool.connect();
      console.log('Connected to SQL Server');
    } catch (err) {
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
    
    return result.recordset;
  } catch (err) {
    console.error('[POS FETCH] Error fetching products:', err.message);
    return [];
  }
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

/**
 * Automatic sync function - runs on interval
 */
async function autoSync() {
  try {
    const products = await fetchProductsFromPOS();
    if (products.length > 0) {
      console.log(`[AUTO SYNC] Triggered - fetched ${products.length} products`);
      await sendProductsToLiveServer(products);
    }
  } catch (err) {
    console.error('[AUTO SYNC] Error:', err.message);
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
      console.log(`Database: ${process.env.DB_SERVER}/${process.env.DB_DATABASE}`);
      console.log(`Live Server: ${process.env.LIVE_SERVER_URL || 'NOT CONFIGURED'}`);
      console.log(`Auto-sync interval: ${SYNC_INTERVAL_MS}ms (${Math.round(SYNC_INTERVAL_MS / 1000)}s)`);

      // Start automatic sync if not already started
      if (!autoSyncStarted) {
        autoSyncInterval = setInterval(autoSync, SYNC_INTERVAL_MS);
        autoSyncStarted = true;
        console.log('[AUTO SYNC] ✅ Auto-sync enabled');
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

module.exports = app;
module.exports.getPool = () => pool;
