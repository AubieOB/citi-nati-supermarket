/**
 * Stock Update Module
 * Handles stock quantity reduction and updates upon sales
 * Maintains inventory accuracy across locations
 */

const sql = require('mssql');
const _columnLengthCache = new Map();
const _locationNameCache = new Map();
const _productNameCache = new Map();

const LOCATION_NAME_FALLBACKS = Object.freeze({
  SH: 'SHOP',
  ST999: 'STOCK WRITE OFF',
});

function createScopedRequest(request) {
  if (request && request.transaction) {
    return new sql.Request(request.transaction);
  }

  if (request && request.parent) {
    return new sql.Request(request.parent);
  }

  return request;
}

async function getColumnMaxLength(request, tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;
  if (_columnLengthCache.has(cacheKey)) {
    return _columnLengthCache.get(cacheKey);
  }

  const schemaRequest = createScopedRequest(request);
  schemaRequest.input('TableName', sql.VarChar(128), tableName);
  schemaRequest.input('ColumnName', sql.VarChar(128), columnName);

  const schemaResult = await schemaRequest.query(`
    SELECT CHARACTER_MAXIMUM_LENGTH AS MaxLength
    FROM POS.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = @TableName
      AND COLUMN_NAME = @ColumnName
  `);

  const maxLength = Number(schemaResult?.recordset?.[0]?.MaxLength || 0);
  const normalizedMax = Number.isFinite(maxLength) ? maxLength : 0;
  _columnLengthCache.set(cacheKey, normalizedMax);
  return normalizedMax;
}

async function resolveLocationName(request, locationCode) {
  const normalizedLocationCode = String(locationCode == null ? '' : locationCode).trim();

  if (!normalizedLocationCode) {
    throw new Error('NON_RETRYABLE: locationCode is required to resolve LocationName for ProductActivity');
  }

  if (_locationNameCache.has(normalizedLocationCode)) {
    return _locationNameCache.get(normalizedLocationCode);
  }

  const locationRequest = createScopedRequest(request);
  locationRequest.input('LocationCode', sql.VarChar(10), normalizedLocationCode);

  const locationResult = await locationRequest.query(`
    SELECT TOP 1 LocationName
    FROM POS.dbo.Locations
    WHERE LocationCode = @LocationCode
  `);

  const dbLocationName = locationResult?.recordset?.[0]?.LocationName;
  if (typeof dbLocationName === 'string' && dbLocationName.trim().length > 0) {
    const resolvedName = dbLocationName.trim();
    _locationNameCache.set(normalizedLocationCode, resolvedName);
    return resolvedName;
  }

  const fallbackLocationName = LOCATION_NAME_FALLBACKS[normalizedLocationCode] || '';
  if (fallbackLocationName) {
    console.warn('[STOCK] LocationName resolved via fallback map:', {
      locationCode: normalizedLocationCode,
      locationName: fallbackLocationName,
    });
    _locationNameCache.set(normalizedLocationCode, fallbackLocationName);
    return fallbackLocationName;
  }

  throw new Error(
    `NON_RETRYABLE: could not resolve LocationName for LocationCode "${normalizedLocationCode}". ProductActivity insert aborted.`
  );
}

async function resolveProductName(request, productCode) {
  const normalizedProductCode = String(productCode == null ? '' : productCode);

  if (!normalizedProductCode || normalizedProductCode.trim().length === 0) {
    console.error('[STOCK] ProductName resolution failed: productCode missing/blank', { productCode });
    throw new Error('NON_RETRYABLE: productCode is required to resolve ProductName for ProductActivity');
  }

  if (_productNameCache.has(normalizedProductCode)) {
    return _productNameCache.get(normalizedProductCode);
  }

  const productRequest = createScopedRequest(request);
  productRequest.input('ProductCode', sql.VarChar(50), normalizedProductCode);

  const productResult = await productRequest.query(`
    SELECT TOP 1 ProductName
    FROM POS.dbo.Products
    WHERE ProductCode = @ProductCode
  `);

  const dbProductName = productResult?.recordset?.[0]?.ProductName;
  if (typeof dbProductName !== 'string' || dbProductName.trim().length === 0) {
    console.error('[STOCK] ProductName resolution failed: no ProductName found in POS.dbo.Products', {
      productCode: normalizedProductCode,
    });
    throw new Error(
      `NON_RETRYABLE: could not resolve ProductName for ProductCode "${normalizedProductCode}". ProductActivity insert aborted.`
    );
  }

  const resolvedName = dbProductName.trim();
  _productNameCache.set(normalizedProductCode, resolvedName);
  return resolvedName;
}

