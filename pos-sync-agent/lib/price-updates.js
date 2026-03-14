/**
 * Price Update Module
 * Handles price updates and promotional price management
 * Uses POS.dbo.productprices as the source-of-truth write table
 */

const sql = require('mssql');

function shouldDebugProduct(productCode) {
  return String(productCode || '').toUpperCase() === 'STRAWB';
}

async function getPriceLookupDiagnostics(request, productCode, locationCode, priceTypeCode) {
  const safeLocation = locationCode || 'SH';
  const safePriceType = priceTypeCode || '1';

  const diagnostics = {
    productCode,
    locationCode: safeLocation,
    priceTypeCode: safePriceType,
    exactMatchCount: 0,
    codeOnlyCount: 0,
    locationOnlyCount: 0,
    priceTypeOnlyCount: 0,
    sampleRows: [],
  };

  const countResult = await request
    .input('DiagProductCode', sql.VarChar(50), productCode)
    .input('DiagLocationCode', sql.VarChar(10), safeLocation)
    .input('DiagPriceTypeCode', sql.VarChar(10), safePriceType)
    .query(`
      SELECT
        SUM(CASE WHEN ProductCode = @DiagProductCode
                  AND LocationCode = @DiagLocationCode
                  AND PriceTypeCode = @DiagPriceTypeCode THEN 1 ELSE 0 END) AS ExactMatchCount,
        SUM(CASE WHEN ProductCode = @DiagProductCode THEN 1 ELSE 0 END) AS CodeOnlyCount,
        SUM(CASE WHEN ProductCode = @DiagProductCode AND LocationCode = @DiagLocationCode THEN 1 ELSE 0 END) AS LocationOnlyCount,
        SUM(CASE WHEN ProductCode = @DiagProductCode AND PriceTypeCode = @DiagPriceTypeCode THEN 1 ELSE 0 END) AS PriceTypeOnlyCount
      FROM POS.dbo.productprices
    `);

  if (countResult.recordset && countResult.recordset[0]) {
    diagnostics.exactMatchCount = Number(countResult.recordset[0].ExactMatchCount || 0);
    diagnostics.codeOnlyCount = Number(countResult.recordset[0].CodeOnlyCount || 0);
    diagnostics.locationOnlyCount = Number(countResult.recordset[0].LocationOnlyCount || 0);
    diagnostics.priceTypeOnlyCount = Number(countResult.recordset[0].PriceTypeOnlyCount || 0);
  }

  if (shouldDebugProduct(productCode)) {
    const sampleResult = await request
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
      priceTypeCode: safePriceType,
    });
    console.log('[PRICE] STRAWB rows in productprices:', diagnostics.sampleRows);
  }

  return diagnostics;
}

/**
 * Get current price for a product (standard price)
 * @param {sql.Request} request - SQL request object
 * @param {string} productCode - Product code
 * @param {string} locationCode - Location code (optional)
 * @param {string} priceTypeCode - Price type code (optional)
 * @returns {Promise<{price: number, priceId: number}>}
 */
