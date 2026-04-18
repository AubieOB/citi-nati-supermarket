/**
 * Price Update Module
 * Handles price updates and promotional price management
 * Uses POS.dbo.productprices as the source-of-truth write table
 */

const sql = require('mssql');

const DEFAULT_PROMOTION_PRICE_TYPE_CODES = String(process.env.POS_PROMOTION_FALLBACK_PRICE_TYPES || '1,RT')
  .split(',')
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const AUTO_UPDATE_PROMOTIONAL_FLAG = String(process.env.POS_PROMOTION_AUTO_FLAG || 'true').trim().toLowerCase() !== 'false';

function shouldDebugProduct(productCode) {
  return String(productCode || '').toUpperCase() === 'STRAWB';
}

function createQueryRequest(request) {
  return request && request.transaction
    ? new sql.Request(request.transaction)
    : request && request.parent
      ? new sql.Request(request.parent)
    : request;
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function shouldApplyPromotionalFlag(payload) {
  if (payload && payload.updatePromotionalFlag === true) {
    return true;
  }

  if (payload && payload.updatePromotionalFlag === false) {
    return AUTO_UPDATE_PROMOTIONAL_FLAG;
  }

  return AUTO_UPDATE_PROMOTIONAL_FLAG;
}

async function getRecentPriceRows(request, productCode, locationCode, limit = 10) {
  const safeLocation = locationCode || 'SH';
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 10));
  const recentRequest = createQueryRequest(request);

  const result = await recentRequest
    .input('RecentProductCode', sql.VarChar(50), productCode)
    .input('RecentLocationCode', sql.VarChar(10), safeLocation)
    .input('RecentLimit', sql.Int, safeLimit)
    .query(`
      SELECT TOP (@RecentLimit)
          PriceID,
          ProductCode,
          LocationCode,
          PriceTypeCode,
          PriceDate,
          AvgCost,
          FPrice,
          UploadStatus
      FROM POS.dbo.productprices
      WHERE ProductCode = @RecentProductCode
        AND LocationCode = @RecentLocationCode
      ORDER BY PriceID DESC, PriceDate DESC
    `);

  return (result.recordset || []).map((row) => ({
    priceId: row.PriceID,
    productCode: row.ProductCode,
    locationCode: row.LocationCode,
    priceTypeCode: row.PriceTypeCode,
    priceDate: row.PriceDate,
    avgCost: Number(row.AvgCost || 0),
    price: Number(row.FPrice || 0),
    uploadStatus: row.UploadStatus,
  }));
}

