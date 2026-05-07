/**
 * 🎯 PROMOTIONS CONTROLLER
 * Handles promotion management for:
 * 1. Global promotions (all products)
 * 2. Category-based promotions
 * 3. Selective product promotions
 */

const { PrismaClient } = require('@prisma/client');
const posCommandQueueService = require('../services/posCommandQueue.service');
const {
  normalizeScopeCode,
  expandOperationalLocationScopeCodes,
  ZOMBA_LOCATION_CODES: CORE_ZOMBA_LOCATION_CODES,
} = require('../utils/operationalScope');
const prisma = new PrismaClient();

const ZOMBA_LOCATION_CODES = ['ZA'].concat(CORE_ZOMBA_LOCATION_CODES);
const POS_DEFAULT_LOCATION_CODE = process.env.POS_LOCATION_CODE || 'BT';
const POS_DEFAULT_PRICE_TYPE_CODE = process.env.POS_PRICE_TYPE_CODE || 'RT';
const POS_PROMO_REASON_CODE = 'WEBSITE_PROMOTION';
const POS_BLANTYRE_SELLING_LOCATION_CODE = normalizeScopeCode(
  process.env.POS_BLANTYRE_SELLING_LOCATION_CODE
  || process.env.POS_BLANTYRE_PROMOTION_LOCATION_CODE
  || 'SH'
) || 'SH';
const POS_ZOMBA_SELLING_LOCATION_CODE = normalizeScopeCode(
  process.env.POS_ZOMBA_SELLING_LOCATION_CODE
  || process.env.POS_ZOMBA_PROMOTION_LOCATION_CODE
  || 'SH'
) || 'SH';

const ACTIVE_PRODUCT_FILTER = {
  isActive: true,
  enabled: true,
};

function normalizeBranchCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (['BT', 'BLANTYRE', 'BLANTYRE_SH'].includes(normalized)) return 'BLANTYRE';
  if (['ZA', 'ZOMBA', 'ZOMBA_SH', 'ZOMBA_BAR', 'ZOMBA_RES'].includes(normalized)) return 'ZOMBA';
  return normalized;
}

function normalizeLocationCode(value) {
  return normalizeScopeCode(value);
}

function getStorefrontLocationCode() {
  return normalizeScopeCode(process.env.STOREFRONT_LOCATION_CODE || process.env.PUBLIC_STOREFRONT_LOCATION_CODE || 'BT');
}

function expandLocationScopeCodes(locationCode) {
  return expandOperationalLocationScopeCodes(locationCode);
}

async function resolveLocationScopedProductCodesFromSales(scopeCodes = []) {
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
    return [];
  }

  const locationCodePredicates = scopeCodes.map((code) => ({
    locationCode: {
      equals: code,
      mode: 'insensitive',
    },
  }));

  const salesRows = await prisma.salesInvoiceItem.findMany({
    where: {
      productCode: { not: null },
      salesInvoice: {
        OR: locationCodePredicates,
      },
    },
    select: {
      productCode: true,
    },
    distinct: ['productCode'],
  });

  return salesRows
    .map((row) => String(row.productCode || '').trim())
    .filter(Boolean);
}

async function resolveLocationScopedProductCodesFromLatestCosts(scopeCodes = []) {
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
    return [];
  }

  const locationCodePredicates = scopeCodes.map((code) => ({
    locationCode: {
      equals: code,
      mode: 'insensitive',
    },
  }));

  const rows = await prisma.posLatestProductCost.findMany({
    where: {
      OR: locationCodePredicates,
    },
    select: {
      productCode: true,
    },
    distinct: ['productCode'],
  });

  return rows
    .map((row) => String(row.productCode || '').trim())
    .filter(Boolean);
}

async function resolveLocationScopedProductCodes(locationCode) {
  const scopeCodes = expandLocationScopeCodes(locationCode);
  if (scopeCodes.length === 0) {
    return [];
  }

  const expiryRows = await prisma.productExpiryBatch.findMany({
    where: {
      OR: scopeCodes.map((code) => ({
        locationCode: {
          equals: code,
          mode: 'insensitive',
        },
      })),
    },
    select: { productCode: true },
    distinct: ['productCode'],
  });

  const scopedCodes = new Set(
    expiryRows
      .map((row) => String(row.productCode || '').trim())
      .filter(Boolean)
  );

  const costCodes = await resolveLocationScopedProductCodesFromLatestCosts(scopeCodes);
  costCodes.forEach((code) => scopedCodes.add(code));

  const salesCodes = await resolveLocationScopedProductCodesFromSales(scopeCodes);
  salesCodes.forEach((code) => scopedCodes.add(code));

  if (scopedCodes.size === 0 && scopeCodes.includes('BT')) {
    const legacyRows = await prisma.product.findMany({
      where: {
        branchCode: 'BLANTYRE',
        sourceCode: { not: null },
      },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });

    legacyRows
      .map((row) => String(row.sourceCode || '').trim())
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
  }

  return Array.from(scopedCodes.values());
}

