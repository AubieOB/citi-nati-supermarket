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

/** Send products to live server API endpoint */
async function sendProductsToLiveServer(products) {
  try {
    if (!process.env.LIVE_SERVER_URL) {
      console.error('[POS SYNC] ERROR: LIVE_SERVER_URL not configured in .env');
      return { success: false, error: 'LIVE_SERVER_URL not configured' };
    }

    console.log(`[POS SYNC] Sending ${products.length} products to live server...`);

    const response = await axios.post(
      `${process.env.LIVE_SERVER_URL}/api/products/pos-sync/push`,
      {
        products: products.map(p => ({
          sourceCode: p.ProductCode,
          name: p.ProductName,
          price: p.SellingPrice,
          stock: p.QuantityAvailable,
          barcode: p.Barcode || '',
        })),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-pos-secret': process.env.POS_SECRET,
        },
        timeout: 60000,
      }
    );

    console.log(`[POS SYNC] ✅ Products sent successfully:`, response.data);
    return response.data;
  } catch (error) {
    console.error('[POS SYNC] ❌ Failed to send products to live server:');
    console.error(error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Copilot statement: fetch all products safely with latest price & stock
 */
app.get('/pos-sync/products', validateApiKey, async (req, res) => {
  try {
    if (!pool) await initializePool();

    const query = `
      SELECT 
          p.ProductCode,
          p.ProductName,
          ISNULL(p.Barcode,'') AS Barcode,
          ISNULL((
              SELECT TOP 1 FPrice 
              FROM POS.dbo.productprices pr 
              WHERE pr.ProductCode = p.ProductCode 
              ORDER BY FPrice DESC
          ), 0) AS SellingPrice,
          ISNULL((
              SELECT SUM(StockQty - StockOut)
              FROM POS.dbo.stockdetails sd
              WHERE sd.ProductCode = p.ProductCode
          ), 0) AS QuantityAvailable
      FROM POS.dbo.productsmaster p
      ORDER BY p.ProductCode
    `;

    const result = await pool.request().query(query);

    console.log(`[POS SYNC] Fetched ${result.recordset.length} products from Global POS`);

    // Send to live server
    const syncResult = await sendProductsToLiveServer(result.recordset);

    res.json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
      syncResult: syncResult,
    });
  } catch (err) {
    console.error('Database query error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error: Failed to fetch products',
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
      WHERE s.LocationCode = 'SH'
    `;

    const result = await pool.request().query(query);

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
 * Fetch stock quantities by location (SH location only)
 * Returns ProductCode, LocationCode, and current available stock
 */
app.get('/pos-sync/stock-by-location', validateApiKey, async (req, res) => {
  try {
    if (!pool) await initializePool();

    const query = `
      SELECT 
          sd.ProductCode,
          p.ProductName,
          s.LocationCode,
          SUM(sd.StockQty - sd.StockOut) AS AvailableStock
      FROM POS.dbo.stockdetails sd
      INNER JOIN POS.dbo.stocks s
          ON sd.GRNNo = s.GRNNo
      INNER JOIN POS.dbo.productsmaster p 
          ON sd.ProductCode = p.ProductCode
      WHERE s.LocationCode = 'SH'
      GROUP BY sd.ProductCode, p.ProductName, s.LocationCode
      ORDER BY sd.ProductCode
    `;

    const result = await pool.request().query(query);

    console.log(`[/pos-sync/stock-by-location] Fetched stock for ${result.recordset.length} products at location SH`);

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
  if (pool) {
    await pool.close();
    console.log('Database connection pool closed');
  }
  process.exit(0);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/** Start server */
const PORT = process.env.PORT || 3001;
startServer();
async function startServer() {
  try {
    await initializePool();
    app.listen(PORT, () => {
      console.log(`POS Sync Agent listening on port ${PORT}`);
      console.log(`API Key validation: ENABLED`);
      console.log(`Database: ${process.env.DB_SERVER}/${process.env.DB_DATABASE}`);
      console.log(`Live Server: ${process.env.LIVE_SERVER_URL || 'NOT CONFIGURED'}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

module.exports = app;
module.exports.getPool = () => pool;
