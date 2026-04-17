/**
 * Find correct location code from DailyStockBalance
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

async function findLocation() {
  try {
    const pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    
    console.log('✅ Connected to SQL Server\n');
    
    console.log('=== Available Locations in DailyStockBalance ===');
    let result = await pool.request().query(`
      SELECT DISTINCT LocationCode
      FROM POS.dbo.DailyStockBalance
      ORDER BY LocationCode
    `);
    
    console.log('Locations found:');
    result.recordset.forEach(row => console.log(`  - ${row.LocationCode}`));
    
    console.log('\n=== Sample Stock Data ===');
    result = await pool.request().query(`
      SELECT TOP 10
        ProductCode,
        LocationCode,
        StockDate,
        StockBalance
      FROM POS.dbo.DailyStockBalance
      ORDER BY StockDate DESC, LocationCode
    `);
    console.table(result.recordset);
    
    await pool.close();
    console.log('\n✅ Done - Use one of the location codes above');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

findLocation();