function normalizeLocationCode(value) {
  // Handle cases like "SH:1" by extracting the location code before the colon
  const cleanValue = String(value || '').trim().split(':')[0];
  return normalizeScopeCode(cleanValue);
}

function normalizeBranchCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (['BT', 'BLANTYRE', 'BLANTYRE_SH'].includes(normalized)) return 'BLANTYRE';
  if (['ZA', 'ZOMBA', 'ZOMBA_SH', 'ZOMBA_BAR', 'ZOMBA_RES'].includes(normalized)) return 'ZOMBA';
  return normalized;
}

function isConcreteZombaOperationalLocationCode(locationCode) {
  return CORE_ZOMBA_LOCATION_CODES.includes(normalizeLocationCode(locationCode));
}

async function resolvePromotionScopedProductCodes(scope) {
  const normalizedLocationCode = normalizeLocationCode(scope?.locationCode);
  if (scope?.branchCode === 'ZOMBA' && (normalizedLocationCode === 'ZA' || isConcreteZombaOperationalLocationCode(normalizedLocationCode))) {
    return null;
  }
  return resolveLocationScopedProductCodes(normalizedLocationCode);
}

function getDefaultPosLocationCodeForBranch(branchCode, requestedLocationCode) {
  if (branchCode === 'BLANTYRE') return POS_BLANTYRE_SELLING_LOCATION_CODE;
  if (branchCode === 'ZOMBA') {
    const normalizedRequested = normalizeLocationCode(requestedLocationCode);
    if (normalizedRequested && CORE_ZOMBA_LOCATION_CODES.includes(normalizedRequested)) {
      return normalizedRequested;
    }
    return POS_ZOMBA_SELLING_LOCATION_CODE;
  }
  return normalizeLocationCode(requestedLocationCode) || POS_DEFAULT_LOCATION_CODE;
}

function resolvePromotionScope(req) {
  const rawLocationCode = req.body?.locationCode || req.query?.locationCode || req.headers['x-location-code'] || null;
  const requestedBranchCode = normalizeBranchCode(req.body?.branchCode || req.query?.branchCode || req.headers['x-branch-code'] || null);
  const locationCode = normalizeLocationCode(rawLocationCode);

  if (!locationCode) {
    return {
      error: 'locationCode is required',
      locationCode: null,
      branchCode: null,
      posLocationCode: null,
    };
  }

  if (!requestedBranchCode) {
    return {
      error: 'branchCode is required for promotions',
      locationCode,
      branchCode: null,
      posLocationCode: null,
    };
  }

  const branchCode = requestedBranchCode;

  if (branchCode === 'ZOMBA' && !ZOMBA_LOCATION_CODES.includes(locationCode)) {
    return {
      error: 'Concrete or branch-wide locationCode is required for Zomba promotions (use ZA, SH, BAR, or ST999)',
      locationCode,
      branchCode,
      posLocationCode: null,
    };
  }

  return {
    error: null,
    locationCode,
    branchCode,
    posLocationCode: getDefaultPosLocationCodeForBranch(branchCode, locationCode),
  };
}

function getScopedActiveProductFilter(branchCode, locationCode = null, scopedProductCodes = null) {
  const where = {
    ...ACTIVE_PRODUCT_FILTER,
    branchCode,
  };

  const normalizedLocationCode = normalizeLocationCode(locationCode);
  if (branchCode === 'ZOMBA') {
    if (normalizedLocationCode === 'ZA') {
      where.OR = CORE_ZOMBA_LOCATION_CODES.map((code) => ({
        locationCode: { equals: code, mode: 'insensitive' },
      }));
      where.price = { gt: 0 };
    } else if (normalizedLocationCode) {
      where.locationCode = {
        equals: normalizedLocationCode,
        mode: 'insensitive',
      };
      where.price = { gt: 0 };
    }
    where.sourceCode = { not: null };
  } else if (Array.isArray(scopedProductCodes) && scopedProductCodes.length > 0) {
    where.sourceCode = { in: scopedProductCodes };
  }

  return where;
}

