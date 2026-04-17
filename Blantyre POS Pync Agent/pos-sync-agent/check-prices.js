/**
 * Check GlobalPrices table structure and data
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

async function checkGlobalPrices() {
  try {
    const pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    
    console.log('✅ Connected to SQL Server\n');
    
    console.log('=== GlobalPrices Table Structure ===');
    let result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'GlobalPrices'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(result.recordset);
    
    console.log('\n=== Sample GlobalPrices Data ===');
    result = await pool.request().query(`
      SELECT TOP 10 * FROM POS.dbo.GlobalPrices
    `);
    if (result.recordset.length > 0) {
      console.table(result.recordset);
    } else {
      console.log('No data in GlobalPrices');
    }
    
    console.log('\n=== Checking productprices columns ===');
    result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'productprices'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(result.recordset);
    
    console.log('\n=== Sample productprices Data ===');
    result = await pool.request().query(`
      SELECT TOP 10 * FROM POS.dbo.productprices
    `);
    if (result.recordset.length > 0) {
      console.table(result.recordset);
    } else {
      console.log('No data in productprices');
    }
    
    await pool.close();
    console.log('\n✅ Done');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkGlobalPrices();
