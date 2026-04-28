/**
 * Check real-time stock from stockdetails by location
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

async function checkStock() {
  try {
    const pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    
    console.log('✅ Connected to SQL Server\n');
    
    const LOCATION_CODE = 'SH';
    
    console.log('=== Checking AROMAT SEASONING (0000080402053) ===\n');
    
    // Check what's in stockdetails
    let result = await pool.request().query(`
      SELECT 
        sd.ProductCode,
        sd.StockQty,
        sd.StockOut,
        s.LocationCode,
        s.GRNNo
      FROM POS.dbo.stockdetails sd
      LEFT JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
      WHERE sd.ProductCode = '0000080402053'
      ORDER BY s.LocationCode
    `);
    
    console.log('Raw stockdetails data:');
    console.table(result.recordset);
    
    // Check with location filter
    console.log('\n=== Filtered by Location: SH ===');
    result = await pool.request().input('LocationCode', sql.VarChar(10), LOCATION_CODE).query(`
      SELECT 
        sd.ProductCode,
        sd.StockQty,
        sd.StockOut,
        s.LocationCode,
        SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0)) AS CalculatedStock
      FROM POS.dbo.stockdetails sd
      INNER JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
      WHERE sd.ProductCode = '0000080402053'
      AND s.LocationCode = @LocationCode
      GROUP BY sd.ProductCode, s.LocationCode
    `);
    
    console.table(result.recordset);
    
    // Check DailyStockBalance
    console.log('\n=== DailyStockBalance (March 4) ===');
    result = await pool.request().query(`
      SELECT 
        ProductCode,
        LocationCode,
        StockDate,
        StockBalance
      FROM POS.dbo.DailyStockBalance
      WHERE ProductCode = '0000080402053'
      ORDER BY StockDate DESC
    `);
    
    console.table(result.recordset);
    
    await pool.close();
    console.log('\n✅ Done');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkStock();