async function assessPromotionEligibilityForSelectedProducts(parsedSelectedProducts, scope, scopedProductCodes) {
  const eligibleProducts = await prisma.product.findMany({
    where: getPromotionProductWhere('selective', null, parsedSelectedProducts, scope.branchCode, scope.locationCode, scopedProductCodes),
    select: {
      id: true,
      sourceCode: true,
      name: true,
      branchCode: true,
      locationCode: true,
      price: true,
    },
  });

  const eligibleIdSet = new Set(eligibleProducts.map((product) => product.id));
  const outOfScopeIds = parsedSelectedProducts.filter((id) => !eligibleIdSet.has(id));

  const selectedRows = outOfScopeIds.length > 0
    ? await prisma.product.findMany({
      where: { id: { in: outOfScopeIds } },
      select: {
        id: true,
        sourceCode: true,
        name: true,
        branchCode: true,
        locationCode: true,
        price: true,
      },
    })
    : [];

  const selectedById = new Map(selectedRows.map((row) => [row.id, row]));
  const diagnosticRows = [];

  for (const productId of outOfScopeIds) {
    const selected = selectedById.get(productId);
    const productCode = String(selected?.sourceCode || '').trim();
    const masterExists = Boolean(productCode) && Boolean(await prisma.product.findFirst({
      where: {
        branchCode: scope.branchCode,
        sourceCode: {
          equals: productCode,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    }));

    const locationPriceExists = Boolean(productCode) && Boolean(await prisma.product.findFirst({
      where: {
        branchCode: scope.branchCode,
        locationCode: {
          equals: scope.locationCode,
          mode: 'insensitive',
        },
        sourceCode: {
          equals: productCode,
          mode: 'insensitive',
        },
        price: { gt: 0 },
      },
      select: { id: true },
    }));

    const eligible = Boolean(
      selected
      && selected.branchCode === scope.branchCode
      && normalizeLocationCode(selected.locationCode) === normalizeLocationCode(scope.locationCode)
      && Number(selected.price || 0) > 0
    );

    let reason = 'NOT_ELIGIBLE';
    if (!selected) {
      reason = 'NOT_FOUND';
    } else if (selected.branchCode !== scope.branchCode) {
      reason = 'WRONG_BRANCH';
    } else if (normalizeLocationCode(selected.locationCode) !== normalizeLocationCode(scope.locationCode)) {
      reason = 'MIXED_LOCATION_SELECTION';
    } else if (Number(selected.price || 0) <= 0 || !locationPriceExists) {
      reason = 'NO_LOCATION_PRICE_ROW';
    }

    console.log(
      `[PROMOTION ELIGIBILITY] product=${productCode || `ID:${productId}`} location=${scope.locationCode}` +
      ` masterExists=${masterExists} locationPriceExists=${locationPriceExists}` +
      ` eligible=${eligible}${eligible ? '' : ` reason=${reason}`}`
    );

    diagnosticRows.push({
      id: productId,
      sourceCode: productCode || null,
      name: selected?.name || null,
      branchCode: selected?.branchCode || null,
      locationCode: selected?.locationCode || null,
      masterExists,
      locationPriceExists,
      eligible,
      reason,
    });
  }

  return {
    eligibleProducts,
    outOfScopeIds,
    diagnosticRows,
  };
}

function buildPromotionEligibilityError(scope, parsedSelectedProducts, eligibleCount, diagnosticRows) {
  const firstReason = diagnosticRows.find((row) => !row.eligible)?.reason || 'NOT_ELIGIBLE';
  let error = `Selected products are not eligible for ${scope.locationCode}/${scope.branchCode}`;

  if (firstReason === 'NO_LOCATION_PRICE_ROW') {
    error = `One or more selected products exist globally but have no valid ${scope.locationCode} price row`;
  } else if (firstReason === 'MIXED_LOCATION_SELECTION') {
    error = `Selected products are mixed across locations; choose only ${scope.locationCode} products`;
  } else if (firstReason === 'WRONG_BRANCH') {
    error = `Selected products must all belong to ${scope.locationCode}/${scope.branchCode}`;
  }

  return {
    success: false,
    error,
    details: {
      selectedCount: parsedSelectedProducts.length,
      matchedCount: eligibleCount,
      outOfScopeIds: diagnosticRows.map((row) => row.id).slice(0, 20),
      outOfScopeProducts: diagnosticRows.slice(0, 20).map((row) => ({
        id: row.id,
        sourceCode: row.sourceCode,
        reason: row.reason,
        locationCode: row.locationCode,
      })),
    },
  };
}

function parseProductIds(ids = []) {
  const parsed = ids
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isInteger(id) && id > 0);

  return Array.from(new Set(parsed));
}

function getPromotionProductWhere(type, categoryId, selectedProducts, branchCode, locationCode = null, scopedProductCodes = null) {
  const baseWhere = getScopedActiveProductFilter(branchCode, locationCode, scopedProductCodes);

  if (type === 'global') {
    return { ...baseWhere };
  }

  if (type === 'category') {
    return {
      ...baseWhere,
      category: categoryId,
    };
  }

  const parsedIds = parseProductIds(selectedProducts);
  return {
    ...baseWhere,
    id: { in: parsedIds },
  };
}

function buildPromotionUpdateData(product, percentage) {
  const numericPercentage = parseInt(percentage, 10) || 0;
  const discountAmount = (product.price * numericPercentage) / 100;
  const discountedPrice = product.price - discountAmount;
  return {
    originalPrice: product.originalPrice ?? product.price,
    discountPrice: discountedPrice,
    isOnSale: true,
    updatedAt: new Date(),
  };
}

function roundPrice(value) {
  return Number(Number(value).toFixed(2));
}

function getBaseProductPrice(product) {
  if (Number.isFinite(Number(product.originalPrice)) && Number(product.originalPrice) > 0) {
    return Number(product.originalPrice);
  }
  return Number(product.price || 0);
}

function getPromotionalPrice(product, percentage) {
  const base = getBaseProductPrice(product);
  const numericPercentage = Number(percentage || 0);
  const discounted = base - ((base * numericPercentage) / 100);
  return roundPrice(discounted);
}

async function resolveProductsForPosQueue({
  type,
  enabled,
  promotion,
  previousPromotion,
  productCandidates,
  scope,
}) {
  const scopedBranchCode = scope?.branchCode || null;
  const scopedProductCodes = Array.isArray(scope?.scopedProductCodes)
    ? scope.scopedProductCodes
    : null;

  if (enabled && Array.isArray(productCandidates) && productCandidates.length > 0) {
    return productCandidates.map((product) => ({
      id: product.id,
      name: product.name,
      sourceCode: product.sourceCode,
      price: product.price,
      originalPrice: product.originalPrice,
      branchCode: product.branchCode || scopedBranchCode,
    }));
  }

  if (type === 'global') {
    return prisma.product.findMany({
      where: getPromotionProductWhere('global', null, [], scopedBranchCode, scope?.locationCode || null, scopedProductCodes),
      select: {
        id: true,
        name: true,
        sourceCode: true,
        price: true,
        originalPrice: true,
        branchCode: true,
      },
    });
  }

  if (type === 'category') {
    const categoryToUse = previousPromotion?.categoryId || promotion?.categoryId || null;
    if (!categoryToUse) {
      return [];
    }

    return prisma.product.findMany({
      where: getPromotionProductWhere('category', categoryToUse, [], scopedBranchCode, scope?.locationCode || null, scopedProductCodes),
      select: {
        id: true,
        name: true,
        sourceCode: true,
        price: true,
        originalPrice: true,
        branchCode: true,
      },
    });
  }

  const selectiveIds = parseProductIds(
    (previousPromotion?.selectedProductIds && previousPromotion.selectedProductIds.length > 0)
      ? previousPromotion.selectedProductIds
      : (promotion?.selectedProductIds || [])
  );

  if (selectiveIds.length === 0) {
    return [];
  }

  return prisma.product.findMany({
    where: getPromotionProductWhere('selective', null, selectiveIds, scopedBranchCode, scope?.locationCode || null, scopedProductCodes),
    select: {
      id: true,
      name: true,
      sourceCode: true,
      price: true,
      originalPrice: true,
      branchCode: true,
    },
  });
}

async function queuePosPromotionCommands({
  type,
  enabled,
  percentage,
  promotion,
  previousPromotion,
  productCandidates,
  actor,
  scope,
}) {
  const products = await resolveProductsForPosQueue({
    type,
    enabled,
    promotion,
    previousPromotion,
    productCandidates,
    scope,
  });

  if (products.length === 0) {
    console.log(`[PROMO][QUEUE] ${type} resolved product count = 0`);
    return { enqueued: 0, skippedNoSourceCode: 0, skippedInvalidPrice: 0, targetCount: 0, commandType: enabled ? 'APPLY_PROMOTION' : 'REVERT_PROMOTION' };
  }

  const commandType = enabled ? 'APPLY_PROMOTION' : 'REVERT_PROMOTION';

  console.log(`[PROMO][QUEUE] ${type} resolved product count = ${products.length}`);
  console.log(`[PROMO][QUEUE] ${type} resolved source codes (sample):`, products.slice(0, 10).map((p) => ({
    id: p.id,
    sourceCode: p.sourceCode || null,
  })));
  console.log(`[PROMO][QUEUE] ${type} location mapping:`, {
    branchCode: scope?.branchCode || null,
    requestedLocationCode: scope?.locationCode || null,
    posLocationCodeUsedForWriteback: scope?.posLocationCode || POS_DEFAULT_LOCATION_CODE,
    defaultBlantyreSellingLocation: POS_BLANTYRE_SELLING_LOCATION_CODE,
    defaultZombaSellingLocation: POS_ZOMBA_SELLING_LOCATION_CODE,
    priceTypeCode: POS_DEFAULT_PRICE_TYPE_CODE,
  });

  let enqueued = 0;
  let skippedNoSourceCode = 0;
  let skippedInvalidPrice = 0;
  const skippedNoSourceCodeSamples = [];
  const skippedInvalidPriceSamples = [];

  for (const product of products) {
    if (!product.sourceCode) {
      skippedNoSourceCode++;
      if (skippedNoSourceCodeSamples.length < 10) {
        skippedNoSourceCodeSamples.push({ id: product.id, name: product.name || null });
      }
      continue;
    }

    // Log location-availability decision for diagnostics.
    const locationPriceExists = Number(product.price || 0) > 0;
    const promotionLocationCode = scope?.locationCode || null;
    if (promotionLocationCode) {
      console.log(
        `[LOCATION AVAILABILITY] product=${product.sourceCode} location=${promotionLocationCode}` +
        ` masterExists=true locationPriceExists=${locationPriceExists}` +
        ` availability=${locationPriceExists} action=${commandType}` +
        `${locationPriceExists ? '' : ' reason=NO_LOCATION_PRICE_ROW'}`
      );
    }

    if (enabled) {
      const promotionalPrice = getPromotionalPrice(product, percentage);

      if (!Number.isFinite(promotionalPrice) || promotionalPrice <= 0) {
        skippedInvalidPrice++;
        if (skippedInvalidPriceSamples.length < 10) {
          skippedInvalidPriceSamples.push({
            id: product.id,
            sourceCode: product.sourceCode,
            promotionalPrice,
          });
        }
        continue;
      }

      const payload = {
        productCode: product.sourceCode,
        promotionalPrice,
        promoPrice: promotionalPrice,
        locationCode: scope?.posLocationCode || POS_DEFAULT_LOCATION_CODE,
        requestedLocationCode: scope?.locationCode || null,
        branchCode: scope?.branchCode || product.branchCode || null,
        priceTypeCode: POS_DEFAULT_PRICE_TYPE_CODE,
        reasonCode: POS_PROMO_REASON_CODE,
        updatePromotionalFlag: false,
      };

      if (enqueued === 0) {
        console.log(`[PROMO][QUEUE] ${type} commandType=${commandType} sample payload:`, payload);
      }

      await posCommandQueueService.enqueueCommand(commandType, payload, {
        source: `admin.promotions.updatePromotion.${type}.apply`,
        relatedEntityType: 'POS_PRODUCT',
        relatedEntityId: product.sourceCode,
        createdBy: actor,
      });
    } else {
      const restorePrice = roundPrice(getBaseProductPrice(product));

      if (!Number.isFinite(restorePrice) || restorePrice <= 0) {
        skippedInvalidPrice++;
        if (skippedInvalidPriceSamples.length < 10) {
          skippedInvalidPriceSamples.push({
            id: product.id,
            sourceCode: product.sourceCode,
            restorePrice,
          });
        }
        continue;
      }

      const payload = {
        productCode: product.sourceCode,
        restorePrice,
        originalPrice: restorePrice,
        locationCode: scope?.posLocationCode || POS_DEFAULT_LOCATION_CODE,
        requestedLocationCode: scope?.locationCode || null,
        branchCode: scope?.branchCode || product.branchCode || null,
        priceTypeCode: POS_DEFAULT_PRICE_TYPE_CODE,
        reasonCode: POS_PROMO_REASON_CODE,
        updatePromotionalFlag: false,
      };

      if (enqueued === 0) {
        console.log(`[PROMO][QUEUE] ${type} commandType=${commandType} sample payload:`, payload);
      }

      await posCommandQueueService.enqueueCommand(commandType, payload, {
        source: `admin.promotions.updatePromotion.${type}.revert`,
        relatedEntityType: 'POS_PRODUCT',
        relatedEntityId: product.sourceCode,
        createdBy: actor,
      });
    }

    enqueued++;
  }

  const summary = {
    type,
    commandType,
    enqueued,
    skippedNoSourceCode,
    skippedInvalidPrice,
    targetCount: products.length,
    skippedNoSourceCodeSamples,
    skippedInvalidPriceSamples,
  };

  console.log(
    `[PROMO][QUEUE] ${type} summary target=${summary.targetCount} enqueued=${summary.enqueued} skippedNoSourceCode=${summary.skippedNoSourceCode} skippedInvalidPrice=${summary.skippedInvalidPrice}`
  );

  if (summary.skippedNoSourceCode > 0) {
    console.warn('[PROMO][POS QUEUE] skipped products missing sourceCode (sample):', summary.skippedNoSourceCodeSamples);
  }

  if (summary.skippedInvalidPrice > 0) {
    console.warn('[PROMO][POS QUEUE] skipped products with invalid computed price (sample):', summary.skippedInvalidPriceSamples);
  }

  return summary;
}

/**
 * Emit promotion update to all connected clients (both admin and users) via Socket.io
 */
const emitPromotionUpdate = (promotion, scope = null) => {
  try {
    if (global.io) {
      const scopedPromotion = {
        ...promotion,
        branchCode: scope?.branchCode || promotion.branchCode || null,
        locationCode: scope?.locationCode || promotion.locationCode || null,
      };
      // Broadcast to everyone - both admins and users seeing products page need to know
      global.io.emit('promotionUpdated', scopedPromotion);
      console.log(`[Socket.io] Promotion updated: ${promotion.type} - emitted to all clients for ${scopedPromotion.locationCode || scopedPromotion.branchCode || 'unknown-scope'}`);
    }
  } catch (err) {
    console.error('Error emitting promotion:', err);
  }
};

/**
 * Get current promotions
 */
const getCurrentPromotions = async (req, res) => {
  try {
    const scope = resolvePromotionScope(req);
    if (scope.error) {
      return res.status(400).json({
        success: false,
        error: scope.error,
      });
    }

    const promotions = await prisma.promotion.findMany({
      where: {
        branchCode: scope.branchCode,
      },
    });
    
    // Helper to format a promotion record
    const formatPromotion = (promo) => {
      if (!promo) return null;
      return {
        type: promo.type,
        enabled: promo.enabled,
        percentage: promo.percentage,
        categoryId: promo.categoryId || null,
        selectedProducts: promo.selectedProductIds || [],
      };
    };

    // Format promotions by type with safe defaults
    const formattedPromotions = {
      global: formatPromotion(promotions.find(p => p.type === 'global')) || { 
        type: 'global',
        enabled: false, 
        percentage: 10, 
        categoryId: null,
        selectedProducts: []
      },
      category: formatPromotion(promotions.find(p => p.type === 'category')) || { 
        type: 'category',
        enabled: false, 
        percentage: 10, 
        categoryId: null,
        selectedProducts: []
      },
      selective: formatPromotion(promotions.find(p => p.type === 'selective')) || { 
        type: 'selective',
        enabled: false, 
        percentage: 10, 
        categoryId: null,
        selectedProducts: []
      },
    };

    return res.json({
      success: true,
      promotions: formattedPromotions,
    });
  } catch (err) {
    console.error('Error getting promotions:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to get promotions'
    });
  }
};

