/**
 * Populate today's DailyStockBalance from real-time inventory
 * This calculates current stock for each product and location
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

async function populateTodayStock() {
  try {
    const pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    
    console.log('✅ Connected to SQL Server\n');
    
    const TODAY = new Date();
    TODAY.setHours(0, 0, 0, 0);
    
    console.log(`📅 Populating DailyStockBalance for: ${TODAY.toDateString()}\n`);
    
    // Check if today's data already exists
    let result = await pool.request().input('Today', sql.DateTime, TODAY).query(`
      SELECT COUNT(*) as Count
      FROM POS.dbo.DailyStockBalance
      WHERE StockDate = @Today
    `);
    
    const existsCount = result.recordset[0].Count;
    if (existsCount > 0) {
      console.log(`⚠️  Today's data already exists (${existsCount} records)`);
      console.log('Delete and recreate? (y/n)');
      // For automated run, we'll just update
    }
    
    // Calculate current stock from stockdetails
    console.log('🔄 Calculating current stock from inventory...\n');
    
    result = await pool.request().input('Today', sql.DateTime, TODAY).query(`
      INSERT INTO POS.dbo.DailyStockBalance (ProductCode, LocationCode, StockBalance, StockDate)
      SELECT 
        p.ProductCode,
        s.LocationCode,
        SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0)) AS StockBalance,
        @Today AS StockDate
      FROM POS.dbo.productsmaster p
      LEFT JOIN POS.dbo.stockdetails sd ON p.ProductCode = sd.ProductCode
      LEFT JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
      GROUP BY p.ProductCode, s.LocationCode
      ON CONFLICT (ProductCode, LocationCode, StockDate) 
      DO UPDATE SET StockBalance = EXCLUDED.StockBalance
    `);
    
    console.log('✅ DailyStockBalance updated for today\n');
    
    // Show sample results
    console.log('=== Sample Products for Today ===');
    result = await pool.request().input('Today', sql.DateTime, TODAY).query(`
      SELECT TOP 10
        ProductCode,
        LocationCode,
        StockBalance,
        StockDate
      FROM POS.dbo.DailyStockBalance
      WHERE StockDate = @Today
      ORDER BY ProductCode
    `);
    
    console.table(result.recordset);
    
    await pool.close();
    console.log('\n✅ Done - Stock updated for today');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

populateTodayStock();
