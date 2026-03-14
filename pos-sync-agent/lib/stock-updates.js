/**
 * Stock Update Module
 * Handles stock quantity reduction and updates upon sales
 * Maintains inventory accuracy across locations
 */

const sql = require('mssql');

/**
 * Get current stock quantity for a product at a location
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code
 * @returns {Promise<number>} Current stock quantity
 */
async function getCurrentStock(request, productCode, locationCode) {
  try {
    const query = `
      SELECT TOP 1
          ISNULL(SUM(pa.QtyIn), 0) - ISNULL(SUM(pa.QtyOut), 0) AS CurrentStock
      FROM POS.dbo.ProductActivity pa
      WHERE pa.ProductCode = @ProductCode
      AND pa.LocationCode = @LocationCode
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);
    request.input('LocationCode', sql.VarChar(10), locationCode);

    const result = await request.query(query);

    if (!result.recordset || result.recordset.length === 0) {
      return 0;
    }

    const currentStock = result.recordset[0].CurrentStock || 0;
    console.log(`[STOCK] Current stock for ${productCode} at ${locationCode}: ${currentStock}`);

    return currentStock;
  } catch (error) {
    console.error('[STOCK] Error getting current stock:', error.message);
    throw error;
  }
}

/**
 * Reduce stock upon sale (insert QtyOut into ProductActivity)
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code
 * @param {number} qtyReduction - Quantity to reduce
 * @returns {Promise<void>}
 */
async function reduceStockOnSale(request, productCode, locationCode, qtyReduction) {
  try {
    // Validate sufficient stock
    const currentStock = await getCurrentStock(request, productCode, locationCode);

    if (currentStock < qtyReduction) {
      throw new Error(
        `Insufficient stock. Product: ${productCode}, Available: ${currentStock}, Required: ${qtyReduction}`
      );
    }

    // Insert QtyOut record into ProductActivity
    const query = `
      INSERT INTO POS.dbo.ProductActivity (
        ProductCode,
        LocationCode,
        QtyIn,
        QtyOut,
        ActivityDate,
        ActivityType
      )
      VALUES (
        @ProductCode,
        @LocationCode,
        0,
        @QtyOut,
        @ActivityDate,
        'SALE'
      )
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);
    request.input('LocationCode', sql.VarChar(10), locationCode);
    request.input('QtyOut', sql.Decimal(18, 2), qtyReduction);
    request.input('ActivityDate', sql.DateTime, new Date());

    await request.query(query);

    console.log(`[STOCK] ✅ Reduced stock for ${productCode} by ${qtyReduction} units at ${locationCode}`);
  } catch (error) {
    console.error('[STOCK] Error reducing stock:', error.message);
    throw error;
  }
}

/**
 * Update stock table directly (alternative method for platforms using stocks table)
 * Reduces Qty and updates LastPrice
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code
 * @param {number} qtyReduction - Quantity to reduce
 * @param {number} unitPrice - Current unit price (optional, for LastPrice update)
 * @returns {Promise<void>}
 */