const getPublicPromotions = async (req, res) => {
  try {
    const branchCode = normalizeBranchCode(req.query.branchCode || req.body?.branchCode || process.env.PUBLIC_PROMOTIONS_BRANCH_CODE || 'BLANTYRE');
    const locationCode = normalizeLocationCode(req.query.locationCode || req.body?.locationCode || getStorefrontLocationCode());

    if (!branchCode) {
      return res.status(400).json({
        success: false,
        error: 'branchCode is required for promotions',
      });
    }

    if (!locationCode) {
      return res.status(400).json({
        success: false,
        error: 'locationCode is required for promotions',
      });
    }

    if (branchCode === 'ZOMBA' && !isConcreteZombaOperationalLocationCode(locationCode)) {
      return res.status(400).json({
        success: false,
        error: 'Concrete locationCode is required for Zomba promotions (use SH, BAR, or ST999)',
      });
    }

    const promotions = await prisma.promotion.findMany({
      where: { branchCode },
    });

    const formatPromotion = (promo) => {
      if (!promo) return null;
      return {
        type: promo.type,
        enabled: promo.enabled,
        percentage: promo.percentage,
        categoryId: promo.categoryId || null,
        selectedProducts: promo.selectedProductIds || [],
      };
    };

    const formattedPromotions = {
      global: formatPromotion(promotions.find(p => p.type === 'global')) || {
        type: 'global',
        enabled: false,
        percentage: 10,
        categoryId: null,
        selectedProducts: []
      },
      category: formatPromotion(promotions.find(p => p.type === 'category')) || {
        type: 'category',
        enabled: false,
        percentage: 10,
        categoryId: null,
        selectedProducts: []
      },
      selective: formatPromotion(promotions.find(p => p.type === 'selective')) || {
        type: 'selective',
        enabled: false,
        percentage: 10,
        categoryId: null,
        selectedProducts: []
      },
    };

    return res.json({
      success: true,
      promotions: formattedPromotions,
    });
  } catch (err) {
    console.error('Error getting public promotions:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to get promotions',
    });
  }
};