async function getProductsPriceFields(request, productCode) {
  const schemaRequest = createQueryRequest(request);
  const schemaResult = await schemaRequest
    .input('ProductsTableName', sql.VarChar(128), 'products')
    .query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = @ProductsTableName
        AND (
          COLUMN_NAME LIKE '%Promo%'
          OR COLUMN_NAME LIKE '%Price%'
          OR COLUMN_NAME LIKE '%Sell%'
        )
      ORDER BY ORDINAL_POSITION
    `);

  const columns = (schemaResult.recordset || [])
    .map((row) => row.COLUMN_NAME)
    .filter(Boolean);

  if (columns.length === 0) {
    return {
      availableColumns: [],
      row: null,
    };
  }

  const quotedColumns = columns.map((column) => `[${column}]`).join(', ');
  const rowRequest = createQueryRequest(request);
  const rowResult = await rowRequest
    .input('ProductsProductCode', sql.VarChar(50), productCode)
    .query(`
      SELECT TOP 1 ProductCode, ${quotedColumns}
      FROM POS.dbo.products
      WHERE ProductCode = @ProductsProductCode
    `);

  return {
    availableColumns: columns,
    row: rowResult.recordset && rowResult.recordset[0] ? rowResult.recordset[0] : null,
  };
}

async function getGlobalPriceRows(request, productCode, locationCode, limit = 5) {
  const safeLocation = locationCode || 'SH';
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5));
  const globalPriceRequest = createQueryRequest(request);

  try {
    const result = await globalPriceRequest
      .input('GlobalPriceProductCode', sql.VarChar(50), productCode)
      .input('GlobalPriceLocationCode', sql.VarChar(10), safeLocation)
      .input('GlobalPriceLimit', sql.Int, safeLimit)
      .query(`
        SELECT TOP (@GlobalPriceLimit) *
        FROM POS.dbo.GlobalPrices
        WHERE ProductCode = @GlobalPriceProductCode
          AND LocationCode = @GlobalPriceLocationCode
        ORDER BY 1 DESC
      `);

    return result.recordset || [];
  } catch (error) {
    return [{ warning: `GlobalPrices lookup skipped: ${error.message}` }];
  }
}

function resolveTargetPriceTypes(requestedPriceTypeCode, recentRows = []) {
  const recentTypes = uniqueValues(recentRows.map((row) => row.priceTypeCode));
  const priority = uniqueValues([
    requestedPriceTypeCode,
    recentRows[0] && recentRows[0].priceTypeCode,
    ...recentTypes,
    ...DEFAULT_PROMOTION_PRICE_TYPE_CODES,
  ]);

  if (recentTypes.length > 0) {
    return priority;
  }

  return uniqueValues([requestedPriceTypeCode, ...DEFAULT_PROMOTION_PRICE_TYPE_CODES]);
}

async function inspectPromotionPriceSources(request, productCode, locationCode, requestedPriceTypeCode) {
  const safeLocation = locationCode || 'SH';
  const safeRequestedPriceTypeCode = requestedPriceTypeCode || 'RT';
  const recentRows = await getRecentPriceRows(request, productCode, safeLocation, 10);
  const latestRequestedTypeRow = await getLatestPriceRow(request, productCode, safeLocation, safeRequestedPriceTypeCode);
  const productFields = await getProductsPriceFields(request, productCode);
  const globalPriceRows = await getGlobalPriceRows(request, productCode, safeLocation, 5);

  return {
    productCode,
    locationCode: safeLocation,
    requestedPriceTypeCode: safeRequestedPriceTypeCode,
    latestRequestedTypeRow,
    latestAnyTypeRow: recentRows[0] || null,
    recentRows,
    targetPriceTypes: resolveTargetPriceTypes(safeRequestedPriceTypeCode, recentRows),
    productFields,
    globalPriceRows,
  };
}

async function getPriceLookupDiagnostics(request, productCode, locationCode, payloadPriceTypeCode) {
  const safeLocation = locationCode || 'SH';
  const safePayloadPriceType = payloadPriceTypeCode || null;

  const diagnostics = {
    productCode,
    locationCode: safeLocation,
    payloadPriceTypeCode: safePayloadPriceType,
    codeAndLocationCount: 0,
    codeOnlyCount: 0,
    payloadTypeMatchCount: 0,
    sampleRows: [],
  };

  const countRequest = createQueryRequest(request);

  const countResult = await countRequest
    .input('DiagProductCode', sql.VarChar(50), productCode)
    .input('DiagLocationCode', sql.VarChar(10), safeLocation)
    .input('DiagPayloadPriceTypeCode', sql.VarChar(10), safePayloadPriceType)
    .query(`
      SELECT
        SUM(CASE WHEN ProductCode = @DiagProductCode AND LocationCode = @DiagLocationCode THEN 1 ELSE 0 END) AS CodeAndLocationCount,
        SUM(CASE WHEN ProductCode = @DiagProductCode THEN 1 ELSE 0 END) AS CodeOnlyCount,
        SUM(CASE WHEN ProductCode = @DiagProductCode
                  AND LocationCode = @DiagLocationCode
                  AND PriceTypeCode = @DiagPayloadPriceTypeCode THEN 1 ELSE 0 END) AS PayloadTypeMatchCount
      FROM POS.dbo.productprices
    `);

  if (countResult.recordset && countResult.recordset[0]) {
    diagnostics.codeAndLocationCount = Number(countResult.recordset[0].CodeAndLocationCount || 0);
    diagnostics.codeOnlyCount = Number(countResult.recordset[0].CodeOnlyCount || 0);
    diagnostics.payloadTypeMatchCount = Number(countResult.recordset[0].PayloadTypeMatchCount || 0);
  }

  if (shouldDebugProduct(productCode) || diagnostics.codeAndLocationCount === 0) {
    const sampleRequest = createQueryRequest(request);

    const sampleResult = await sampleRequest
      .input('DiagSampleProductCode', sql.VarChar(50), productCode)
      .query(`
        SELECT TOP 10
          PriceID,
          ProductCode,
          LocationCode,
          PriceTypeCode,
          FPrice,
          PriceDate
        FROM POS.dbo.productprices
        WHERE ProductCode = @DiagSampleProductCode
        ORDER BY PriceID DESC
      `);

    diagnostics.sampleRows = sampleResult.recordset || [];
    console.log('[PRICE] STRAWB lookup keys:', {
      productCode,
      locationCode: safeLocation,
      payloadPriceTypeCode: safePayloadPriceType,
    });
    console.log('[PRICE] STRAWB rows in productprices:', diagnostics.sampleRows);
  }

  return diagnostics;
}

/**
 * Get latest price row for a product/location
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code (optional)
 * @param {string} payloadPriceTypeCode - Optional payload price type code (advisory)
 * @returns {Promise<{price: number, priceId: number, dbPriceTypeCode: string, diagnostics: object}>}
 */
async function getCurrentPrice(request, productCode, locationCode, payloadPriceTypeCode) {
  try {
    const safeLocation = locationCode || 'SH';

    const diagnostics = await getPriceLookupDiagnostics(request, productCode, safeLocation, payloadPriceTypeCode);
    console.log('[PRICE] lookup diagnostics:', diagnostics);

    const lookupRequest = createQueryRequest(request);
    const query = `
      SELECT TOP 1
          PriceID,
          ProductCode,
          LocationCode,
          PriceTypeCode,
          FPrice,
          PriceDate
      FROM POS.dbo.productprices
      WHERE ProductCode = @ProductCode
      AND LocationCode = @LocationCode
      ORDER BY PriceID DESC
    `;

    const result = await lookupRequest
      .input('LookupProductCode', sql.VarChar(50), productCode)
      .input('LookupLocationCode', sql.VarChar(10), safeLocation)
      .query(query.replace(/@ProductCode/g, '@LookupProductCode').replace(/@LocationCode/g, '@LookupLocationCode'));

    if (!result.recordset || result.recordset.length === 0) {
      const details = `No price record found for product ${productCode} (location=${safeLocation}, codeAndLocationCount=${diagnostics.codeAndLocationCount}, codeOnlyCount=${diagnostics.codeOnlyCount}, payloadTypeMatchCount=${diagnostics.payloadTypeMatchCount})`;
      throw new Error(details);
    }

    const priceRecord = result.recordset[0];

    if (payloadPriceTypeCode && priceRecord.PriceTypeCode !== payloadPriceTypeCode) {
      console.log(`[PRICE] payload priceTypeCode differs from DB row, using DB row PriceTypeCode=${priceRecord.PriceTypeCode}`);
    }

    console.log('[PRICE] discovered DB row:', {
      PriceID: priceRecord.PriceID,
      ProductCode: priceRecord.ProductCode,
      LocationCode: priceRecord.LocationCode,
      PriceTypeCode: priceRecord.PriceTypeCode,
      oldFPrice: priceRecord.FPrice,
      PriceDate: priceRecord.PriceDate,
    });

    return {
      price: priceRecord.FPrice,
      priceId: priceRecord.PriceID,
      dbPriceTypeCode: priceRecord.PriceTypeCode,
      diagnostics,
    };
  } catch (error) {
    console.error('[PRICE ERROR] Error getting current price:', error.message);
    throw error;
  }
}

async function productExists(request, productCode) {
  const existenceRequest = createQueryRequest(request);
  const result = await existenceRequest
    .input('ExistsProductCode', sql.VarChar(50), productCode)
    .query(`
      SELECT TOP 1 ProductCode
      FROM (
        SELECT ProductCode FROM POS.dbo.products WHERE ProductCode = @ExistsProductCode
        UNION ALL
        SELECT ProductCode FROM POS.dbo.productsmaster WHERE ProductCode = @ExistsProductCode
      ) AS product_lookup
    `);

  return !!(result.recordset && result.recordset[0]);
}

async function getLatestPriceRow(request, productCode, locationCode, priceTypeCode) {
  const safeLocation = locationCode || 'SH';
  const safePriceTypeCode = priceTypeCode || 'RT';
  const latestRequest = createQueryRequest(request);

  const result = await latestRequest
    .input('LatestProductCode', sql.VarChar(50), productCode)
    .input('LatestLocationCode', sql.VarChar(10), safeLocation)
    .input('LatestPriceTypeCode', sql.VarChar(10), safePriceTypeCode)
    .query(`
      SELECT TOP 1
          PriceID,
          ProductCode,
          LocationCode,
          PriceTypeCode,
          PriceDate,
          AvgCost,
          FPrice,
          UploadStatus
      FROM POS.dbo.productprices
      WHERE ProductCode = @LatestProductCode
        AND LocationCode = @LatestLocationCode
        AND PriceTypeCode = @LatestPriceTypeCode
      ORDER BY PriceID DESC, PriceDate DESC
    `);

  if (!result.recordset || result.recordset.length === 0) {
    return null;
  }

  const row = result.recordset[0];
  return {
    priceId: row.PriceID,
    productCode: row.ProductCode,
    locationCode: row.LocationCode,
    priceTypeCode: row.PriceTypeCode,
    priceDate: row.PriceDate,
    avgCost: Number(row.AvgCost || 0),
    price: Number(row.FPrice || 0),
    uploadStatus: row.UploadStatus,
  };
}

async function getPreviousPriceRow(request, productCode, locationCode, priceTypeCode, currentPriceId) {
  if (!currentPriceId) {
    return null;
  }

  const safeLocation = locationCode || 'SH';
  const safePriceTypeCode = priceTypeCode || 'RT';
  const previousRequest = createQueryRequest(request);

  const result = await previousRequest
    .input('PreviousProductCode', sql.VarChar(50), productCode)
    .input('PreviousLocationCode', sql.VarChar(10), safeLocation)
    .input('PreviousPriceTypeCode', sql.VarChar(10), safePriceTypeCode)
    .input('CurrentPriceID', sql.Int, currentPriceId)
    .query(`
      SELECT TOP 1
          PriceID,
          ProductCode,
          LocationCode,
          PriceTypeCode,
          PriceDate,
          AvgCost,
          FPrice,
          UploadStatus
      FROM POS.dbo.productprices
      WHERE ProductCode = @PreviousProductCode
        AND LocationCode = @PreviousLocationCode
        AND PriceTypeCode = @PreviousPriceTypeCode
        AND PriceID <> @CurrentPriceID
      ORDER BY PriceID DESC, PriceDate DESC
    `);

  if (!result.recordset || result.recordset.length === 0) {
    return null;
  }

  const row = result.recordset[0];
  return {
    priceId: row.PriceID,
    productCode: row.ProductCode,
    locationCode: row.LocationCode,
    priceTypeCode: row.PriceTypeCode,
    priceDate: row.PriceDate,
    avgCost: Number(row.AvgCost || 0),
    price: Number(row.FPrice || 0),
    uploadStatus: row.UploadStatus,
  };
}

async function insertProductPriceRow(request, {
  productCode,
  locationCode,
  priceTypeCode,
  avgCost,
  price,
}) {
  console.log('[PROMO] insert productprices start', {
    productCode,
    locationCode,
    priceTypeCode,
    avgCost: Number(avgCost || 0),
    fPrice: Number(price),
    uploadStatus: 1,
  });

  const insertRequest = createQueryRequest(request);
  await insertRequest
    .input('InsertProductCode', sql.VarChar(50), productCode)
    .input('InsertLocationCode', sql.VarChar(10), locationCode)
    .input('InsertPriceTypeCode', sql.VarChar(10), priceTypeCode)
    .input('InsertPriceDate', sql.DateTime, new Date())
    .input('InsertAvgCost', sql.Decimal(18, 2), Number(avgCost || 0))
    .input('InsertFPrice', sql.Decimal(18, 2), Number(price))
    .input('InsertUploadStatus', sql.Int, 1)
    .query(`
      INSERT INTO POS.dbo.productprices (
        ProductCode,
        LocationCode,
        PriceTypeCode,
        PriceDate,
        AvgCost,
        FPrice,
        UploadStatus
      )
      VALUES (
        @InsertProductCode,
        @InsertLocationCode,
        @InsertPriceTypeCode,
        @InsertPriceDate,
        @InsertAvgCost,
        @InsertFPrice,
        @InsertUploadStatus
      )
    `);

  const insertedRow = await getLatestPriceRow(request, productCode, locationCode, priceTypeCode);
  if (!insertedRow) {
    console.error('[PROMO] insert productprices failed: latest row not found after insert', {
      productCode,
      locationCode,
      priceTypeCode,
    });
    throw new Error(`Failed to resolve inserted productprices row for ${productCode}`);
  }

  console.log(`[PROMO] insert productprices success: new PriceID=${insertedRow.priceId}`);
  return insertedRow;
}

async function setPromotionalFlag(request, productCode, promotionalValue) {
  const flagRequest = createQueryRequest(request);
  const result = await flagRequest
    .input('FlagProductCode', sql.VarChar(50), productCode)
    .input('FlagValue', sql.Int, promotionalValue)
    .query(`
      UPDATE POS.dbo.products
      SET Promotional = @FlagValue
      WHERE ProductCode = @FlagProductCode
    `);

  return result.rowsAffected && result.rowsAffected[0]
    ? result.rowsAffected[0]
    : 0;
}

/**
 * Update standard price in POS.dbo.productprices
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {number} newPrice - New price
 * @param {string} locationCode - Location code (optional)
 * @param {string} priceTypeCode - Price type code (optional)
 * @returns {Promise<void>}
 */
async function updateStandardPrice(request, productCode, newPrice, locationCode, priceTypeCode = null) {
  try {
    const safeLocation = locationCode || 'SH';
    const payloadPriceTypeCode = priceTypeCode || null;
    console.log('[PRICE] UPDATE_PRICE start:', {
      productCode,
      locationCode: safeLocation,
      priceTypeCode: payloadPriceTypeCode,
      newPrice,
    });

    let currentPriceInfo = null;
    let diagnostics = null;

    try {
      currentPriceInfo = await getCurrentPrice(request, productCode, safeLocation, payloadPriceTypeCode);
      diagnostics = currentPriceInfo.diagnostics || null;
    } catch (error) {
      if (error.message && error.message.includes('No price record found for product')) {
        diagnostics = await getPriceLookupDiagnostics(request, productCode, safeLocation, payloadPriceTypeCode);
        console.warn('[PRICE] No productprices row found by ProductCode+LocationCode. Fallback insert will be attempted.', diagnostics);
      } else {
        throw error;
      }
    }

    let updateAffectedRows = 0;
    console.log('[PRICE] update affected rows:', updateAffectedRows);

    let writeAction = 'updated';
    let fallbackInsertAttempted = false;
    let targetPriceId = null;
    let usedPriceTypeCode = payloadPriceTypeCode;

    if (currentPriceInfo && currentPriceInfo.priceId) {
      const updateRequest = createQueryRequest(request);
      const updateResult = await updateRequest
        .input('UpdatePriceID', sql.Int, currentPriceInfo.priceId)
        .input('UpdateNewPrice', sql.Decimal(18, 2), newPrice)
        .input('UpdatePriceDate', sql.DateTime, new Date())
        .query(`
          UPDATE POS.dbo.productprices
          SET FPrice = @UpdateNewPrice,
              PriceDate = @UpdatePriceDate
          WHERE PriceID = @UpdatePriceID
        `);

      updateAffectedRows = updateResult.rowsAffected && updateResult.rowsAffected[0]
        ? updateResult.rowsAffected[0]
        : 0;
      targetPriceId = currentPriceInfo.priceId;
      usedPriceTypeCode = currentPriceInfo.dbPriceTypeCode || payloadPriceTypeCode;
      console.log('[PRICE] update affected rows:', updateAffectedRows);
    }

    if (updateAffectedRows === 0) {
      fallbackInsertAttempted = true;
      console.log('[PRICE] fallback insert attempt: true');
      const insertRequest = createQueryRequest(request);
      const insertPriceTypeCode = payloadPriceTypeCode || 'RT';
      const insertQuery = `
        INSERT INTO POS.dbo.productprices (
          ProductCode,
          FPrice,
          LocationCode,
          PriceTypeCode,
          PriceDate
        )
        VALUES (
          @ProductCode,
          @NewPrice,
          @LocationCode,
          @PriceTypeCode,
          @PriceDate
        )
      `;

      await insertRequest
        .input('InsertProductCode', sql.VarChar(50), productCode)
        .input('InsertNewPrice', sql.Decimal(18, 2), newPrice)
        .input('InsertLocationCode', sql.VarChar(10), safeLocation)
        .input('InsertPriceTypeCode', sql.VarChar(10), insertPriceTypeCode)
        .input('InsertPriceDate', sql.DateTime, new Date())
        .query(
          insertQuery
            .replace(/@ProductCode/g, '@InsertProductCode')
            .replace(/@NewPrice/g, '@InsertNewPrice')
            .replace(/@LocationCode/g, '@InsertLocationCode')
            .replace(/@PriceTypeCode/g, '@InsertPriceTypeCode')
            .replace(/@PriceDate/g, '@InsertPriceDate')
        );

      usedPriceTypeCode = insertPriceTypeCode;
      writeAction = 'inserted';
    } else {
      console.log('[PRICE] fallback insert attempt: false');
    }

    // GlobalPrices logging is best-effort and should not block a successful price update.
    try {
      const logRequest = request.transaction
        ? new sql.Request(request.transaction)
        : request;
      await logRequest
        .input('LogLocationCode', sql.VarChar(10), safeLocation)
        .input('LogProductCode', sql.VarChar(50), productCode)
        .input('LogPriceTypeCode', sql.VarChar(10), usedPriceTypeCode || payloadPriceTypeCode || 'RT')
        .input('LogOldPrice', sql.Decimal(18, 2), Number((currentPriceInfo && currentPriceInfo.price) || 0))
        .input('LogNewPrice', sql.Decimal(18, 2), Number(newPrice))
        .query(`
          INSERT INTO POS.dbo.GlobalPrices (
            LocationCode,
            ProductCode,
            PriceTypeCode,
            OldPrice,
            NewPrice
          )
          VALUES (
            @LogLocationCode,
            @LogProductCode,
            @LogPriceTypeCode,
            @LogOldPrice,
            @LogNewPrice
          )
        `);
      console.log('[PRICE] GlobalPrices log inserted');
    } catch (globalPriceError) {
      console.warn('[PRICE] GlobalPrices log skipped:', globalPriceError.message);
    }

    const oldPriceText = currentPriceInfo && currentPriceInfo.price != null
      ? `${currentPriceInfo.price}`
      : 'N/A';
    console.log(`[PRICE] ✅ ${writeAction} price for ${productCode}: ${oldPriceText} → ${newPrice}`);

    return {
      productCode,
      locationCode: safeLocation,
      priceTypeCode: usedPriceTypeCode,
      payloadPriceTypeCode,
      newPrice,
      oldPrice: currentPriceInfo ? currentPriceInfo.price : null,
      existingRowFound: !!currentPriceInfo,
      matchingRowCount: diagnostics ? diagnostics.codeAndLocationCount : null,
      targetPriceId,
      updateAffectedRows,
      fallbackInsertAttempted,
      writeAction,
    };
  } catch (error) {
    console.error('[PRICE ERROR] Error updating standard price:', error.message);
    throw error;
  }
}

/**
 * Preview the latest price row that currently drives POS price resolution.
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code
 * @param {string} priceTypeCode - Price type code
 * @returns {Promise<Object>}
 */
async function previewPromotionPrice(request, productCode, locationCode, priceTypeCode) {
  const safeLocation = locationCode || 'SH';
  const safePriceTypeCode = priceTypeCode || 'RT';
  const exists = await productExists(request, productCode);

  if (!exists) {
    return {
      productExists: false,
      productCode,
      locationCode: safeLocation,
      priceTypeCode: safePriceTypeCode,
      latestPriceRow: null,
    };
  }

  const latestPriceRow = await getLatestPriceRow(request, productCode, safeLocation, safePriceTypeCode);
  const sourceDiagnostics = await inspectPromotionPriceSources(request, productCode, safeLocation, safePriceTypeCode);
  return {
    productExists: true,
    productCode,
    locationCode: safeLocation,
    priceTypeCode: safePriceTypeCode,
    latestPriceRow,
    sourceDiagnostics,
  };
}

/**
 * Apply a promotion by inserting a new row into POS.dbo.productprices.
 * @param {sql.Request} request - SQL request object
 * @param {Object} payload - Promotion payload
 * @returns {Promise<Object>}
 */
async function applyPromotionalPrice(request, payload) {
  const productCode = String(payload.productCode || '').trim();
  const locationCode = payload.locationCode || 'SH';
  const priceTypeCode = payload.priceTypeCode || 'RT';
  const promotionalPrice = Number(payload.promotionalPrice);
  const reasonCode = payload.reasonCode || 'EXPIRY_CLEARANCE';
  const shouldUpdatePromotionalFlag = shouldApplyPromotionalFlag(payload);

  if (!productCode) {
    throw new Error('NON_RETRYABLE: productCode is required');
  }

  if (!Number.isFinite(promotionalPrice) || promotionalPrice <= 0) {
    throw new Error('NON_RETRYABLE: promotionalPrice must be greater than 0');
  }

  const exists = await productExists(request, productCode);
  if (!exists) {
    throw new Error(`NON_RETRYABLE: Product ${productCode} does not exist in POS`);
  }

  console.log('[PROMO] latest price lookup start', {
    productCode,
    locationCode,
    priceTypeCode,
    action: 'APPLY_PROMOTION',
  });
  const sourceDiagnosticsBefore = await inspectPromotionPriceSources(request, productCode, locationCode, priceTypeCode);
  const latestPriceRow = sourceDiagnosticsBefore.latestRequestedTypeRow;
  const currentLatestPrice = sourceDiagnosticsBefore.latestAnyTypeRow ? Number(sourceDiagnosticsBefore.latestAnyTypeRow.price) : null;
  const targetPriceTypes = sourceDiagnosticsBefore.targetPriceTypes;
  console.log('[PROMO] latest price lookup success', {
    productCode,
    locationCode,
    priceTypeCode,
    latestPriceRow,
    sourceDiagnosticsBefore,
  });

  console.log(`[PROMO] applying promotion for ProductCode ${productCode}`);
  console.log(`[PROMO] current latest price = ${currentLatestPrice == null ? 'N/A' : currentLatestPrice}`);
  console.log(`[PROMO] new promo price = ${promotionalPrice}`);
  console.log(`[PROMO] reason = ${reasonCode}`);

  if (currentLatestPrice != null && currentLatestPrice === promotionalPrice) {
    throw new Error(`NON_RETRYABLE: Promo price matches current latest price for ${productCode}`);
  }

  const insertedRows = [];
  for (const targetPriceTypeCode of targetPriceTypes) {
    const matchingLatestRow = sourceDiagnosticsBefore.recentRows.find((row) => row.priceTypeCode === targetPriceTypeCode) || latestPriceRow;
    const insertedRow = await insertProductPriceRow(request, {
      productCode,
      locationCode,
      priceTypeCode: targetPriceTypeCode,
      avgCost: matchingLatestRow ? matchingLatestRow.avgCost : 0,
      price: promotionalPrice,
    });
    insertedRows.push(insertedRow);
  }

  let promotionalFlagRowsAffected = 0;
  if (shouldUpdatePromotionalFlag) {
    promotionalFlagRowsAffected = await setPromotionalFlag(request, productCode, 1);
    console.log('[PROMO] products.Promotional updated for promotion apply');
  } else {
    console.log('[PROMO] products.Promotional left untouched');
  }

  const sourceDiagnosticsAfter = await inspectPromotionPriceSources(request, productCode, locationCode, priceTypeCode);
  console.log('[PROMO] apply diagnostics summary', {
    productCode,
    locationCode,
    requestedPriceTypeCode: priceTypeCode,
    targetPriceTypes,
    updatedSource: 'POS.dbo.productprices',
    globalPricesLogged: true,
    promotionalFlagUpdated: shouldUpdatePromotionalFlag,
    promotionalFlagRowsAffected,
    sourceDiagnosticsAfter,
  });

  return {
    action: 'APPLY_PROMOTION',
    productCode,
    locationCode,
    priceTypeCode,
    reasonCode,
    previousPrice: currentLatestPrice,
    promotionalPrice,
    insertedRow: insertedRows[0] || null,
    insertedRows,
    targetPriceTypes,
    sourceDiagnosticsBefore,
    sourceDiagnosticsAfter,
    promotionalFlagUpdated: shouldUpdatePromotionalFlag,
    promotionalFlagRowsAffected,
  };
}

/**
 * Revert a promotion by inserting a new row restoring the prior price.
 * @param {sql.Request} request - SQL request object
 * @param {Object} payload - Revert payload
 * @returns {Promise<Object>}
 */
async function revertToStandardPrice(request, payload) {
  const productCode = String(payload.productCode || '').trim();
  const locationCode = payload.locationCode || 'SH';
  const priceTypeCode = payload.priceTypeCode || 'RT';
  const reasonCode = payload.reasonCode || 'EXPIRY_CLEARANCE';
  const restorePrice = payload.restorePrice == null ? null : Number(payload.restorePrice);
  const shouldUpdatePromotionalFlag = shouldApplyPromotionalFlag(payload);

  if (!productCode) {
    throw new Error('NON_RETRYABLE: productCode is required');
  }

  if (restorePrice != null && (!Number.isFinite(restorePrice) || restorePrice <= 0)) {
    throw new Error('NON_RETRYABLE: restorePrice must be greater than 0 when provided');
  }

  const exists = await productExists(request, productCode);
  if (!exists) {
    throw new Error(`NON_RETRYABLE: Product ${productCode} does not exist in POS`);
  }

  console.log('[PROMO] latest price lookup start', {
    productCode,
    locationCode,
    priceTypeCode,
    action: 'REVERT_PROMOTION',
  });
  const sourceDiagnosticsBefore = await inspectPromotionPriceSources(request, productCode, locationCode, priceTypeCode);
  const latestPriceRow = sourceDiagnosticsBefore.latestRequestedTypeRow;
  const previousPriceRow = latestPriceRow
    ? await getPreviousPriceRow(request, productCode, locationCode, priceTypeCode, latestPriceRow.priceId)
    : null;
  const currentAnyTypeRow = sourceDiagnosticsBefore.latestAnyTypeRow;
  const targetPriceTypes = sourceDiagnosticsBefore.targetPriceTypes;
  console.log('[PROMO] latest price lookup success', {
    productCode,
    locationCode,
    priceTypeCode,
    latestPriceRow,
    previousPriceRow,
    sourceDiagnosticsBefore,
  });

  const currentLatestPrice = currentAnyTypeRow ? Number(currentAnyTypeRow.price) : null;
  const targetRestorePrice = restorePrice != null
    ? restorePrice
    : previousPriceRow
      ? Number(previousPriceRow.price)
      : null;

  console.log(`[PROMO] reverting promotion for ProductCode ${productCode}`);
  console.log(`[PROMO] current latest price = ${currentLatestPrice == null ? 'N/A' : currentLatestPrice}`);
  console.log(`[PROMO] reason = ${reasonCode}`);

  if (targetRestorePrice == null) {
    throw new Error(`NON_RETRYABLE: No prior price found to restore for ${productCode}`);
  }

  if (currentLatestPrice != null && currentLatestPrice === targetRestorePrice) {
    throw new Error(`NON_RETRYABLE: Restore price matches current latest price for ${productCode}`);
  }

  const insertedRows = [];
  for (const targetPriceTypeCode of targetPriceTypes) {
    const matchingLatestRow = sourceDiagnosticsBefore.recentRows.find((row) => row.priceTypeCode === targetPriceTypeCode) || latestPriceRow || previousPriceRow;
    const targetPreviousRow = matchingLatestRow
      ? await getPreviousPriceRow(request, productCode, locationCode, targetPriceTypeCode, matchingLatestRow.priceId)
      : null;
    const resolvedRestorePrice = restorePrice != null
      ? restorePrice
      : targetPreviousRow
        ? Number(targetPreviousRow.price)
        : targetRestorePrice;

    const insertedRow = await insertProductPriceRow(request, {
      productCode,
      locationCode,
      priceTypeCode: targetPriceTypeCode,
      avgCost: matchingLatestRow
        ? matchingLatestRow.avgCost
        : targetPreviousRow
          ? targetPreviousRow.avgCost
          : 0,
      price: resolvedRestorePrice,
    });
    insertedRows.push(insertedRow);
  }

  let promotionalFlagRowsAffected = 0;
  if (shouldUpdatePromotionalFlag) {
    promotionalFlagRowsAffected = await setPromotionalFlag(request, productCode, 0);
    console.log('[PROMO] products.Promotional updated for promotion revert');
  } else {
    console.log('[PROMO] products.Promotional left untouched');
  }

  const sourceDiagnosticsAfter = await inspectPromotionPriceSources(request, productCode, locationCode, priceTypeCode);
  console.log('[PROMO] revert diagnostics summary', {
    productCode,
    locationCode,
    requestedPriceTypeCode: priceTypeCode,
    targetPriceTypes,
    updatedSource: 'POS.dbo.productprices',
    globalPricesLogged: true,
    promotionalFlagUpdated: shouldUpdatePromotionalFlag,
    promotionalFlagRowsAffected,
    sourceDiagnosticsAfter,
  });

  return {
    action: 'REVERT_PROMOTION',
    productCode,
    locationCode,
    priceTypeCode,
    reasonCode,
    currentLatestPrice,
    restorePrice: targetRestorePrice,
    insertedRow: insertedRows[0] || null,
    insertedRows,
    targetPriceTypes,
    previousPriceRow,
    sourceDiagnosticsBefore,
    sourceDiagnosticsAfter,
    promotionalFlagUpdated: shouldUpdatePromotionalFlag,
    promotionalFlagRowsAffected,
  };
}

/**
 * Get latest price row for a product.
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code
 * @param {string} priceTypeCode - Price type code
 * @returns {Promise<{price: number, isPromotional: boolean|null}>}
 */
async function getResolvedPrice(request, productCode, locationCode, priceTypeCode) {
  try {
    const preview = await previewPromotionPrice(request, productCode, locationCode, priceTypeCode);

    if (!preview.productExists) {
      throw new Error(`Product ${productCode} does not exist in POS`);
    }

    if (!preview.latestPriceRow) {
      throw new Error(`No price history found for ${productCode}`);
    }

    return {
      price: preview.latestPriceRow.price,
      isPromotional: preview.sourceDiagnostics && preview.sourceDiagnostics.productFields && preview.sourceDiagnostics.productFields.row
        ? preview.sourceDiagnostics.productFields.row.Promotional
        : null,
      priceId: preview.latestPriceRow.priceId,
      priceDate: preview.latestPriceRow.priceDate,
      locationCode: preview.locationCode,
      priceTypeCode: preview.priceTypeCode,
      sourceDiagnostics: preview.sourceDiagnostics,
    };
  } catch (error) {
    console.error('[PRICE RESOLVED] Error getting resolved price:', error.message);
    throw error;
  }
}

/**
 * Update bulk prices for multiple products
 * @param {sql.Request} request - SQL request object
 * @param {Array} priceUpdates - Array of {productCode, newPrice}
 * @param {string} locationCode - Location code
 * @returns {Promise<Object>} Result with success/fail counts
 */
async function updateBulkPrices(request, priceUpdates, locationCode) {
  try {
    const results = {
      successful: 0,
      failed: 0,
      failedUpdates: [],
    };

    for (const update of priceUpdates) {
      try {
        await updateStandardPrice(
          request,
          update.productCode,
          update.newPrice,
          locationCode,
          update.priceTypeCode || '1'
        );
        results.successful++;
      } catch (error) {
        console.error(`[PRICE BULK] ❌ Failed to update price for ${update.productCode}:`, error.message);
        results.failed++;
        results.failedUpdates.push({
          productCode: update.productCode,
          error: error.message,
        });
      }
    }

    console.log(`[PRICE BULK] ✅ Bulk price update complete. Successful: ${results.successful}, Failed: ${results.failed}`);

    return results;
  } catch (error) {
    console.error('[PRICE BULK] Error in bulk price update:', error.message);
    throw error;
  }
}

module.exports = {
  getCurrentPrice,
  getLatestPriceRow,
  inspectPromotionPriceSources,
  updateStandardPrice,
  previewPromotionPrice,
  applyPromotionalPrice,
  revertToStandardPrice,
  getResolvedPrice,
  updateBulkPrices,
};
