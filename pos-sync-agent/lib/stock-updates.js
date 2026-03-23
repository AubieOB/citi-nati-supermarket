/**
 * Stock Update Module
 * Handles stock quantity reduction and updates upon sales
 * Maintains inventory accuracy across locations
 */

const sql = require('mssql');

function createScopedRequest(request) {
  if (request && request.transaction) {
    return new sql.Request(request.transaction);
  }

  if (request && request.parent) {
    return new sql.Request(request.parent);
  }

  return request;
}

/**
 * Get current stock quantity for a product at a location
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code
 * @returns {Promise<number>} Current stock quantity
 */
async function getCurrentStock(request, productCode, locationCode) {
  try {
    const stockRequest = createScopedRequest(request);
    const query = `
      SELECT TOP 1
          ISNULL(SUM(pa.QtyIn), 0) - ISNULL(SUM(pa.QtyOut), 0) AS CurrentStock
      FROM POS.dbo.ProductActivity pa
      WHERE pa.ProductCode = @ProductCode
      AND pa.LocationCode = @LocationCode
    `;

    stockRequest.input('ProductCode', sql.VarChar(50), productCode);
    stockRequest.input('LocationCode', sql.VarChar(10), locationCode);

    const result = await stockRequest.query(query);

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

    const insertRequest = createScopedRequest(request);
    insertRequest.input('ProductCode', sql.VarChar(50), productCode);
    insertRequest.input('LocationCode', sql.VarChar(10), locationCode);
    insertRequest.input('QtyOut', sql.Decimal(18, 2), qtyReduction);
    insertRequest.input('ActivityDate', sql.DateTime, new Date());

    await insertRequest.query(query);

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
    const checkRequest = createScopedRequest(request);
    // Check if stock exists in stocks table
    const checkQuery = `
      SELECT TOP 1 StockQty
      FROM POS.dbo.stocks
      WHERE ProductCode = @ProductCode
      AND LocationCode = @LocationCode
    `;

    checkRequest.input('ProductCode', sql.VarChar(50), productCode);
    checkRequest.input('LocationCode', sql.VarChar(10), locationCode);

    const checkResult = await checkRequest.query(checkQuery);

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

      const insertRequest = createScopedRequest(request);
      insertRequest.input('ProductCode', sql.VarChar(50), productCode);
      insertRequest.input('LocationCode', sql.VarChar(10), locationCode);
      insertRequest.input('StockQty', sql.Decimal(18, 2), -qtyReduction);
      insertRequest.input('LastPrice', sql.Decimal(18, 2), unitPrice || 0);
      insertRequest.input('StockDate', sql.DateTime, new Date());

      await insertRequest.query(insertQuery);
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

      const updateRequest = createScopedRequest(request);
      updateRequest.input('ProductCode', sql.VarChar(50), productCode);
      updateRequest.input('LocationCode', sql.VarChar(10), locationCode);
      updateRequest.input('QtyReduction', sql.Decimal(18, 2), qtyReduction);
      updateRequest.input('LastPrice', sql.Decimal(18, 2), unitPrice || 0);
      updateRequest.input('StockDate', sql.DateTime, new Date());

      await updateRequest.query(updateQuery);
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
 * Writes to dbo.stockadjustments (header) + dbo.stockadjdetails (detail).
 * Also writes QtyOut into ProductActivity so POS stock truth updates immediately.
 * Confirmed schema:
 *   stockadjustments: StockAdjID (identity PK), LocationCode varchar(6), RefNo varchar(255), AdjDate datetime
 *   stockadjdetails:  DetailID (identity PK), AdjustID int, ProductCode varchar(6), Quantity decimal
 */
async function applyManualStockDecrease(request, payload) {
  const {
    productCode,
    locationCode,
    oldStock,
    newStock,
    qtyReduction,
    commandId,
    reason,
  } = payload;

  console.log('[STOCK] applyManualStockDecrease payload:', {
    productCode,
    locationCode,
    oldStock,
    newStock,
    qtyReduction,
    commandId,
    reason,
  });

  if (!productCode || !locationCode) {
    throw new Error('NON_RETRYABLE: productCode and locationCode are required');
  }

  if (!Number.isFinite(qtyReduction) || qtyReduction <= 0) {
    throw new Error('NON_RETRYABLE: qtyReduction must be a positive number');
  }

  const refNo = `WEB-ADJ-${commandId || Date.now()}`;
  const adjDate = new Date();

  // ── Step 1: insert header into dbo.stockadjustments ──────────────────────
  console.log('[STOCK] inserting header into dbo.stockadjustments:', { locationCode, refNo, adjDate });
  console.log('[STOCK] schema fields used (header): LocationCode, RefNo, AdjDate');

  const headerRequest = createScopedRequest(request);
  headerRequest.input('HeaderLocationCode', sql.VarChar(6), locationCode);
  headerRequest.input('HeaderRefNo', sql.VarChar(255), refNo);
  headerRequest.input('HeaderAdjDate', sql.DateTime, adjDate);

  const headerResult = await headerRequest.query(`
    INSERT INTO POS.dbo.stockadjustments (LocationCode, RefNo, AdjDate)
    OUTPUT INSERTED.StockAdjID
    VALUES (@HeaderLocationCode, @HeaderRefNo, @HeaderAdjDate)
  `);

  if (!headerResult.recordset || headerResult.recordset.length === 0) {
    throw new Error('Failed to insert stockadjustments header: no StockAdjID returned');
  }

  const stockAdjId = headerResult.recordset[0].StockAdjID;
  console.log('[STOCK] inserted StockAdjID:', stockAdjId);

  // ── Step 2: insert detail into dbo.stockadjdetails ───────────────────────
  console.log('[STOCK] inserting detail into dbo.stockadjdetails:', { stockAdjId, productCode, qtyReduction });
  console.log('[STOCK] schema fields used (detail): AdjustID, ProductCode, Quantity');

  const detailRequest = createScopedRequest(request);
  detailRequest.input('DetailAdjustID', sql.Int, stockAdjId);
  // ProductCode column is varchar(6) in confirmed schema; use VarChar(50) param to pass value
  // SQL Server will enforce its own column length at insert time
  detailRequest.input('DetailProductCode', sql.VarChar(50), productCode);
  detailRequest.input('DetailQuantity', sql.Decimal(18, 2), qtyReduction);

  const detailResult = await detailRequest.query(`
    INSERT INTO POS.dbo.stockadjdetails (AdjustID, ProductCode, Quantity)
    VALUES (@DetailAdjustID, @DetailProductCode, @DetailQuantity)
  `);

  const detailRowsAffected = detailResult.rowsAffected && detailResult.rowsAffected[0];
  console.log('[STOCK] detail rows affected:', detailRowsAffected);

  // ── Step 3: insert QtyOut into ProductActivity (source-of-truth for stock) ──
  const activityRequest = createScopedRequest(request);
  activityRequest.input('ActivityProductCode', sql.VarChar(50), productCode);
  activityRequest.input('ActivityLocationCode', sql.VarChar(10), locationCode);
  activityRequest.input('ActivityQtyOut', sql.Decimal(18, 2), qtyReduction);
  activityRequest.input('ActivityDate', sql.DateTime, adjDate);

  await activityRequest.query(`
    INSERT INTO POS.dbo.ProductActivity (
      ProductCode,
      LocationCode,
      QtyIn,
      QtyOut,
      ActivityDate,
      ActivityType
    )
    VALUES (
      @ActivityProductCode,
      @ActivityLocationCode,
      0,
      @ActivityQtyOut,
      @ActivityDate,
      'SALE'
    )
  `);

  console.log('[STOCK] adjustment path: dbo.stockadjustments + dbo.stockadjdetails + dbo.ProductActivity');

  return {
    stockAdjId,
    productCode,
    locationCode,
    qtyReduction,
    refNo,
    oldStock,
    newStock,
    reason,
    tablesTouched: ['dbo.stockadjustments', 'dbo.stockadjdetails', 'dbo.ProductActivity'],
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