/**
 * Activate or deactivate a promotion and apply it
 */
const updatePromotion = async (req, res) => {
  try {
    const { type } = req.params;
    const { enabled, percentage, categoryId, selectedProducts } = req.body;
    const parsedSelectedProducts = parseProductIds(selectedProducts || []);
    const actor = req.user?.email || String(req.user?.userId || req.user?.id || 'admin');
    const scope = resolvePromotionScope(req);

    if (scope.error) {
      return res.status(400).json({
        success: false,
        error: scope.error,
      });
    }

    const scopedProductCodes = await resolvePromotionScopedProductCodes(scope);
    const effectiveScope = {
      ...scope,
      scopedProductCodes,
    };

    const previousPromotion = await prisma.promotion.findUnique({
      where: {
        branchCode_type: {
          branchCode: scope.branchCode,
          type,
        },
      },
      select: {
        type: true,
        enabled: true,
        percentage: true,
        categoryId: true,
        selectedProductIds: true,
      },
    });

    // Validate promotion type
    if (!['global', 'category', 'selective'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid promotion type'
      });
    }

    // If enabling category promotion, ensure category is selected
    if (type === 'category' && enabled && !categoryId) {
      return res.status(400).json({
        success: false,
        error: 'Category must be selected for category promotion'
      });
    }

    // If enabling selective promotion, ensure products are selected
    if (type === 'selective' && enabled && (!selectedProducts || selectedProducts.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'At least one product must be selected'
      });
    }

    // Validate selectedProducts are valid integers if provided
    if (selectedProducts && selectedProducts.length > 0) {
      if (parsedSelectedProducts.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid product IDs provided'
        });
      }

      const eligibility = await assessPromotionEligibilityForSelectedProducts(parsedSelectedProducts, scope, scopedProductCodes);
      if (eligibility.eligibleProducts.length !== parsedSelectedProducts.length) {
        return res.status(400).json(
          buildPromotionEligibilityError(
            scope,
            parsedSelectedProducts,
            eligibility.eligibleProducts.length,
            eligibility.diagnosticRows
          )
        );
      }
    }

    // First, reset all products (remove promotional pricing) if disabling
    if (!enabled) {
      await prisma.product.updateMany({
        where: getScopedActiveProductFilter(scope.branchCode, scope.locationCode, scopedProductCodes),
        data: {
          discountPrice: null,
          isOnSale: false,
        }
      });
    }

    // Update or create promotion in database
    const promotionData = {
      type,
      branchCode: scope.branchCode,
      enabled,
      percentage: parseInt(percentage) || 10,
      selectedProductIds: [],
    };

    // Add type-specific data
    if (type === 'category') {
      promotionData.categoryId = categoryId;
    } else if (type === 'selective') {
      promotionData.selectedProductIds = parsedSelectedProducts;
    }

    console.log('[Promotions] Upserting promotion:', {
      type,
      enabled,
      percentage,
      branchCode: scope.branchCode,
      locationCode: scope.locationCode,
      selectedProductIds: promotionData.selectedProductIds,
    });

    const promotion = await prisma.promotion.upsert({
      where: {
        branchCode_type: {
          branchCode: scope.branchCode,
          type,
        },
      },
      update: {
        enabled: promotionData.enabled,
        percentage: promotionData.percentage,
        categoryId: promotionData.categoryId || null,
        selectedProductIds: promotionData.selectedProductIds,
      },
      create: promotionData,
    });

    console.log('[Promotions] Promotion upserted:', promotion);

    let productsToUpdate = [];

    // Apply promotions if enabled
    if (enabled) {
      if (type === 'global') {
        productsToUpdate = await prisma.product.findMany({
          where: getPromotionProductWhere('global', null, [], scope.branchCode, scope.locationCode, scopedProductCodes),
        });
      } else if (type === 'category') {
        productsToUpdate = await prisma.product.findMany({
          where: getPromotionProductWhere('category', categoryId, [], scope.branchCode, scope.locationCode, scopedProductCodes),
        });
      } else if (type === 'selective') {
        if (parsedSelectedProducts.length > 0) {
          productsToUpdate = await prisma.product.findMany({
            where: getPromotionProductWhere('selective', null, parsedSelectedProducts, scope.branchCode, scope.locationCode, scopedProductCodes),
          });

          if (productsToUpdate.length !== parsedSelectedProducts.length) {
            const eligibility = await assessPromotionEligibilityForSelectedProducts(parsedSelectedProducts, scope, scopedProductCodes);
            return res.status(400).json(
              buildPromotionEligibilityError(
                scope,
                parsedSelectedProducts,
                productsToUpdate.length,
                eligibility.diagnosticRows
              )
            );
          }
        }
      }

      // Update each product with discount price
      for (const product of productsToUpdate) {
        await prisma.product.update({
          where: { id: product.id },
          data: buildPromotionUpdateData(product, percentage),
        });
      }

      console.log(`[Promotions] ${type} promotion activated - applied to ${productsToUpdate.length} products at ${percentage}% off`);
    } else {
      console.log(`[Promotions] ${type} promotion deactivated`);
    }

    // Emit real-time update to all clients
    const promotionResponse = {
      type: promotion.type,
      enabled: promotion.enabled,
      percentage: promotion.percentage,
      categoryId: promotion.categoryId || null,
      selectedProducts: promotion.selectedProductIds || [],
    };

    let posQueueSummary = null;
    if (['global', 'category', 'selective'].includes(type)) {
      posQueueSummary = await queuePosPromotionCommands({
        type,
        enabled: promotion.enabled,
        percentage: promotion.percentage,
        promotion,
        previousPromotion,
        productCandidates: promotion.enabled ? productsToUpdate : null,
        actor,
        scope: effectiveScope,
      });

      console.log(`[PROMO][QUEUE] ${type} bridge summary:`, posQueueSummary);
    }
    
    try {
      emitPromotionUpdate(promotionResponse, effectiveScope);
    } catch (emitErr) {
      console.error('[Promotions] Socket.io emit error:', emitErr);
      // Continue even if Socket.io fails
    }

    return res.json({
      success: true,
      promotion: promotionResponse,
      posQueue: posQueueSummary,
    });
  } catch (err) {
    console.error('[Promotions] Error updating promotion:', err.message || err);
    console.error('[Promotions] Full error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update promotion: ' + (err.message || 'Unknown error')
    });
  }
};