async function updateStocksTable(request, productCode, locationCode, qtyReduction, unitPrice) {
  try {
    // Check if stock exists in stocks table
    const checkQuery = `
      SELECT TOP 1 StockQty
      FROM POS.dbo.stocks
      WHERE ProductCode = @ProductCode
      AND LocationCode = @LocationCode
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);
    request.input('LocationCode', sql.VarChar(10), locationCode);

    const checkResult = await request.query(checkQuery);

    if (!checkResult.recordset || checkResult.recordset.length === 0) {
      console.warn(`[STOCK] No stock record found for ${productCode} at ${locationCode}. Creating new record.`);

      // Create new stock record
      const insertQuery = `
        INSERT INTO POS.dbo.stocks (
          ProductCode,
          LocationCode,
          StockQty,
          LastPrice,
          StockDate
        )
        VALUES (
          @ProductCode,
          @LocationCode,
          @StockQty,
          @LastPrice,
          @StockDate
        )
      `;

      request.input('StockQty', sql.Decimal(18, 2), -qtyReduction);
      request.input('LastPrice', sql.Decimal(18, 2), unitPrice || 0);
      request.input('StockDate', sql.DateTime, new Date());

      await request.query(insertQuery);
      console.log(`[STOCK] ✅ Created new stock record for ${productCode}`);
    } else {
      // Update existing stock record
      const currentQty = checkResult.recordset[0].StockQty;

      if (currentQty < qtyReduction) {
        throw new Error(
          `Insufficient stock in stocks table. Product: ${productCode}, Available: ${currentQty}, Required: ${qtyReduction}`
        );
      }

      const updateQuery = `
        UPDATE POS.dbo.stocks
        SET StockQty = StockQty - @QtyReduction,
            LastPrice = @LastPrice,
            StockDate = @StockDate
        WHERE ProductCode = @ProductCode
        AND LocationCode = @LocationCode
      `;

      request.input('QtyReduction', sql.Decimal(18, 2), qtyReduction);
      request.input('LastPrice', sql.Decimal(18, 2), unitPrice || 0);
      request.input('StockDate', sql.DateTime, new Date());

      await request.query(updateQuery);
      console.log(`[STOCK] ✅ Updated stocks table for ${productCode}. Qty reduced by ${qtyReduction}`);
    }
  } catch (error) {
    console.error('[STOCK] Error updating stocks table:', error.message);
    throw error;
  }
}

/**
 * Bulk update stock for multiple items (from invoice)
 * @param {sql.Request} request - SQL request object
 * @param {Array} items - Array of items with productCode, qty, unitPrice
 * @param {string} locationCode - Location code
 * @returns {Promise<Object>} Result with success count and failed items
 */
async function updateStockForInvoiceItems(request, items, locationCode) {
  try {
    const results = {
      successful: 0,
      failed: 0,
      failedItems: [],
    };

    for (const item of items) {
      try {
        // Skip hidden products
        if (item.isHidden === true) {
          console.log(`[STOCK BULK] ⚠️ Skipping hidden product: ${item.productCode}`);
          continue;
        }

        const { productCode, qty, unitPrice } = item;

        // Try both methods for stock reduction
        try {
          await reduceStockOnSale(request, productCode, locationCode, qty);
        } catch (productActivityError) {
          console.warn(`[STOCK BULK] ProductActivity insert failed, trying stocks table method:`, productActivityError.message);
          await updateStocksTable(request, productCode, locationCode, qty, unitPrice);
        }

        results.successful++;
      } catch (itemError) {
        console.error(`[STOCK BULK] ❌ Failed to update stock for ${item.productCode}:`, itemError.message);
        results.failed++;
        results.failedItems.push({
          productCode: item.productCode,
          error: itemError.message,
        });
      }
    }

    console.log(`[STOCK BULK] ✅ Stock update complete. Successful: ${results.successful}, Failed: ${results.failed}`);

    if (results.failed > 0) {
      throw new Error(`Failed to update stock for ${results.failed} items: ${JSON.stringify(results.failedItems)}`);
    }

    return results;
  } catch (error) {
    console.error('[STOCK BULK] Error in bulk stock update:', error.message);
    throw error;
  }
}

/**
 * Validate stock availability for all items before committing
 * @param {sql.Request} request - SQL request object
 * @param {Array} items - Array of items to validate
 * @param {string} locationCode - Location code
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
async function validateStockAvailability(request, items, locationCode) {
  try {
    const errors = [];

    for (const item of items) {
      if (item.isHidden === true) continue;

      const currentStock = await getCurrentStock(request, item.productCode, locationCode);

      if (currentStock < item.qty) {
        errors.push(
          `Insufficient stock for ${item.productCode}: available ${currentStock}, requested ${item.qty}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error) {
    console.error('[STOCK VALIDATE] Error validating stock:', error.message);
    return {
      valid: false,
      errors: [error.message],
    };
  }
}

/**
 * Manual admin stock decrease (Phase 2)
 * Uses ProductActivity QtyOut ledger updates to match the active POS schema.
 * This path intentionally avoids derived/reporting tables.
 */
async function applyManualStockDecrease(request, payload) {
  const {
    productCode,
    locationCode,
    oldStock,
    newStock,
    qtyReduction,
    reason,
  } = payload;

  console.log('[STOCK] UPDATE_STOCK payload:', {
    productCode,
    locationCode,
    oldStock,
    newStock,
    qtyReduction,
    reason,
  });

  if (!productCode || !locationCode) {
    throw new Error('NON_RETRYABLE: productCode and locationCode are required');
  }

  if (!Number.isFinite(qtyReduction) || qtyReduction <= 0) {
    throw new Error('NON_RETRYABLE: qtyReduction must be a positive number');
  }

  const productCheckRequest = request.transaction
    ? new sql.Request(request.transaction)
    : request;
  const productResult = await productCheckRequest
    .input('CheckProductCode', sql.VarChar(50), productCode)
    .query(`
      SELECT TOP 1 ProductCode
      FROM POS.dbo.productsmaster
      WHERE ProductCode = @CheckProductCode
    `);

  if (!productResult.recordset || productResult.recordset.length === 0) {
    throw new Error(`NON_RETRYABLE: Product ${productCode} not found in productsmaster`);
  }

  const currentStockRequest = request.transaction
    ? new sql.Request(request.transaction)
    : request;
  const currentStock = await getCurrentStock(currentStockRequest, productCode, locationCode);

  if (currentStock < qtyReduction) {
    throw new Error(
      `NON_RETRYABLE: Insufficient stock. Product: ${productCode}, Available: ${currentStock}, Required: ${qtyReduction}`
    );
  }

  const helperRequest = request.transaction
    ? new sql.Request(request.transaction)
    : request;

  console.log('[STOCK] using ProductActivity QtyOut adjustment helper');
  console.log('[STOCK] SQL tables/functions used:', ['dbo.ProductActivity']);

  await reduceStockOnSale(helperRequest, productCode, locationCode, qtyReduction);

  const verifyRequest = request.transaction
    ? new sql.Request(request.transaction)
    : request;
  const resultingStock = await getCurrentStock(verifyRequest, productCode, locationCode);

  console.log('[STOCK] adjustment path selected: ProductActivity QtyOut ledger insert');
  console.log('[STOCK] rows affected / resulting stock:', {
    productCode,
    locationCode,
    resultingStock,
  });

  return {
    productCode,
    locationCode,
    oldStock,
    newStock,
    qtyReduction,
    reason,
    adjustmentPath: 'product_activity_qtyout_ledger',
    tablesTouched: ['dbo.ProductActivity'],
    resultingStock,
  };
}

module.exports = {
  getCurrentStock,
  reduceStockOnSale,
  updateStocksTable,
  updateStockForInvoiceItems,
  validateStockAvailability,
  applyManualStockDecrease,
};