async function readStockBalanceView(request, productCode, locationCode) {
  const baseRequest = createScopedRequest(request);
  baseRequest.input('ProductCode', sql.VarChar(50), productCode);
  baseRequest.input('LocationCode', sql.VarChar(10), locationCode);

  try {
    const result = await baseRequest.query(`
      SELECT TOP 1 BalanceQty
      FROM POS.dbo.vw_Stock_Balance
      WHERE ProductCode = @ProductCode
        AND LocationCode = @LocationCode
    `);

    return Number(result?.recordset?.[0]?.BalanceQty || 0);
  } catch (err) {
    console.warn('[STOCK] vw_Stock_Balance query with LocationCode failed, retrying ProductCode-only lookup:', {
      productCode,
      locationCode,
      error: err.message,
    });
  }

  const fallbackRequest = createScopedRequest(request);
  fallbackRequest.input('ProductCode', sql.VarChar(50), productCode);

  const fallbackResult = await fallbackRequest.query(`
    SELECT TOP 1 BalanceQty
    FROM POS.dbo.vw_Stock_Balance
    WHERE ProductCode = @ProductCode
  `);

  return Number(fallbackResult?.recordset?.[0]?.BalanceQty || 0);
}

async function applyFifoStockOutToStockDetails(request, productCode, locationCode, qtyOut) {
  const normalizedQtyOut = Number(qtyOut || 0);
  if (!Number.isFinite(normalizedQtyOut) || normalizedQtyOut <= 0) {
    throw new Error('NON_RETRYABLE: qtyOut must be a positive number for stockdetails update');
  }

  const beforeBalanceQty = await readStockBalanceView(request, productCode, locationCode);
  console.log('[STOCK][STOCKDETAILS] vw_Stock_Balance before:', {
    productCode,
    locationCode,
    BalanceQty: beforeBalanceQty,
  });

  const batchRequest = createScopedRequest(request);
  batchRequest.input('ProductCode', sql.VarChar(50), productCode);
  batchRequest.input('LocationCode', sql.VarChar(10), locationCode);

  const batchResult = await batchRequest.query(`
    SELECT
      sd.StockDetailID,
      sd.GRNNo,
      ISNULL(sd.StockQty, 0) AS StockQty,
      ISNULL(sd.StockOut, 0) AS StockOut,
      ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0) AS AvailableQty
    FROM POS.dbo.stockdetails sd
    WHERE sd.ProductCode = @ProductCode
      AND sd.LocationCode = @LocationCode
      AND ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0) > 0
    ORDER BY
      CASE WHEN sd.GRNNo IS NULL OR LTRIM(RTRIM(sd.GRNNo)) = '' THEN 1 ELSE 0 END,
      sd.GRNNo ASC,
      sd.StockDetailID ASC
  `);

  const batches = batchResult?.recordset || [];
  const totalAvailable = batches.reduce((sum, row) => sum + Number(row.AvailableQty || 0), 0);

  if (totalAvailable < normalizedQtyOut) {
    throw new Error(
      `NON_RETRYABLE: insufficient stockdetails balance for manual decrease. Available=${totalAvailable}, Requested=${normalizedQtyOut}`
    );
  }

  let remaining = normalizedQtyOut;
  let totalRowsAffected = 0;

  for (const batch of batches) {
    if (remaining <= 0) {
      break;
    }

    const stockDetailId = Number(batch.StockDetailID);
    const stockQty = Number(batch.StockQty || 0);
    const stockOutBefore = Number(batch.StockOut || 0);
    const availableQty = Number(batch.AvailableQty || 0);
    const deductQty = Math.min(remaining, availableQty);
    const stockOutAfter = stockOutBefore + deductQty;

    if (stockOutAfter > stockQty) {
      throw new Error(
        `NON_RETRYABLE: stockdetails overflow prevented for StockDetailID=${stockDetailId}. StockOutAfter=${stockOutAfter}, StockQty=${stockQty}`
      );
    }

    console.log('[STOCK][STOCKDETAILS] FIFO batch before update:', {
      StockDetailID: stockDetailId,
      GRNNo: batch.GRNNo || null,
      ProductCode: productCode,
      LocationCode: locationCode,
      StockQty: stockQty,
      StockOutBefore: stockOutBefore,
      DeductQty: deductQty,
      StockOutAfter: stockOutAfter,
    });

    const updateRequest = createScopedRequest(request);
    updateRequest.input('StockDetailID', sql.Int, stockDetailId);
    updateRequest.input('DeductQty', sql.Decimal(18, 2), deductQty);

    const updateResult = await updateRequest.query(`
      UPDATE POS.dbo.stockdetails
      SET StockOut = ISNULL(StockOut, 0) + @DeductQty
      WHERE StockDetailID = @StockDetailID
        AND ISNULL(StockOut, 0) + @DeductQty <= ISNULL(StockQty, 0)
    `);

    const rowsAffected = Number(updateResult?.rowsAffected?.[0] || 0);
    totalRowsAffected += rowsAffected;

    if (rowsAffected !== 1) {
      throw new Error(
        `Failed to update stockdetails for StockDetailID=${stockDetailId}. rowsAffected=${rowsAffected}`
      );
    }

    console.log('[STOCK][STOCKDETAILS] FIFO batch after update:', {
      StockDetailID: stockDetailId,
      ProductCode: productCode,
      LocationCode: locationCode,
      StockOutBefore: stockOutBefore,
      StockOutAfter: stockOutAfter,
      affectedRows: rowsAffected,
    });

    remaining -= deductQty;
  }

  if (remaining > 0) {
    throw new Error(`Failed to apply full stockdetails deduction. Remaining=${remaining}`);
  }

  const afterBalanceQty = await readStockBalanceView(request, productCode, locationCode);
  console.log('[STOCK][STOCKDETAILS] vw_Stock_Balance after:', {
    productCode,
    locationCode,
    BalanceQty: afterBalanceQty,
  });

  return {
    beforeBalanceQty,
    afterBalanceQty,
    rowsAffected: totalRowsAffected,
  };
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

    const rawCurrentStock = Number(result.recordset[0].CurrentStock || 0);
    const currentStock = Math.max(0, rawCurrentStock);
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

    // Insert QtyOut record into ProductActivity using live schema columns
    const trDate = new Date();
    const resolvedProductName = await resolveProductName(request, productCode);
    const resolvedLocationName = await resolveLocationName(request, locationCode);
    const productNameMaxLength = await getColumnMaxLength(request, 'ProductActivity', 'ProductName');
    const locationNameMaxLength = await getColumnMaxLength(request, 'ProductActivity', 'LocationName');
    const productNameLength = resolvedProductName.length;
    const locationNameLength = resolvedLocationName.length;

    if (productNameMaxLength > 0 && productNameLength > productNameMaxLength) {
      throw new Error(
        `NON_RETRYABLE: ProductName length ${productNameLength} exceeds ProductActivity.ProductName max ${productNameMaxLength}`
      );
    }

    if (locationNameMaxLength > 0 && locationNameLength > locationNameMaxLength) {
      throw new Error(
        `NON_RETRYABLE: LocationName length ${locationNameLength} exceeds ProductActivity.LocationName max ${locationNameMaxLength}`
      );
    }

    const query = `
      INSERT INTO POS.dbo.ProductActivity (
        ProductCode,
        ProductName,
        LocationCode,
        LocationName,
        QtyIn,
        QtyOut,
        Tr_Date,
        TrType,
        TxnType
      )
      VALUES (
        @ProductCode,
        @ProductName,
        @LocationCode,
        @LocationName,
        0,
        @QtyOut,
        @TrDate,
        @TrType,
        @TxnType
      )
    `;

    const insertRequest = createScopedRequest(request);
    insertRequest.input('ProductCode', sql.VarChar(50), productCode);
    insertRequest.input('ProductName', sql.VarChar(Math.max(1, productNameMaxLength || 255)), resolvedProductName);
    insertRequest.input('LocationCode', sql.VarChar(10), locationCode);
    insertRequest.input('LocationName', sql.VarChar(Math.max(1, locationNameMaxLength || 50)), resolvedLocationName);
    insertRequest.input('QtyOut', sql.Decimal(18, 2), qtyReduction);
    insertRequest.input('TrDate', sql.DateTime, trDate);
    insertRequest.input('TrType', sql.VarChar(1), 'S');
    insertRequest.input('TxnType', sql.VarChar(50), 'SALE');

    const salePayload = {
      ProductCode: productCode,
      ProductName: resolvedProductName,
      LocationCode: locationCode,
      LocationName: resolvedLocationName,
      QtyIn: 0,
      QtyOut: qtyReduction,
      Tr_Date: trDate.toISOString(),
      TrType: 'S',
      TxnType: 'SALE',
    };

    console.log('[STOCK] ProductActivity pre-insert:', {
      ProductCode: productCode,
      ProductName: resolvedProductName,
      LocationCode: locationCode,
      LocationName: resolvedLocationName,
      QtyOut: qtyReduction,
      TrType: 'S',
      TxnType: 'SALE',
    });
    console.log('[STOCK] ProductActivity insert target:', 'POS.dbo.ProductActivity');
    console.log('[STOCK] ProductActivity insert columns:', ['ProductCode', 'ProductName', 'LocationCode', 'LocationName', 'QtyIn', 'QtyOut', 'Tr_Date', 'TrType', 'TxnType']);
    console.log('[STOCK] ProductActivity insert payload keys:', Object.keys(salePayload));
    console.log('[STOCK] ProductActivity insert payload:', salePayload);

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

  const exactProductCode = typeof productCode === 'string'
    ? productCode
    : String(productCode == null ? '' : productCode);

  console.log('[STOCK] applyManualStockDecrease payload:', {
    productCode,
    locationCode,
    oldStock,
    newStock,
    qtyReduction,
    commandId,
    reason,
  });

  const POS_PRODUCT_CODE_MAX_LENGTH = 6;

  if (!exactProductCode || !locationCode) {
    throw new Error('NON_RETRYABLE: productCode and locationCode are required');
  }

  if (exactProductCode.trim().length === 0) {
    throw new Error('NON_RETRYABLE: productCode is empty/blank and cannot be used for stock decrement');
  }

  if (exactProductCode.length > POS_PRODUCT_CODE_MAX_LENGTH) {
    throw new Error(
      `NON_RETRYABLE: ProductCode "${exactProductCode}" (${exactProductCode.length} chars) exceeds POS VARCHAR(${POS_PRODUCT_CODE_MAX_LENGTH}) limit. Do not use product names as ProductCode.`
    );
  }

  console.log('[STOCK] ProductCode pre-validation passed:', {
    productCode: exactProductCode,
    length: exactProductCode.length,
    maxAllowed: POS_PRODUCT_CODE_MAX_LENGTH,
  });

  if (!Number.isFinite(qtyReduction) || qtyReduction <= 0) {
    throw new Error('NON_RETRYABLE: qtyReduction must be a positive number');
  }

  const currentStock = await getCurrentStock(request, exactProductCode, locationCode);
  if (currentStock < qtyReduction) {
    throw new Error(`NON_RETRYABLE: insufficient stock for manual decrease. Available=${currentStock}, Requested=${qtyReduction}`);
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
  const allowedProductCodeLength = await getColumnMaxLength(request, 'stockadjdetails', 'ProductCode');
  const productCodeLength = exactProductCode.length;

  console.log('[STOCK] stockadjdetails insert target:', 'POS.dbo.stockadjdetails');
  console.log('[STOCK] stockadjdetails ProductCode validation:', {
    ProductCode: exactProductCode,
    ProductCodeLength: productCodeLength,
    AllowedMaxLength: allowedProductCodeLength,
    commandId: commandId || null,
  });

  if (allowedProductCodeLength > 0 && productCodeLength > allowedProductCodeLength) {
    throw new Error(
      `NON_RETRYABLE: ProductCode length ${productCodeLength} exceeds stockadjdetails.ProductCode max ${allowedProductCodeLength}`
    );
  }

  detailRequest.input('DetailAdjustID', sql.Int, stockAdjId);
  detailRequest.input('DetailProductCode', sql.VarChar(Math.max(1, allowedProductCodeLength || 50)), exactProductCode);
  detailRequest.input('DetailQuantity', sql.Decimal(18, 2), qtyReduction);

  const detailResult = await detailRequest.query(`
    INSERT INTO POS.dbo.stockadjdetails (AdjustID, ProductCode, Quantity)
    VALUES (@DetailAdjustID, @DetailProductCode, @DetailQuantity)
  `);

  const detailRowsAffected = detailResult.rowsAffected && detailResult.rowsAffected[0];
  console.log('[STOCK] detail rows affected:', detailRowsAffected);

  // ── Step 3: insert QtyOut into ProductActivity (source-of-truth for stock) ──
  const resolvedProductName = await resolveProductName(request, exactProductCode);
  const resolvedLocationName = await resolveLocationName(request, locationCode);
  const activityProductNameMaxLength = await getColumnMaxLength(request, 'ProductActivity', 'ProductName');
  const activityLocationNameMaxLength = await getColumnMaxLength(request, 'ProductActivity', 'LocationName');
  const activityProductNameLength = resolvedProductName.length;
  const activityLocationNameLength = resolvedLocationName.length;

  if (activityProductNameMaxLength > 0 && activityProductNameLength > activityProductNameMaxLength) {
    throw new Error(
      `NON_RETRYABLE: ProductName length ${activityProductNameLength} exceeds ProductActivity.ProductName max ${activityProductNameMaxLength}`
    );
  }

  if (activityLocationNameMaxLength > 0 && activityLocationNameLength > activityLocationNameMaxLength) {
    throw new Error(
      `NON_RETRYABLE: LocationName length ${activityLocationNameLength} exceeds ProductActivity.LocationName max ${activityLocationNameMaxLength}`
    );
  }

  const activityRequest = createScopedRequest(request);
  activityRequest.input('ActivityProductCode', sql.VarChar(6), exactProductCode);
  activityRequest.input('ActivityProductName', sql.VarChar(Math.max(1, activityProductNameMaxLength || 255)), resolvedProductName);
  activityRequest.input('ActivityLocationCode', sql.VarChar(10), locationCode);
  activityRequest.input('ActivityLocationName', sql.VarChar(Math.max(1, activityLocationNameMaxLength || 50)), resolvedLocationName);
  activityRequest.input('ActivityQtyOut', sql.Decimal(18, 2), qtyReduction);
  activityRequest.input('ActivityTrDate', sql.DateTime, adjDate);
  activityRequest.input('ActivityTrType', sql.VarChar(1), 'A');
  activityRequest.input('ActivityTxnType', sql.VarChar(10), 'ADJ');

  const adjustmentPayload = {
    ProductCode: exactProductCode,
    ProductName: resolvedProductName,
    LocationCode: locationCode,
    LocationName: resolvedLocationName,
    QtyIn: 0,
    QtyOut: qtyReduction,
    Tr_Date: adjDate.toISOString(),
    TrType: 'A',
    TxnType: 'ADJ',
  };

  console.log('[STOCK] ProductActivity pre-insert:', {
    ProductCode: exactProductCode,
    ProductName: resolvedProductName,
    LocationCode: locationCode,
    LocationName: resolvedLocationName,
    QtyOut: qtyReduction,
    TrType: 'A',
    TxnType: 'ADJ',
  });
  console.log('[STOCK] ProductActivity insert target:', 'POS.dbo.ProductActivity');
  console.log('[STOCK] ProductActivity insert columns:', ['ProductCode', 'ProductName', 'LocationCode', 'LocationName', 'QtyIn', 'QtyOut', 'Tr_Date', 'TrType', 'TxnType']);
  console.log('[STOCK] ProductActivity insert payload keys:', Object.keys(adjustmentPayload));
  console.log('[STOCK] ProductActivity insert payload:', adjustmentPayload);

  await activityRequest.query(`
    INSERT INTO POS.dbo.ProductActivity (
      ProductCode,
      ProductName,
      LocationCode,
      LocationName,
      QtyIn,
      QtyOut,
      Tr_Date,
      TrType,
      TxnType
    )
    VALUES (
      @ActivityProductCode,
      @ActivityProductName,
      @ActivityLocationCode,
      @ActivityLocationName,
      0,
      @ActivityQtyOut,
      @ActivityTrDate,
      @ActivityTrType,
      @ActivityTxnType
    )
  `);

  // ── Step 4: update dbo.stockdetails so POS stock views reflect decrement ──
  const stockDetailsUpdate = await applyFifoStockOutToStockDetails(
    request,
    exactProductCode,
    locationCode,
    qtyReduction
  );

  console.log('[STOCK][STOCKDETAILS] update summary:', stockDetailsUpdate);

  console.log('[STOCK] adjustment path: dbo.stockadjustments + dbo.stockadjdetails + dbo.ProductActivity + dbo.stockdetails');

  return {
    stockAdjId,
    productCode: exactProductCode,
    locationCode,
    qtyReduction,
    refNo,
    oldStock,
    newStock,
    reason,
    tablesTouched: ['dbo.stockadjustments', 'dbo.stockadjdetails', 'dbo.ProductActivity', 'dbo.stockdetails'],
    stockDetailsUpdate,
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