/**
 * Preview products matching promotion criteria
 */
const previewPromotion = async (req, res) => {
  try {
    const { type } = req.params;
    const { percentage, categoryId, selectedProducts } = req.body;
    const parsedSelectedProducts = parseProductIds(selectedProducts || []);
    const scope = resolvePromotionScope(req);

    if (scope.error) {
      return res.status(400).json({
        success: false,
        error: scope.error,
      });
    }

    const scopedProductCodes = await resolvePromotionScopedProductCodes(scope);

    // Validate type
    if (!['global', 'category', 'selective'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid promotion type'
      });
    }

    let products = [];

    if (type === 'global') {
      // Get all products
      products = await prisma.product.findMany({
        where: getPromotionProductWhere('global', null, [], scope.branchCode, scope.locationCode, scopedProductCodes),
      });
    } else if (type === 'category') {
      // Get products in specific category
      if (!categoryId) {
        return res.status(400).json({
          success: false,
          error: 'Category must be specified'
        });
      }
      products = await prisma.product.findMany({
        where: getPromotionProductWhere('category', categoryId, [], scope.branchCode, scope.locationCode, scopedProductCodes),
      });
    } else if (type === 'selective') {
      // Get selected products
      if (!selectedProducts || selectedProducts.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one product must be selected'
        });
      }
      products = await prisma.product.findMany({
        where: getPromotionProductWhere('selective', null, parsedSelectedProducts, scope.branchCode, scope.locationCode, scopedProductCodes),
      });

      if (products.length !== parsedSelectedProducts.length) {
        const eligibility = await assessPromotionEligibilityForSelectedProducts(parsedSelectedProducts, scope, scopedProductCodes);
        return res.status(400).json(
          buildPromotionEligibilityError(
            scope,
            parsedSelectedProducts,
            products.length,
            eligibility.diagnosticRows
          )
        );
      }
    }

    // Calculate discounted prices
    const previewProducts = products.map(product => {
      const discountAmount = (product.price * percentage) / 100;
      const discountedPrice = product.price - discountAmount;

      return {
        id: product.id,
        name: product.name,
        category: product.category,
        image: product.image,
        price: product.price,
        originalPrice: product.originalPrice,
        finalPrice: discountedPrice,
        discountPercentage: percentage,
      };
    });

    return res.json({
      success: true,
      products: previewProducts,
      count: previewProducts.length,
    });
  } catch (err) {
    console.error('Error previewing promotion:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to preview promotion'
    });
  }
};

