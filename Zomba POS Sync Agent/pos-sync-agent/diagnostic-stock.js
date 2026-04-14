/**
 * 🔍 STOCK DIAGNOSTIC TOOL
 * 
 * This script helps identify:
 * 1. All locations and their codes
 * 2. Stock quantities per location
 * 3. Which location has the discrepancy
 * 
 * Usage: node diagnostic-stock.js
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

    // 0. First, check what tables exist
    console.log('=== STEP 0: Available Tables ===');
    let result = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'dbo'
      ORDER BY TABLE_NAME
    `);
    console.log('Tables in database:');
    result.recordset.forEach(r => console.log('  - ' + r.TABLE_NAME));
    console.log('');

    // 1. Get locations from stocks table
    console.log('=== STEP 1: Available Locations (from stocks table) ===');
    result = await pool.request().query(`
      SELECT DISTINCT LocationCode
      FROM POS.dbo.stocks
      ORDER BY LocationCode
    `);
    console.log('Unique location codes:');
    if (result.recordset.length > 0) {
      result.recordset.forEach(r => console.log('  - ' + r.LocationCode));
    } else {
      console.log('  (No locations found)');
    }
    console.log('');

    // 2. Get stock by location for a sample product (e.g., first product)
    console.log('=== STEP 2: Current Location Code in .env ===');
    console.log(`POS_LOCATION_CODE=${process.env.POS_LOCATION_CODE || 'SH'}\n`);

    // 3. Pick a product to diagnose
    console.log('=== STEP 3: Sample Products with Stock by Location ===');
    result = await pool.request().query(`
      SELECT TOP 5
        p.ProductCode,
        p.ProductName,
        s.LocationCode,
        st.StoreName,
        SUM(sd.StockQty - ISNULL(sd.StockOut, 0)) AS AvailableStock
      FROM POS.dbo.productsmaster p
      LEFT JOIN POS.dbo.stockdetails sd ON p.ProductCode = sd.ProductCode
      LEFT JOIN POS.dbo.stores st ON sd.StoreCode = st.StoreCode
      LEFT JOIN POS.dbo.stores s ON sd.StoreCode = s.StoreCode
      GROUP BY p.ProductCode, p.ProductName, s.LocationCode, st.StoreName
      ORDER BY p.ProductCode, s.LocationCode
    `);
    console.log(result.recordset);
    console.log('');

    // 4. Check what the current query returns
    const LOCATION_CODE = process.env.POS_LOCATION_CODE || 'SH';
    console.log(`=== STEP 4: Current Query Output (Location: ${LOCATION_CODE}) ===`);
    result = await pool.request().input('LocationCode', sql.VarChar(10), LOCATION_CODE).query(`
      SELECT TOP 5
        p.ProductCode,
        p.ProductName,
        ISNULL((
            SELECT SUM(sd.StockQty - ISNULL(sd.StockOut, 0))
            FROM POS.dbo.stockdetails sd
            INNER JOIN POS.dbo.stores s ON sd.StoreCode = s.StoreCode
            WHERE sd.ProductCode = p.ProductCode
            AND s.LocationCode = @LocationCode
        ), 0) AS QuantityAvailable
      FROM POS.dbo.productsmaster p
      ORDER BY p.ProductCode
    `);
    console.log(result.recordset);
    console.log('');

    // 5. Check if stock is aggregated from all locations
    console.log('=== STEP 5: Total Stock (All Locations) ===');
    result = await pool.request().query(`
      SELECT TOP 5
        p.ProductCode,
        p.ProductName,
        ISNULL((
            SELECT SUM(sd.StockQty - ISNULL(sd.StockOut, 0))
            FROM POS.dbo.stockdetails sd
            WHERE sd.ProductCode = p.ProductCode
        ), 0) AS TotalStockAllLocations
      FROM POS.dbo.productsmaster p
      ORDER BY p.ProductCode
    `);
    console.log(result.recordset);
    console.log('');

    // 6. Check stock details table structure
    console.log('=== STEP 6: Stock Details Sample Data ===');
    result = await pool.request().query(`
      SELECT TOP 10 * FROM POS.dbo.stockdetails
    `);
    if (result.recordset.length > 0) {
      console.log('Columns:', Object.keys(result.recordset[0]));
      console.log('Sample records:');
      console.log(result.recordset);
    }

    await pool.close();
    console.log('\n✅ Diagnostic complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

runDiagnostics();
