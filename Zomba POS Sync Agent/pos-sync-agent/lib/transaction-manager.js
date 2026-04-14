/**
 * Transaction Manager Module
 * Handles atomic transactions for invoice inserts, stock updates, and price changes
 * Ensures all-or-nothing semantics with rollback on failure
 */

const sql = require('mssql');

/**
 * Executes a transaction with automatic rollback on failure
 * @param {sql.ConnectionPool} pool - SQL connection pool
 * @param {Function} transactionFn - Async function that performs database operations
 * @returns {Promise<{success: boolean, result?: any, error?: string}>}
 */
async function executeTransaction(pool, transactionFn) {
  const connection = await pool.acquire();
  const transaction = new sql.Transaction(connection);

  try {
    await transaction.begin();
    console.log('[TRANSACTION] ✅ Transaction started');

    const result = await transactionFn(new sql.Request(transaction));

    await transaction.commit();
    console.log('[TRANSACTION] ✅ Transaction committed successfully');
    return { success: true, result };
  } catch (error) {
    try {
      await transaction.rollback();
      console.log('[TRANSACTION] ⚠️ Transaction rolled back due to error:', error.message);
    } catch (rollbackErr) {
      console.error('[TRANSACTION] ❌ Rollback failed:', rollbackErr.message);
    }
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
}

/**
 * Validates invoice data structure
 * @param {Object} invoiceData - Invoice data to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateInvoiceData(invoiceData) {
  const errors = [];

  if (!invoiceData.customerCode) errors.push('customerCode is required');
  if (!invoiceData.locationCode) errors.push('locationCode is required');
  if (!Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
    errors.push('items must be a non-empty array');
  }
  if (typeof invoiceData.grossSale !== 'number' || invoiceData.grossSale < 0) {
    errors.push('grossSale must be a non-negative number');
  }
  if (typeof invoiceData.vat !== 'number' || invoiceData.vat < 0) {
    errors.push('vat must be a non-negative number');
  }
  if (typeof invoiceData.discount !== 'number' || invoiceData.discount < 0) {
    errors.push('discount must be a non-negative number');
  }

  // Validate each item
  if (Array.isArray(invoiceData.items)) {
    invoiceData.items.forEach((item, idx) => {
      if (!item.productCode) errors.push(`items[${idx}].productCode is required`);
      if (typeof item.qty !== 'number' || item.qty <= 0) {
        errors.push(`items[${idx}].qty must be a positive number`);
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        errors.push(`items[${idx}].unitPrice must be a non-negative number`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates stock update data structure
 * @param {Object} stockData - Stock data to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateStockData(stockData) {
  const errors = [];

  if (!stockData.productCode) errors.push('productCode is required');
  if (!stockData.locationCode) errors.push('locationCode is required');
  if (typeof stockData.qtyReduction !== 'number' || stockData.qtyReduction < 0) {
    errors.push('qtyReduction must be a non-negative number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates price update data structure
 * @param {Object} priceData - Price data to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validatePriceData(priceData) {
  const errors = [];

  if (!priceData.productCode) errors.push('productCode is required');
  if (typeof priceData.newPrice !== 'number' || priceData.newPrice < 0) {
    errors.push('newPrice must be a non-negative number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  executeTransaction,
  validateInvoiceData,
  validateStockData,
  validatePriceData,
};