/**
 * Apply promotion (update product prices)
 * This is called periodically or manually to apply discount prices to products
 */
const applyPromotion = async (req, res) => {
  try {
    const scope = resolvePromotionScope(req);
    if (scope.error) {
      return res.status(400).json({
        success: false,
        error: scope.error,
      });
    }

    const scopedProductCodes = await resolvePromotionScopedProductCodes(scope);

    const promotions = await prisma.promotion.findMany({
      where: {
        enabled: true,
        branchCode: scope.branchCode,
      },
    });

    let updatedCount = 0;

    for (const promotion of promotions) {
      let products = [];

      if (promotion.type === 'global') {
        products = await prisma.product.findMany({
          where: getPromotionProductWhere('global', null, [], scope.branchCode, scope.locationCode, scopedProductCodes),
        });
      } else if (promotion.type === 'category') {
        products = await prisma.product.findMany({
          where: getPromotionProductWhere('category', promotion.categoryId, [], scope.branchCode, scope.locationCode, scopedProductCodes),
        });
      } else if (promotion.type === 'selective') {
        // Use selectedProductIds from database
        const selectedIds = parseProductIds(promotion.selectedProductIds || []);
        if (selectedIds.length === 0) continue; // Skip if no products selected
        products = await prisma.product.findMany({
          where: getPromotionProductWhere('selective', null, selectedIds, scope.branchCode, scope.locationCode, scopedProductCodes),
        });
      }

      // Update each product with discount price
      for (const product of products) {
        await prisma.product.update({
          where: { id: product.id },
          data: buildPromotionUpdateData(product, promotion.percentage),
        });

        updatedCount++;
      }
    }

    console.log(`[Promotions] Applied to ${updatedCount} products`);

    return res.json({
      success: true,
      message: `Promotion applied to ${updatedCount} products`,
      updatedCount,
    });
  } catch (err) {
    console.error('Error applying promotion:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to apply promotion'
    });
  }
};

/**
 * Remove promotional pricing from products
 */
const removePromotion = async (req, res) => {
  try {
    const scope = resolvePromotionScope(req);
    if (scope.error) {
      return res.status(400).json({
        success: false,
        error: scope.error,
      });
    }

    // Disable all promotions
    await prisma.promotion.updateMany({
      where: {
        branchCode: scope.branchCode,
      },
      data: { enabled: false }
    });

    // Reset all product discount prices
    await prisma.product.updateMany({
      where: getScopedActiveProductFilter(scope.branchCode, scope.locationCode, await resolvePromotionScopedProductCodes(scope)),
      data: {
        discountPrice: null,
        isOnSale: false,
        updatedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: 'All promotions removed successfully'
    });
  } catch (err) {
    console.error('Error removing promotions:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove promotions'
    });
  }
};

module.exports = {
  getCurrentPromotions,
  getPublicPromotions,
  updatePromotion,
  previewPromotion,
  applyPromotion,
  removePromotion,
};
