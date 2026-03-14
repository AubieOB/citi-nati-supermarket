/**
 * Price Update Module
 * Handles price updates and promotional price management
 * Uses POS.dbo.productprices as the source-of-truth write table
 */

const sql = require('mssql');

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
    const query = `
      SELECT TOP 1
          PriceID,
          FPrice
      FROM POS.dbo.productprices
      WHERE ProductCode = @ProductCode
      ${locationCode ? 'AND LocationCode = @LocationCode' : ''}
      ${priceTypeCode ? 'AND PriceTypeCode = @PriceTypeCode' : ''}
      ORDER BY PriceID DESC
    `;

    request.input('ProductCode', sql.VarChar(50), productCode);
    if (locationCode) {
      request.input('LocationCode', sql.VarChar(10), locationCode);
    }
    if (priceTypeCode) {
      request.input('PriceTypeCode', sql.VarChar(10), priceTypeCode);
    }

    const result = await request.query(query);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error(`No price record found for product ${productCode}`);
    }

    const priceRecord = result.recordset[0];
    console.log(`[PRICE] Current price for ${productCode}: ${priceRecord.FPrice}`);

    return {
      price: priceRecord.FPrice,
      priceId: priceRecord.PriceID,
    };
  } catch (error) {
    console.error('[PRICE] Error getting current price:', error.message);
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
    const currentPriceInfo = await getCurrentPrice(request, productCode, safeLocation, priceTypeCode);

    const updateQuery = `
      ;WITH LatestPrice AS (
        SELECT TOP 1 PriceID
        FROM POS.dbo.productprices
        WHERE ProductCode = @ProductCode
        AND LocationCode = @LocationCode
        ${priceTypeCode ? 'AND PriceTypeCode = @PriceTypeCode' : ''}
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
    if (priceTypeCode) {
      request.input('PriceTypeCode', sql.VarChar(10), priceTypeCode);
    }

    const updateResult = await request.query(updateQuery);

    if (!updateResult.rowsAffected || updateResult.rowsAffected[0] === 0) {
      throw new Error(`No productprices row matched for ${productCode} at location ${safeLocation}`);
    }

    // GlobalPrices logging is best-effort and should not block a successful price update.
    try {
      const logRequest = request.transaction
        ? new sql.Request(request.transaction)
        : request;
      await logRequest
        .input('LocationCode', sql.VarChar(10), safeLocation)
        .input('ProductCode', sql.VarChar(50), productCode)
        .input('PriceTypeCode', sql.VarChar(10), priceTypeCode || '1')
        .input('OldPrice', sql.Decimal(18, 2), Number(currentPriceInfo.price || 0))
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

    console.log(`[PRICE] ✅ Updated price for ${productCode}: ${currentPriceInfo.price} → ${newPrice}`);
  } catch (error) {
    console.error('[PRICE] Error updating standard price:', error.message);
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
