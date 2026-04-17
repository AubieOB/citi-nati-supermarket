/**
 * 🔍 STOCK DIAGNOSTIC TOOL (FIXED)
 * 
 * This script helps identify:
 * 1. All locations and their codes
 * 2. Stock quantities per location
 * 3. Which location has the discrepancy
 * 
 * Usage: node diagnostic-stock-fixed.js
 */

require('dotenv').config();
const sql = require('mssql');

const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function runDiagnostics() {
  try {
    const pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    console.log('✅ Connected to SQL Server\n');

    // 1. Get all locations from stocks table
    console.log('=== STEP 1: Available Locations (from stocks table) ===');
    let result = await pool.request().query(`
      SELECT DISTINCT LocationCode
      FROM POS.dbo.stocks
      ORDER BY LocationCode
    `);
    console.log('Available locations:');
    result.recordset.forEach(row => console.log(`  - ${row.LocationCode}`));
    console.log('');

    // 2. Get current location code
    console.log('=== STEP 2: Current Location Code in .env ===');
    console.log(`POS_LOCATION_CODE=${process.env.POS_LOCATION_CODE || 'SH'}\n`);

    // 3. Sample products with stock by location
    console.log('=== STEP 3: Sample Products with Stock by Location ===');
    result = await pool.request().query(`
      SELECT TOP 10
        p.ProductCode,
        p.ProductName,
        s.LocationCode,
        SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0)) AS AvailableStock
      FROM POS.dbo.productsmaster p
      LEFT JOIN POS.dbo.stockdetails sd ON p.ProductCode = sd.ProductCode
      LEFT JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
      WHERE p.ProductCode IS NOT NULL
      GROUP BY p.ProductCode, p.ProductName, s.LocationCode
      ORDER BY p.ProductCode, s.LocationCode
    `);
    if (result.recordset.length > 0) {
      console.table(result.recordset);
    } else {
      console.log('No results found');
    }
    console.log('');

    // 4. Check what the CURRENT query returns (with location filter)
    const LOCATION_CODE = process.env.POS_LOCATION_CODE || 'SH';
    console.log(`=== STEP 4: Current Query Output (Location: ${LOCATION_CODE}) ===`);
    result = await pool.request().input('LocationCode', sql.VarChar(10), LOCATION_CODE).query(`
      SELECT TOP 10
        p.ProductCode,
        p.ProductName,
        ISNULL((
            SELECT SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0))
            FROM POS.dbo.stockdetails sd
            INNER JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
            WHERE sd.ProductCode = p.ProductCode
            AND s.LocationCode = @LocationCode
        ), 0) AS QuantityAvailable
      FROM POS.dbo.productsmaster p
      ORDER BY p.ProductCode
    `);
    if (result.recordset.length > 0) {
      console.table(result.recordset);
    } else {
      console.log('No results found');
    }
    console.log('');

    // 5. Check if stock is aggregated from all locations
    console.log('=== STEP 5: Total Stock (All Locations Combined) ===');
    result = await pool.request().query(`
      SELECT TOP 10
        p.ProductCode,
        p.ProductName,
        ISNULL((
            SELECT SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0))
            FROM POS.dbo.stockdetails sd
            WHERE sd.ProductCode = p.ProductCode
        ), 0) AS TotalStockAllLocations
      FROM POS.dbo.productsmaster p
      ORDER BY p.ProductCode
    `);
    if (result.recordset.length > 0) {
      console.table(result.recordset);
    } else {
      console.log('No results found');
    }
    console.log('');

    // 6. Detailed view: Compare same product across locations
    console.log('=== STEP 6: Detailed Comparison (One Product Across All Locations) ===');
    result = await pool.request().query(`
      SELECT TOP 1 ProductCode FROM POS.dbo.productsmaster ORDER BY ProductCode
    `);
    
    if (result.recordset.length > 0) {
      const sampleProductCode = result.recordset[0].ProductCode;
      console.log(`Sample Product: ${sampleProductCode}\n`);
      
      result = await pool.request().input('ProductCode', sql.VarChar(50), sampleProductCode).query(`
        SELECT 
          p.ProductCode,
          p.ProductName,
          ISNULL(s.LocationCode, 'NO LOCATION') AS LocationCode,
          SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0)) AS Stock
        FROM POS.dbo.productsmaster p
        LEFT JOIN POS.dbo.stockdetails sd ON p.ProductCode = sd.ProductCode
        LEFT JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
        WHERE p.ProductCode = @ProductCode
        GROUP BY p.ProductCode, p.ProductName, s.LocationCode
        ORDER BY LocationCode
      `);
      console.table(result.recordset);
    }
    console.log('');

    // 7. Check stockdetails structure
    console.log('=== STEP 7: Sample Data from stockdetails ===');
    result = await pool.request().query(`
      SELECT TOP 5 
        sd.ProductCode,
        sd.StockQty,
        sd.StockOut,
        s.LocationCode
      FROM POS.dbo.stockdetails sd
      LEFT JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
    `);
    if (result.recordset.length > 0) {
      console.table(result.recordset);
    }

    await pool.close();
    console.log('\n✅ Diagnostic complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

runDiagnostics();