async function getCurrentPrice(request, productCode, locationCode, priceTypeCode) {
  try {
    const safeLocation = locationCode || 'SH';
    const safePriceType = priceTypeCode || '1';

    const query = `
      SELECT TOP 1
          PriceID,
          FPrice
      FROM POS.dbo.productprices
      WHERE ProductCode = @ProductCode
      AND LocationCode = @LocationCode
      AND PriceTypeCode = @PriceTypeCode
      ORDER BY PriceID DESC
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);
    request.input('LocationCode', sql.VarChar(10), safeLocation);
    request.input('PriceTypeCode', sql.VarChar(10), safePriceType);

    const diagnostics = await getPriceLookupDiagnostics(request, productCode, safeLocation, safePriceType);
    console.log('[PRICE] lookup diagnostics:', diagnostics);

    const result = await request.query(query);

    if (!result.recordset || result.recordset.length === 0) {
      const details = `No price record found for product ${productCode} (location=${safeLocation}, priceType=${safePriceType}, exactMatchCount=${diagnostics.exactMatchCount}, codeOnlyCount=${diagnostics.codeOnlyCount}, locationOnlyCount=${diagnostics.locationOnlyCount}, priceTypeOnlyCount=${diagnostics.priceTypeOnlyCount})`;
      throw new Error(details);
    }

    const priceRecord = result.recordset[0];
    console.log(`[PRICE] Current price for ${productCode}: ${priceRecord.FPrice}`);

    return {
      price: priceRecord.FPrice,
      priceId: priceRecord.PriceID,
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
async function updateStandardPrice(request, productCode, newPrice, locationCode, priceTypeCode = '1') {
  try {
    const safeLocation = locationCode || 'SH';
    const safePriceType = priceTypeCode || '1';
    console.log('[PRICE] UPDATE_PRICE start:', {
      productCode,
      locationCode: safeLocation,
      priceTypeCode: safePriceType,
      newPrice,
    });

    let currentPriceInfo = null;
    let diagnostics = null;

    try {
      currentPriceInfo = await getCurrentPrice(request, productCode, safeLocation, safePriceType);
      diagnostics = currentPriceInfo.diagnostics || null;
    } catch (error) {
      if (error.message && error.message.includes('No price record found for product')) {
        diagnostics = await getPriceLookupDiagnostics(request, productCode, safeLocation, safePriceType);
        console.warn('[PRICE] No exact productprices row found. Fallback insert will be attempted.', diagnostics);
      } else {
        throw error;
      }
    }

    const updateQuery = `
      ;WITH LatestPrice AS (
        SELECT TOP 1 PriceID
        FROM POS.dbo.productprices
        WHERE ProductCode = @ProductCode
        AND LocationCode = @LocationCode
        AND PriceTypeCode = @PriceTypeCode
        ORDER BY PriceID DESC
      )
      UPDATE pp
      SET
        FPrice = @NewPrice,
        PriceDate = @PriceDate
      FROM POS.dbo.productprices pp
      INNER JOIN LatestPrice lp ON pp.PriceID = lp.PriceID
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);
    request.input('LocationCode', sql.VarChar(10), safeLocation);
    request.input('NewPrice', sql.Decimal(18, 2), newPrice);
    request.input('PriceDate', sql.DateTime, new Date());
    request.input('PriceTypeCode', sql.VarChar(10), safePriceType);

    const updateResult = await request.query(updateQuery);
    const updateAffectedRows = updateResult.rowsAffected && updateResult.rowsAffected[0]
      ? updateResult.rowsAffected[0]
      : 0;
    console.log('[PRICE] update affected rows:', updateAffectedRows);

    let writeAction = 'updated';
    let fallbackInsertAttempted = false;

    if (updateAffectedRows === 0) {
      fallbackInsertAttempted = true;
      console.log('[PRICE] fallback insert attempt: true');
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

      await request.query(insertQuery);
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
        .input('LocationCode', sql.VarChar(10), safeLocation)
        .input('ProductCode', sql.VarChar(50), productCode)
        .input('PriceTypeCode', sql.VarChar(10), safePriceType)
        .input('OldPrice', sql.Decimal(18, 2), Number((currentPriceInfo && currentPriceInfo.price) || 0))
        .input('NewPrice', sql.Decimal(18, 2), Number(newPrice))
        .query(`
          INSERT INTO POS.dbo.GlobalPrices (
            LocationCode,
            ProductCode,
            PriceTypeCode,
            OldPrice,
            NewPrice
          )
          VALUES (
            @LocationCode,
            @ProductCode,
            @PriceTypeCode,
            @OldPrice,
            @NewPrice
          )
        `);
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
      priceTypeCode: safePriceType,
      newPrice,
      oldPrice: currentPriceInfo ? currentPriceInfo.price : null,
      existingRowFound: !!currentPriceInfo,
      matchingRowCount: diagnostics ? diagnostics.exactMatchCount : null,
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
