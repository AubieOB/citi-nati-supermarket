/**
 * Price Update Module
 * Handles price updates and promotional price management
 * Uses POS.dbo.productprices as the source-of-truth write table
 */

const sql = require('mssql');

function shouldDebugProduct(productCode) {
  return String(productCode || '').toUpperCase() === 'STRAWB';
}

function createQueryRequest(request) {
  return request && request.transaction
    ? new sql.Request(request.transaction)
    : request;
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
 * Get promotional price if active
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @returns {Promise<{promotionalPrice: number|null, isActive: boolean, promotionId: number|null}>}
 */
async function getPromotionalPrice(request, productCode) {
  try {
    const query = `
      SELECT TOP 1
          PromotionID,
          PromoPrice,
          IsActive,
          ValidFrom,
          ValidTo
      FROM POS.dbo.ProductPromotions
      WHERE ProductCode = @ProductCode
      AND IsActive = 1
      AND GETDATE() BETWEEN ValidFrom AND ValidTo
      ORDER BY PromotionID DESC
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);

    const result = await request.query(query);

    if (!result.recordset || result.recordset.length === 0) {
      console.log(`[PROMO] No active promotion for ${productCode}`);
      return {
        promotionalPrice: null,
        isActive: false,
        promotionId: null,
      };
    }

    const promo = result.recordset[0];
    console.log(`[PROMO] Active promotion for ${productCode}: ${promo.PromoPrice} (ID: ${promo.PromotionID})`);

    return {
      promotionalPrice: promo.PromoPrice,
      isActive: true,
      promotionId: promo.PromotionID,
    };
  } catch (error) {
    console.error('[PROMO] Error getting promotional price:', error.message);
    // Return no promotion on error (fallback to standard price)
    return {
      promotionalPrice: null,
      isActive: false,
      promotionId: null,
    };
  }
}

/**
 * Apply promotional price (update ProductPriceMatrix to use promotional price)
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {number} promotionalPrice - Promotional price
 * @param {string} locationCode - Location code
 * @returns {Promise<void>}
 */
async function applyPromotionalPrice(request, productCode, promotionalPrice, locationCode) {
  try {
    const query = `
      INSERT INTO POS.dbo.productprices (
        ProductCode,
        FPrice,
        LocationCode,
        EffectiveDate,
        CreatedBy,
        IsPromotion
      )
      VALUES (
        @ProductCode,
        @FPrice,
        @LocationCode,
        @EffectiveDate,
        'WEBSITE_PROMO',
        1
      )
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);
    request.input('FPrice', sql.Decimal(18, 2), promotionalPrice);
    request.input('LocationCode', sql.VarChar(10), locationCode || 'SH');
    request.input('EffectiveDate', sql.DateTime, new Date());

    await request.query(query);

    console.log(`[PRICE PROMO] ✅ Applied promotional price for ${productCode}: ${promotionalPrice}`);
  } catch (error) {
    console.error('[PRICE PROMO] Error applying promotional price:', error.message);
    throw error;
  }
}

/**
 * Revert to standard price (disable promotion)
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code
 * @returns {Promise<void>}
 */
async function revertToStandardPrice(request, productCode, locationCode) {
  try {
    // Get the standard price (before any promotions)
    const standardPriceQuery = `
      SELECT TOP 1
          FPrice
      FROM POS.dbo.productprices
      WHERE ProductCode = @ProductCode
      AND ISNULL(IsPromotion, 0) = 0
      ORDER BY PriceID DESC
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);
    if (locationCode) {
      request.input('LocationCode', sql.VarChar(10), locationCode);
    }

    const result = await request.query(standardPriceQuery);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error(`No standard price found for ${productCode}`);
    }

    const standardPrice = result.recordset[0].FPrice;

    // Insert standard price as current price
    const insertQuery = `
      INSERT INTO POS.dbo.productprices (
        ProductCode,
        FPrice,
        LocationCode,
        EffectiveDate,
        CreatedBy,
        IsPromotion
      )
      VALUES (
        @ProductCode,
        @FPrice,
        @LocationCode,
        @EffectiveDate,
        'WEBSITE_PROMO_REVERTED',
        0
      )
    `;

    request.input('FPrice', sql.Decimal(18, 2), standardPrice);
    request.input('LocationCode', sql.VarChar(10), locationCode || 'SH');
    request.input('EffectiveDate', sql.DateTime, new Date());

    await request.query(insertQuery);

    console.log(`[PRICE REVERTED] ✅ Reverted to standard price for ${productCode}: ${standardPrice}`);
  } catch (error) {
    console.error('[PRICE REVERTED] Error reverting price:', error.message);
    throw error;
  }
}

/**
 * Get resolved price (promotional if active, otherwise standard)
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code
 * @returns {Promise<{price: number, isPromotional: boolean}>}
 */
async function getResolvedPrice(request, productCode, locationCode) {
  try {
    // Check for active promotion
    const promo = await getPromotionalPrice(request, productCode);

    if (promo.isActive && promo.promotionalPrice) {
      return {
        price: promo.promotionalPrice,
        isPromotional: true,
        promotionId: promo.promotionId,
      };
    }

    // Fall back to standard price
    const standardPrice = await getCurrentPrice(request, productCode, locationCode);
    return {
      price: standardPrice.price,
      isPromotional: false,
      promotionId: null,
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
  updateStandardPrice,
  getPromotionalPrice,
  applyPromotionalPrice,
  revertToStandardPrice,
  getResolvedPrice,
  updateBulkPrices,
};
