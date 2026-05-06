const { PrismaClient } = require('@prisma/client');
const { computeExpiryStatus, suggestDiscount } = require('../utils/expiryStatus');
const { notifyLowStock } = require('../utils/messageService');
const posCommandQueueService = require('../services/posCommandQueue.service');
const posSyncService = require('../services/posSync.service');
const { recordPosSyncEvent } = require('../services/posSyncMonitor.service');
const { verifyToken } = require('../utils/jwt');
const {
  DEFAULT_LOW_STOCK_THRESHOLD,
  enrichProductStock,
} = require('../utils/stockResolver');
const {
  normalizeScopeCode: normalizeOperationalScopeCode,
  expandLocationScopeCodes: expandOperationalLocationScopeCodes,
  resolveOperationalScope,
  CORE_ZOMBA_LOCATION_CODES,
} = require('../utils/operationalScope');

const prisma = new PrismaClient();
const MIN_VALID_EXPIRY_DATE = new Date('2000-01-01T00:00:00.000Z');
const POS_DEFAULT_LOCATION_CODE = normalizeOperationalScopeCode(process.env.POS_LOCATION_CODE) || 'BT';
const POS_DEFAULT_PRICE_TYPE_CODE = process.env.POS_PRICE_TYPE_CODE || 'RT';
const POS_BLANTYRE_SELLING_LOCATION_CODE = normalizeOperationalScopeCode(
  process.env.POS_BLANTYRE_SELLING_LOCATION_CODE
  || process.env.POS_BLANTYRE_PROMOTION_LOCATION_CODE
  || 'SH'
) || 'SH';
const POS_ZOMBA_SELLING_LOCATION_CODE = normalizeOperationalScopeCode(
  process.env.POS_ZOMBA_SELLING_LOCATION_CODE
  || process.env.POS_ZOMBA_PROMOTION_LOCATION_CODE
  || 'SH'
) || 'SH';

const productImageMappingService = require('../services/productImageMapping.service');
const { recordAuditLog } = require('../services/auditLog.service');
const ADMIN_EXPIRY_REQUEST_TIMEOUT_MS = 30000;
const ADMIN_EXPIRY_CACHE_TTL_MS = 5 * 60 * 1000;
const ADMIN_EXPIRY_ALERTS_REQUEST_TIMEOUT_MS = Number(process.env.ADMIN_EXPIRY_ALERTS_REQUEST_TIMEOUT_MS || 8000);
const MAX_PRODUCT_NAME_LENGTH = 120;

const adminExpiryFetchState = {
  rows: [],
  fetchedAt: 0,
};

// Cache for live POS expiry batch fetches (used by alerts endpoint). Keyed by
// sorted-joined product codes so different sets don't share stale data.
const _liveExpiryBatchCache = new Map(); // key -> { data: Map, ts: number }

// Cache for all-products expiry alerts (used by alerts endpoint). Single cache,
// TTL-based to prevent hammering SQL Server on rapid alert panel refreshes.
const _allProductsExpiryCache = {
  rows: null,
  ts: 0,
  locationCode: null,
  refreshing: false,
};

function formatLocalDateKey(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function getAdjustmentActor(req) {
  return String(req.user?.email || req.user?.id || req.user?.userId || 'admin').trim();
}

function normalizeProductNameInput(value) {
  const normalized = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { value: null, error: 'Product name is required' };
  }

  if (normalized.length > MAX_PRODUCT_NAME_LENGTH) {
    return { value: null, error: `Product name must be ${MAX_PRODUCT_NAME_LENGTH} characters or fewer` };
  }

  return { value: normalized, error: null };
}

function normalizeBranchCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

function getDefaultPosLocationCodeForBranch(branchCode, requestedLocationCode) {
  if (branchCode === 'BLANTYRE') {
    return 'SH';
  }

  if (branchCode === 'ZOMBA') {
    const normalizedRequestedLocation = normalizeOperationalScopeCode(requestedLocationCode);
    if (normalizedRequestedLocation && CORE_ZOMBA_LOCATION_CODES.includes(normalizedRequestedLocation)) {
      return normalizedRequestedLocation;
    }
    return POS_ZOMBA_SELLING_LOCATION_CODE;
  }

  return normalizeOperationalScopeCode(requestedLocationCode) || POS_DEFAULT_LOCATION_CODE;
}

function resolveProductWritebackScope(req, product = null) {
  // Require both branchCode and locationCode for strict scoping
  const { branchCode, locationCode } = resolveOperationalScope(req);

  return {
    locationCode,
    requestedLocationCode: locationCode,
    branchCode,
    posLocationCode: getDefaultPosLocationCodeForBranch(branchCode, locationCode),
    priceTypeCode: POS_DEFAULT_PRICE_TYPE_CODE,
  };
}

async function recordProductNameSyncEvent({
  status,
  level,
  title,
  message,
  product,
  payload,
  queueResult,
  req,
  reason = null,
}) {
  try {
    await recordPosSyncEvent({
      eventType: 'product-name-writeback',
      source: 'product.updateProduct',
      status,
      level,
      title,
      message,
      reason,
      suggestion: status === 'failed'
        ? 'Review the queued command payload and the POS agent logs before retrying the product name write-back.'
        : 'Monitor the POS command queue to confirm the agent processes the product name update.',
      entityType: 'Product',
      entityId: product?.id != null ? String(product.id) : null,
      metadata: {
        productId: product?.id ?? null,
        productCode: payload?.productCode || product?.sourceCode || null,
        oldName: payload?.oldName || null,
        newName: payload?.newName || null,
        updatedBy: payload?.updatedBy || getAdjustmentActor(req),
        branchCode: payload?.branchCode || null,
        locationCode: payload?.locationCode || null,
        commandType: queueResult?.commandType || 'UPDATE_PRODUCT_NAME',
        commandId: queueResult?.commandId || null,
        queueSuccess: queueResult?.success ?? null,
        queueError: queueResult?.error || null,
      },
    });
  } catch (error) {
    console.error('[PRODUCT NAME SYNC] monitor event record failed:', error.message);
  }
}

function decodeExpiryBatchReference(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return {
      stockDetailId: null,
      grnNo: null,
    };
  }

  const parsed = {
    stockDetailId: null,
    grnNo: null,
  };

  raw.split('|').forEach((part) => {
    const [prefix, ...rest] = String(part || '').split(':');
    const normalizedPrefix = String(prefix || '').trim().toUpperCase();
    const normalizedValue = rest.join(':').trim();

    if (!normalizedValue) {
      return;
    }

    if (normalizedPrefix === 'SD') parsed.stockDetailId = normalizedValue;
    if (normalizedPrefix === 'GRN') parsed.grnNo = normalizedValue;
  });

  if (!parsed.stockDetailId && !parsed.grnNo) {
    parsed.stockDetailId = raw;
  }

  return parsed;
}

function encodeExpiryBatchReference(stockDetailId, grnNo, fallbackValue = null) {
  const normalizedStockDetailId = String(stockDetailId || '').trim();
  const normalizedGrnNo = String(grnNo || '').trim();

  if (!normalizedStockDetailId && !normalizedGrnNo) {
    return fallbackValue ? String(fallbackValue).trim() : null;
  }

  const parts = [];
  if (normalizedStockDetailId) parts.push(`SD:${normalizedStockDetailId}`);
  if (normalizedGrnNo) parts.push(`GRN:${normalizedGrnNo}`);
  return parts.join('|');
}

// Ensure product indexes needed for query performance.
// This is intentionally callable from server startup instead of running at import time,
// so it does not compete for DB connections before the app is ready.
const ensureProductPerformanceIndexes = async () => {
  const ensureIndex = async (label, statement) => {
    try {
      await statement();
    } catch (err) {
      console.error(`[DB INIT] failed to create ${label}:`, err.message);
    }
  };

  try {
    let trigramReady = false;

    try {
      await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      trigramReady = true;
    } catch (err) {
      console.warn('[DB INIT] pg_trgm extension unavailable; product name trigram index skipped:', err.message);
    }

    if (trigramReady) {
      await ensureIndex('idx_product_name_search', () => prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_product_name_search
        ON "Product" USING gin (name gin_trgm_ops);
      `);
    }
    
    // Index for visibility filtering (enabled = true)
    await ensureIndex('idx_product_enabled', () => prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_product_enabled
      ON "Product"(enabled);
    `);
    
    // Index for category filtering
    await ensureIndex('idx_product_category', () => prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_product_category
      ON "Product"(category);
    `);
    
    // Combined index for enabled + category queries
    await ensureIndex('idx_product_enabled_category', () => prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_product_enabled_category
      ON "Product"(enabled, category);
    `);
    
    // Index for isOnSale filtering
    await ensureIndex('idx_product_on_sale', () => prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_product_on_sale
      ON "Product"(isOnSale);
    `);
    
    console.log('[DB INIT] ensured all performance indexes on Product table');
  } catch (err) {
    console.error('[DB INIT] failed to create indexes:', err.message);
  }
};

/**
 * Helper: Format product with computed fields
 * - Adds imageUrl from image path
 * - Computes expiryStatus dynamically
 * - Computes finalPrice based on isOnSale and discountPrice
 * - Includes suggestDiscount for admin use
 */
const formatProduct = (product, req, includeDiscountSuggestion = false) => {
  const expiryStatus = product.expiryStatus !== undefined
    ? product.expiryStatus
    : computeExpiryStatus(product.expiryDate);
  const daysToExpiry = product.daysToExpiry !== undefined
    ? product.daysToExpiry
    : (expiryStatus?.daysRemaining ?? null);
  
  // Calculate final price: if on sale and discount exists, use discount
  let finalPrice = product.price;
  if (product.isOnSale && product.discountPrice) {
    finalPrice = product.discountPrice;
  }

  // Handle image URL with better logging
  let imageUrl = null;
  if (product.image) {
    if (product.image.startsWith('http')) {
      imageUrl = product.image; // Cloudinary URL - already full URL
    } else {
      imageUrl = `${req.protocol}://${req.get('host')}/${product.image}`; // Local path - construct URL
    }
    if (!imageUrl) {
      console.warn(`[PRODUCT FORMAT] ⚠️ Image URL could not be generated for product ${product.id}`);
    }
  } else {
    console.warn(`[PRODUCT FORMAT] ⚠️ Product ${product.id} (${product.name}) has no image`);
  }

  const stockEnriched = enrichProductStock(product);

  const formatted = {
    ...stockEnriched,
    imageUrl,
    expiryStatus,
    daysToExpiry,
    expirySource: product.expirySource || null,
    finalPrice,
  };

  // Include discount suggestion for admin endpoints
  if (includeDiscountSuggestion) {
    formatted.discountSuggestion = suggestDiscount({
      isOnSale: product.isOnSale,
      price: product.price,
      expiryStatus
    });
  }

  return formatted;
};

function normalizeBatchForResponse(batch) {
  const expiryDate = normalizeExpiryDate(batch?.expiryDate);
  if (!expiryDate) {
    return null;
  }

  const decodedRef = decodeExpiryBatchReference(batch?.batchNo);

  return {
    expiryDate: expiryDate.toISOString(),
    locationCode: batch?.locationCode || null,
    stockDetailId: decodedRef.stockDetailId,
    grnNo: decodedRef.grnNo,
    batchNo: decodedRef.grnNo || decodedRef.stockDetailId || batch?.batchNo || null,
    receivedQty: null,
    lastSyncedAt: batch?.lastSyncedAt ? new Date(batch.lastSyncedAt).toISOString() : null,
  };
}

function normalizeLiveBatchForResponse(batch) {
  const expiryDate = normalizeExpiryDate(batch?.expiryDate ?? batch?.ExpiryDate);
  if (!expiryDate) {
    return null;
  }

  const stockDetailId = batch?.stockDetailId != null
    ? String(batch.stockDetailId).trim()
    : (batch?.StockDetailID != null ? String(batch.StockDetailID).trim() : null);
  const grnNo = batch?.grnNo != null
    ? String(batch.grnNo).trim()
    : (batch?.GRNNo != null ? String(batch.GRNNo).trim() : null);
  const receivedQty = batch?.StockQty != null
    ? Number(batch.StockQty)
    : (batch?.stockQty != null ? Number(batch.stockQty) : null);

  return {
    expiryDate: expiryDate.toISOString(),
    locationCode: batch?.locationCode || batch?.LocationCode || null,
    stockDetailId,
    grnNo,
    batchNo: grnNo || stockDetailId || null,
    receivedQty: Number.isFinite(receivedQty) ? receivedQty : null,
    lastSyncedAt: null,
  };
}

async function fetchLiveExpiryBatchesByCode(sourceCodes) {
  if (!Array.isArray(sourceCodes) || sourceCodes.length === 0) {
    return new Map();
  }

  const cacheKey = [...sourceCodes].sort().join('|');
  const cached = _liveExpiryBatchCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < ADMIN_EXPIRY_CACHE_TTL_MS) {
    return cached.data;
  }

  const expiryResult = await posSyncService.getExpiryProductsFromPOS({
    days: 3650,
    locationCode: process.env.POS_LOCATION_CODE || 'SH',
    includeExpired: true,
    source: 'view',
    productCodes: sourceCodes,
    requestTimeoutMs: ADMIN_EXPIRY_REQUEST_TIMEOUT_MS,
  });

  if (!expiryResult.success) {
    throw new Error(expiryResult.error || 'Live POS expiry fetch failed');
  }

  const rawRows = Array.isArray(expiryResult.data?.data) ? expiryResult.data.data : [];
  const batchesByCode = new Map();

  rawRows.forEach((row) => {
    const code = normalizeProductCode(row?.ProductCode || row?.productCode);
    const normalizedBatch = normalizeLiveBatchForResponse(row);

    if (!code || !normalizedBatch) {
      return;
    }

    if (!batchesByCode.has(code)) {
      batchesByCode.set(code, []);
    }

    batchesByCode.get(code).push(normalizedBatch);
  });

  batchesByCode.forEach((batches, code) => {
    batches.sort((left, right) => new Date(left.expiryDate) - new Date(right.expiryDate));
    console.log('[ADMIN PRODUCTS] live expiry batches attached', {
      productCode: code,
      batchCount: batches.length,
      sample: batches[0] || null,
    });
  });

  _liveExpiryBatchCache.set(cacheKey, { data: batchesByCode, ts: Date.now() });

  return batchesByCode;
}

async function attachExpiryBatchesToProducts(products, options = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    return products;
  }

  const { preferLive = false } = options;

  const sourceCodes = Array.from(new Set(
    products
      .map((product) => normalizeProductCode(product.sourceCode))
      .filter(Boolean)
  ));

  if (sourceCodes.length === 0) {
    return products.map((product) => ({
      ...product,
      expiryBatches: [],
    }));
  }

  if (preferLive) {
    try {
      const liveBatchesByCode = await fetchLiveExpiryBatchesByCode(sourceCodes);
      return products.map((product) => ({
        ...product,
        expiryBatches: liveBatchesByCode.get(normalizeProductCode(product.sourceCode)) || [],
      }));
    } catch (error) {
      console.warn('[ADMIN PRODUCTS] live expiry batch fetch failed, falling back to stored batches', error.message);
    }
  }

  const rawBatches = await prisma.productExpiryBatch.findMany({
    where: {
      productCode: { in: sourceCodes },
    },
    orderBy: [
      { productCode: 'asc' },
      { expiryDate: 'asc' },
      { batchNo: 'asc' },
    ],
  });

  const batchesByCode = new Map();

  rawBatches.forEach((batch) => {
    const code = normalizeProductCode(batch.productCode);
    const normalizedBatch = normalizeBatchForResponse(batch);

    if (!code || !normalizedBatch) {
      return;
    }

    if (!batchesByCode.has(code)) {
      batchesByCode.set(code, []);
    }

    batchesByCode.get(code).push(normalizedBatch);
  });

  return products.map((product) => ({
    ...product,
    expiryBatches: batchesByCode.get(normalizeProductCode(product.sourceCode)) || [],
  }));
}

function normalizeProductCode(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeExpiryDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (date < MIN_VALID_EXPIRY_DATE) {
    return null;
  }

  const isoDate = formatLocalDateKey(date);
  if (isoDate === '1900-01-01') {
    return null;
  }

  return date;
}

function getDecodedTokenFromRequest(req) {
  try {
    const bearerToken = req.headers.authorization?.split(' ')[1];
    if (bearerToken) {
      return verifyToken(bearerToken);
    }
  } catch (error) {
    return null;
  }

  return null;
}

function shouldForceAdminExpiryEnrichment(req) {
  const decodedToken = getDecodedTokenFromRequest(req);
  return Boolean(decodedToken && decodedToken.role === 'admin');
}

function normalizeScopeCode(value) {
  return normalizeOperationalScopeCode(value);
}

function normalizeBranchCodeForIngest(value, fallbackLocationCode = null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'BLANTYRE' || normalized === 'BT') return 'BLANTYRE';
  if (normalized === 'ZOMBA' || normalized === 'ZA') return 'ZOMBA';

  // For ingest operations, require explicit branchCode - no inference from locationCode
  throw new Error(`Invalid branchCode for ingest: ${value}. Must be BLANTYRE/BT or ZOMBA/ZA`);
}

const ZOMBA_LOCATION_CODES = ['ZA'].concat(CORE_ZOMBA_LOCATION_CODES);
const BLANTYRE_DISALLOWED_LOCATION_CODES = ['ZA'].concat(
  CORE_ZOMBA_LOCATION_CODES.filter((code) => String(code || '').trim().toUpperCase() !== 'SH')
);

function isConcreteZombaOperationalLocationCode(locationCode) {
  return CORE_ZOMBA_LOCATION_CODES.includes(String(locationCode || '').trim().toUpperCase());
}

function expandLocationScopeCodes(locationCode) {
  return expandOperationalLocationScopeCodes(locationCode);
}

function buildLocationCodeScopeWhere(locationCodes) {
  if (!Array.isArray(locationCodes) || locationCodes.length === 0) {
    return null;
  }

  return {
    OR: locationCodes.map((code) => ({
      locationCode: {
        equals: code,
        mode: 'insensitive',
      },
    })),
  };
}

function isAdminRequest(req) {
  const decodedToken = getDecodedTokenFromRequest(req);
  return Boolean(decodedToken && decodedToken.role === 'admin');
}

function getStorefrontLocationCode() {
  return normalizeScopeCode(process.env.STOREFRONT_LOCATION_CODE || process.env.PUBLIC_STOREFRONT_LOCATION_CODE || 'BT');
}

function deriveBranchCodeFromScopeCodes(scopeCodes = []) {
  // Removed inference logic - require explicit branchCode and locationCode
  throw new Error('deriveBranchCodeFromScopeCodes is deprecated. Use resolveOperationalScope for strict scoping.');
}

async function resolveLocationScopedProductCodesFromSales(branchCode, locationCode) {
  if (!branchCode || !locationCode) {
    throw new Error('Both branchCode and locationCode are required for product code resolution');
  }

  console.log('[PRODUCT SCOPE]', { branchCode, locationCode });

  const salesRows = await prisma.salesInvoiceItem.findMany({
    where: {
      productCode: { not: null },
      salesInvoice: {
        branchCode: branchCode,
        locationCode: locationCode,
      },
    },
    select: {
      productCode: true,
    },
    distinct: ['productCode'],
  });

  return salesRows
    .map((row) => normalizeProductCode(row.productCode))
    .filter(Boolean);
}

async function resolveLocationScopedProductCodesFromLatestCosts(branchCode, locationCode) {
  if (!branchCode || !locationCode) {
    throw new Error('Both branchCode and locationCode are required for product code resolution');
  }

  console.log('[PRODUCT SCOPE]', { branchCode, locationCode });

  const rows = await prisma.posLatestProductCost.findMany({
    where: {
      branchCode: branchCode,
      locationCode: locationCode,
    },
    select: {
      productCode: true,
    },
    distinct: ['productCode'],
  });

  return rows
    .map((row) => normalizeProductCode(row.productCode))
    .filter(Boolean);
}

async function resolveLocationScopedProductCodes(branchCode, locationCode) {
  if (!branchCode || !locationCode) {
    throw new Error('Both branchCode and locationCode are required for product code resolution');
  }

  console.log('[PRODUCT SCOPE]', { branchCode, locationCode });

  const scopedWhere = {
    branchCode: branchCode,
    locationCode: locationCode,
  };

  const expiryRows = await prisma.productExpiryBatch.findMany({
    where: scopedWhere,
    select: { productCode: true },
    distinct: ['productCode'],
  });

  const scopedCodes = new Set(
    expiryRows
      .map((row) => normalizeProductCode(row.productCode))
      .filter(Boolean)
  );

  const costCodes = await resolveLocationScopedProductCodesFromLatestCosts(branchCode, locationCode);
  costCodes.forEach((code) => scopedCodes.add(code));

  const salesCodes = await resolveLocationScopedProductCodesFromSales(branchCode, locationCode);
  salesCodes.forEach((code) => scopedCodes.add(code));

  const isZombaScope = CORE_ZOMBA_LOCATION_CODES.includes(locationCode);
  if (isZombaScope) {
    console.log('[PRODUCTS][SCOPE][ZOMBA] code-source diagnostics', {
      branchCode,
      locationCode,
      expiryDistinctCount: expiryRows.length,
      latestCostDistinctCount: costCodes.length,
      salesDistinctCount: salesCodes.length,
      combinedDistinctCount: scopedCodes.size,
    });
  }

  // Keep legacy Blantyre operations usable when historical rows predate location tagging.
  if (scopedCodes.size === 0 && branchCode === 'BLANTYRE') {
    const legacyRows = await prisma.product.findMany({
      where: { sourceCode: { not: null } },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });

    legacyRows
      .map((row) => normalizeProductCode(row.sourceCode))
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
  }

  // Zomba fallback: if no activity-table records exist yet for the requested
  // Zomba location, fall back to products stored with branchCode='ZOMBA' AND
  // the specific locationCode (SH/BAR/ST999). The Product table is the primary
  // source for POS-synced products.
  if (scopedCodes.size === 0 && isZombaScope) {
    const locationWhere = buildLocationCodeScopeWhere(scopeCodes);
    const zombaRows = await prisma.product.findMany({
      where: { 
        branchCode: 'ZOMBA', 
        sourceCode: { not: null },
        ...(locationWhere || {})
      },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });
    zombaRows
      .map((row) => normalizeProductCode(row.sourceCode))
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
    console.log('[PRODUCTS][ZOMBA_SCOPE][FALLBACK] fell back to Product table branchCode=ZOMBA + locationCodes', {
      scopeCodes,
      fallbackCodeCount: scopedCodes.size,
    });
  }

  return Array.from(scopedCodes.values());
}

function shouldUseLegacyBlantyreReadFallback(locationCode, scopedProductCodes) {
  const normalizedLocationCode = normalizeScopeCode(locationCode);
  return normalizedLocationCode === 'BT' && (!Array.isArray(scopedProductCodes) || scopedProductCodes.length === 0);
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function calculateDaysToExpiry(expiryDate) {
  const normalizedDate = normalizeExpiryDate(expiryDate);
  if (!normalizedDate) {
    return null;
  }

  const today = getStartOfToday();
  const target = new Date(normalizedDate);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function buildAdminExpiryStatus(daysToExpiry) {
  if (daysToExpiry == null) {
    return null;
  }

  if (daysToExpiry < 0) {
    return {
      status: 'expired',
      label: 'Expired',
      daysRemaining: daysToExpiry,
      message: 'Expired',
    };
  }

  if (daysToExpiry <= 7) {
    return {
      status: 'expiring_soon',
      label: 'Expiring Soon',
      daysRemaining: daysToExpiry,
      message: 'Expiring Soon',
    };
  }

  if (daysToExpiry <= 30) {
    return {
      status: 'near_expiry',
      label: 'Near Expiry',
      daysRemaining: daysToExpiry,
      message: 'Near Expiry',
    };
  }

  return null;
}

function createMergedExpiryFields(expiryDate, expirySource) {
  const normalizedDate = normalizeExpiryDate(expiryDate);
  if (!normalizedDate) {
    return null;
  }

  const daysToExpiry = calculateDaysToExpiry(normalizedDate);
  return {
    expiryDate: normalizedDate.toISOString(),
    expiryStatus: buildAdminExpiryStatus(daysToExpiry),
    daysToExpiry,
    expirySource,
  };
}

function pickPreferredExpiryRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const normalizedRows = rows
    .map((row) => {
      const normalizedDate = normalizeExpiryDate(row.ExpiryDate || row.expiryDate);
      const remainingQty = Number(
        row.StockBalance
        ?? row.stockBalance
        ?? row.RemainingQty
        ?? row.remainingQty
        ?? row.quantity
        ?? row.Quantity
        ?? 0
      );

      return {
        normalizedDate,
        remainingQty,
      };
    })
    .filter((row) => row.normalizedDate);

  if (normalizedRows.length === 0) {
    return null;
  }

  const today = getStartOfToday();
  const upcomingRows = normalizedRows
    .filter((row) => row.normalizedDate >= today && Number.isFinite(row.remainingQty) && row.remainingQty > 0)
    .sort((left, right) => left.normalizedDate - right.normalizedDate);

  if (upcomingRows.length > 0) {
    return upcomingRows[0].normalizedDate;
  }

  const expiredRows = normalizedRows
    .filter((row) => row.normalizedDate < today)
    .sort((left, right) => right.normalizedDate - left.normalizedDate);

  return expiredRows[0]?.normalizedDate || null;
}

async function fetchPosExpiryMap(products) {
  console.log('[ADMIN PRODUCTS] expiry enrichment start');
  const productCodeSet = new Set(
    products
      .map((product) => normalizeProductCode(product.sourceCode))
      .filter(Boolean)
  );

  console.log('[ADMIN PRODUCTS] merge key used', 'String(product.sourceCode).trim() === String(expiry.ProductCode).trim()');

  const now = Date.now();
  const hasFreshCache = adminExpiryFetchState.fetchedAt > 0 && (now - adminExpiryFetchState.fetchedAt) < ADMIN_EXPIRY_CACHE_TTL_MS;

  let expiryRows = [];

  // Prefer push cache — POS agent proactively pushes expiry data every 5 min
  if (posExpiryPushCache.rows.length > 0) {
    expiryRows = posExpiryPushCache.rows;
    const ageSecs = Math.round((Date.now() - posExpiryPushCache.pushedAt) / 1000);
    console.log('[ADMIN PRODUCTS] using POS-pushed expiry cache:', expiryRows.length, 'rows, age:', ageSecs + 's');
  } else {
    const posConfig = posSyncService.getConfig();
    const targetUrl = `${posConfig.agentUrl}/pos-sync/expiry-products`;
    const productCodes = Array.from(productCodeSet.values());

    console.log(`[ADMIN PRODUCTS] calling POS expiry endpoint: ${targetUrl}`);
    console.log('[ADMIN PRODUCTS] POS expiry request params', {
      source: 'view',
      includeExpired: true,
      productCodesCount: productCodes.length,
      requestTimeoutMs: ADMIN_EXPIRY_REQUEST_TIMEOUT_MS,
    });

    let expiryResult = await posSyncService.getExpiryProductsFromPOS({
      days: 3650,
      locationCode: process.env.POS_LOCATION_CODE || 'SH',
      includeExpired: true,
      source: 'view',
      productCodes,
      requestTimeoutMs: ADMIN_EXPIRY_REQUEST_TIMEOUT_MS,
    });

    if (!expiryResult.success) {
      console.warn('[ADMIN PRODUCTS] retrying POS expiry fetch with stockdetails source');
      expiryResult = await posSyncService.getExpiryProductsFromPOS({
        days: 3650,
        locationCode: process.env.POS_LOCATION_CODE || 'SH',
        includeExpired: true,
        source: 'stockdetails',
        productCodes,
        requestTimeoutMs: ADMIN_EXPIRY_REQUEST_TIMEOUT_MS,
      });
    }

    if (!expiryResult.success) {
      console.warn('[ADMIN PRODUCTS] expiry fetch failed', {
        error: expiryResult.error,
        status: expiryResult.meta?.status || null,
        rawBody: expiryResult.meta?.rawBody || null,
        targetUrl: expiryResult.meta?.targetUrl || null,
      });
      if (hasFreshCache || adminExpiryFetchState.rows.length > 0) {
        expiryRows = adminExpiryFetchState.rows;
        console.log('[ADMIN PRODUCTS] using pull-cached expiry rows', expiryRows.length);
      }
    } else {
      expiryRows = Array.isArray(expiryResult.data?.data) ? expiryResult.data.data : [];
      console.log('[ADMIN PRODUCTS] expiry response status', expiryResult.meta?.status || 200);
      console.log('[ADMIN PRODUCTS] expiry rows count', expiryRows.length);
      console.log('[ADMIN PRODUCTS] first expiry row', expiryRows[0] || null);
      adminExpiryFetchState.rows = expiryRows;
      adminExpiryFetchState.fetchedAt = Date.now();
    }
  }

  console.log('[ADMIN PRODUCTS] expiry rows fetched count', expiryRows.length);
  console.log('[ADMIN PRODUCTS] first expiry row', expiryRows[0] || null);

  const first5ProductSourceCodeValues = products
    .map((product) => String(product.sourceCode || '').trim())
    .filter(Boolean)
    .slice(0, 5);
  const first5ExpiryProductCodeValues = expiryRows
    .map((row) => String(row.ProductCode || row.productCode || '').trim())
    .filter(Boolean)
    .slice(0, 5);
  console.log('[ADMIN PRODUCTS] first 5 product sourceCode values', first5ProductSourceCodeValues);
  console.log('[ADMIN PRODUCTS] first 5 expiry ProductCode values', first5ExpiryProductCodeValues);

  const groupedRows = new Map();

  for (const row of expiryRows) {
    const productCode = normalizeProductCode(row.ProductCode || row.productCode);
    if (!productCode || !productCodeSet.has(productCode)) {
      continue;
    }

    if (!groupedRows.has(productCode)) {
      groupedRows.set(productCode, []);
    }

    groupedRows.get(productCode).push(row);
  }

  const expiryMap = new Map();

  for (const [productCode, rows] of groupedRows.entries()) {
    const preferredExpiryDate = pickPreferredExpiryRow(rows);
    const mergedFields = createMergedExpiryFields(preferredExpiryDate, 'pos-agent');

    if (mergedFields) {
      expiryMap.set(productCode, mergedFields);
    }
  }

  console.log('[ADMIN PRODUCTS] expiry map size', expiryMap.size);

  return expiryMap;
}

async function enrichProductsWithExpiry(products) {
  console.log('[ADMIN PRODUCTS] products fetched count', products.length);
  console.log('[ADMIN PRODUCTS] first product keys', products[0] ? Object.keys(products[0]) : []);
  console.log('[ADMIN PRODUCTS] first product sourceCode', products[0]?.sourceCode || null);
  console.log('[ADMIN PRODUCTS] sample raw product row', products[0] || null);
  console.log('[ADMIN PRODUCTS] current expiry fields source', 'Product table expiryDate + POS expiry merge by sourceCode/ProductCode');

  const expiryMap = await fetchPosExpiryMap(products);

  const mergedProducts = products.map((product) => {
    const productCode = normalizeProductCode(product.sourceCode);
    const posExpiryFields = productCode ? expiryMap.get(productCode) : null;
    const fallbackExpiryFields = createMergedExpiryFields(product.expiryDate, 'database');
    const mergedExpiryFields = posExpiryFields || fallbackExpiryFields;

    if (!mergedExpiryFields) {
      return {
        ...product,
        expiryDate: null,
        expiryStatus: null,
        daysToExpiry: null,
        expirySource: null,
      };
    }

    return {
      ...product,
      expiryDate: mergedExpiryFields.expiryDate,
      expiryStatus: mergedExpiryFields.expiryStatus,
      daysToExpiry: mergedExpiryFields.daysToExpiry,
      expirySource: mergedExpiryFields.expirySource,
    };
  });

  const mergedWithExpiryCount = mergedProducts.filter((product) => Boolean(product.expiryDate)).length;
  const sample6009603060415 = mergedProducts.find((product) => normalizeProductCode(product.sourceCode) === '6009603060415') || null;
  const sample988251372310 = mergedProducts.find((product) => normalizeProductCode(product.sourceCode) === '988251372310') || null;
  console.log('[ADMIN PRODUCTS] merged products with expiry count', mergedWithExpiryCount);
  console.log('[ADMIN PRODUCTS] sample merged row with expiry', mergedProducts[0] || null);
  console.log('[ADMIN PRODUCTS] sample merged row for sourceCode 6009603060415', sample6009603060415);
  console.log('[ADMIN PRODUCTS] sample merged row for sourceCode 988251372310', sample988251372310);

  return mergedProducts;
}

const createProduct = async (req, res) => {
  try {
    // Validate required fields
    const { name, price, stock, category, expiryDate, originalPrice, discountPrice } = req.body;

    if (!name || !price || stock === undefined || !category) {
      return res.status(400).json({
        error: 'Validation failed: name, price, stock, and category are required',
      });
    }

    // Validate and parse price
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        error: 'Invalid price: must be a non-negative number',
      });
    }

    // Validate and parse stock
    const parsedStock = parseInt(stock, 10);
    if (isNaN(parsedStock) || parsedStock < 0) {
      return res.status(400).json({
        error: 'Invalid stock: must be a non-negative integer',
      });
    }

    // Debug: Log file upload info
    if (req.file) {
      console.log('[PRODUCT CREATE] Image uploaded to Cloudinary:', {
        secure_url: req.file.secure_url,
        public_id: req.file.public_id,
        size: req.file.size,
        format: req.file.format
      });
    } else {
      console.log('[PRODUCT CREATE] ⚠️ No image file provided');
    }

    // Prepare product data
    const productData = {
      name: name.trim(),
      price: parsedPrice,
      originalPrice: parsedPrice,
      stock: parsedStock,
      category: category.trim(),
      image: req.file ? req.file.secure_url : null, // Cloudinary URL
      expiryDate: expiryDate ? new Date(expiryDate) : null
    };

    console.log('[PRODUCT CREATE] Product data prepared:', {
      name: productData.name,
      image: productData.image ? 'URL set' : 'No image',
      price: productData.price
    });

    // Handle originalPrice (optional)
    if (originalPrice !== undefined && originalPrice !== null && originalPrice !== '') {
      const parsedOriginalPrice = parseFloat(originalPrice);
      if (!isNaN(parsedOriginalPrice) && parsedOriginalPrice >= 0) {
        productData.originalPrice = parsedOriginalPrice;
      }
    }

    // Handle discountPrice and isOnSale (auto-enable if discount provided)
    if (discountPrice) {
      const parsedDiscountPrice = parseFloat(discountPrice);
      if (!isNaN(parsedDiscountPrice) && parsedDiscountPrice >= 0) {
        productData.discountPrice = parsedDiscountPrice;
        productData.isOnSale = true;
      }
    } else {
      productData.isOnSale = false;
    }

    // Create product in database using Prisma
    const product = await prisma.product.create({
      data: productData,
    });

    console.log('[PRODUCT CREATE] ✅ Product created in database:', {
      id: product.id,
      name: product.name,
      hasImage: !!product.image,
      isPOSProduct: !!product.sourceCode
    });

    // Save image mapping by productCode / sourceCode so image survives future resyncs
    const createProductCode = String(req.body?.sourceCode || '').trim() || String(req.body?.barcode || '').trim() || null;
    if (req.file && createProductCode) {
      try {
        await productImageMappingService.saveImageMapping({
          productCode: createProductCode,
          cloudinaryPublicId: req.file.public_id,
          secureUrl: req.file.secure_url,
          originalFilename: req.file.originalname || null,
          uploadedBy: String(req.user?.email || req.user?.id || 'admin'),
        });
      } catch (imgErr) {
        console.warn('[PRODUCT CREATE] Image mapping save failed (non-fatal):', imgErr.message);
      }
    }

    // Notify if stock is low (10 or below) or out of stock
    // ✅ This works for all products including POS products without images
    await notifyLowStock(product);

    // Format product with computed fields
    const formattedProduct = formatProduct(product, req, true);

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId || null,
      action: 'PRODUCT_CREATED',
      resourceType: 'PRODUCT',
      resourceId: product.id,
      status: 'SUCCESS',
      metadata: {
        name: product.name,
        price: product.price,
        stock: product.stock,
      },
    });

    return res.status(201).json({
      message: 'Product created successfully',
      product: formattedProduct,
    });
  } catch (err) {
    console.error('[PRODUCT CREATE] ❌ Error creating product:', err.message);
    return res.status(500).json({
      error: 'Server error while creating product',
      details: err.message
    });
  }
};

const getProducts = async (req, res) => {
  try {
    console.log('[ADMIN PRODUCTS] route hit', {
      endpoint: '/api/products',
      includePosExpiry: req.query.includePosExpiry,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });

    // Extract query parameters for filtering and pagination
    // Support both offset-based (offset, limit) and page-based (page, pageSize) for backwards compatibility
    const { search, category, onSale, page, pageSize, offset, limit, includePosExpiry, locationCode, branchCode } = req.query;
    const requestedBranchCode = normalizeBranchCode(branchCode);
    const requestedPosExpiry = String(includePosExpiry || '').trim().toLowerCase() === 'true';
    const forceAdminPosExpiry = shouldForceAdminExpiryEnrichment(req);
    const shouldIncludePosExpiry = requestedPosExpiry || forceAdminPosExpiry;
    const requestedLocationCode = normalizeScopeCode(locationCode);
    const normalizedLocationCode = requestedLocationCode || (!isAdminRequest(req) ? getStorefrontLocationCode() : null);

    console.log('[ADMIN PRODUCTS] expiry enrichment decision', {
      includePosExpiryQuery: includePosExpiry,
      requestedPosExpiry,
      forceAdminPosExpiry,
      shouldIncludePosExpiry,
    });

    // Determine pagination mode and calculate skip/take
    let skip, take;
    
    if (offset !== undefined || limit !== undefined) {
      // Offset-based pagination (Load More - new format)
      const offsetNum = Math.max(0, parseInt(offset) || 0);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      skip = offsetNum;
      take = limitNum;
      console.log(`[PRODUCTS] Offset-based: offset=${offsetNum}, limit=${limitNum}`);
    } else {
      // Page-based pagination (legacy format - backwards compatibility)
      const pageNum = Math.max(1, parseInt(page) || 1);
      const pageSizeNum = Math.min(5000, Math.max(1, parseInt(pageSize) || 50));
      skip = (pageNum - 1) * pageSizeNum;
      take = pageSizeNum;
      console.log(`[PRODUCTS] Page-based: page=${pageNum}, pageSize=${pageSizeNum}`);
    }

    // Build where clause for filtering - single source of truth (Product table)
    const where = {
      isActive: true,
      enabled: true, // Only show enabled products
      price: { gt: 0 }, // Only show products with price > 0
    };

    if (!isAdminRequest(req)) {
      where.hideFromProductsPage = false; // Public storefront only
    }

    // Search filter (case-insensitive name or sourceCode search)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sourceCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Category filter
    if (category) {
      where.category = category;
    }

    // On Sale filter
    if (onSale === 'true') {
      where.isOnSale = true;
    }

    if (normalizedLocationCode) {
      const scopeCodes = expandLocationScopeCodes(normalizedLocationCode);
      // For legacy compatibility, assume BLANTYRE for non-Zomba cases
      const derivedBranchCode = requestedBranchCode || 'BLANTYRE';
      const explicitBranchCode = derivedBranchCode;
      const rawLocationParam = String(locationCode || '').trim().toUpperCase();
      const resWasMapped = (rawLocationParam === 'RES' || rawLocationParam === 'ZOMBA_RES') && normalizedLocationCode === 'ST999';

      if (normalizedLocationCode === 'SH' && !requestedBranchCode) {
        return res.status(400).json({
          error: 'branchCode is required for SH because SH exists in multiple branches.',
        });
      }

      // Keep legacy behavior for Blantyre, but enforce strict branch+location reads for Zomba.
      if (derivedBranchCode === 'ZOMBA') {
        const resolvedLocationCode = normalizedLocationCode;
        if (!isConcreteZombaOperationalLocationCode(resolvedLocationCode)) {
          console.warn('[PRODUCT QUERY][INVALID_ZOMBA_SCOPE]', {
            view: 'Products panel / stock panel',
            selectedLocation: locationCode || '(none)',
            normalizedLocation: normalizedLocationCode,
            scopeCodes,
            reason: 'Concrete locationCode required for Zomba stock reads (SH|BAR|ST999)',
          });
          return res.status(400).json({
            error: 'Concrete locationCode is required for Zomba stock reads (use SH, BAR, or ST999)',
          });
        }
        where.branchCode = explicitBranchCode || 'ZOMBA';
        where.locationCode = {
          equals: resolvedLocationCode,
          mode: 'insensitive',
        };
        where.sourceCode = { not: null };

        console.log('[PRODUCT QUERY]', {
          view: 'Products panel / stock panel',
          uiLocation: locationCode || '(none)',
          selectedLocation: normalizedLocationCode,
          resolvedStockLocation: resolvedLocationCode,
          branchCode: explicitBranchCode || 'ZOMBA',
          locationCode: resolvedLocationCode,
          querySource: 'PersistedProduct.stock',
          resAlias: resWasMapped ? 'RES->ST999' : null,
        });
      } else {
        // For Blantyre, use BLANTYRE as branchCode since that's the legacy behavior
        const scopedProductCodes = await resolveLocationScopedProductCodes('BLANTYRE', normalizedLocationCode);
        console.log('[PRODUCT QUERY]', {
          uiLocation: locationCode || '(none)',
          branchCode: 'BLANTYRE',
          locationCode: normalizedLocationCode,
          scopedCodeCount: scopedProductCodes ? scopedProductCodes.length : 0,
        });
        if (!scopedProductCodes || scopedProductCodes.length === 0) {
          console.warn('[PRODUCT QUERY] no scoped product codes found - returning empty result', {
            normalizedLocationCode,
            branchCode: 'BLANTYRE',
          });
          return res.status(200).json({
            products: [],
            pagination: {
              total: 0,
              count: 0,
              offset: skip,
              limit: take,
            },
          });
        }

        where.sourceCode = { in: scopedProductCodes };
        if (explicitBranchCode) {
          where.branchCode = explicitBranchCode;
        }
      }
    }

    // Get total count for pagination metadata
    const total = await prisma.product.count({ where });

    // Fetch products with filters, pagination, ordered by createdAt descending
    // Direct query to Products table (single source of truth)
    // Optimized: only select essential fields for frontend
    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        branchCode: true,
        locationCode: true,
        name: true,
        sourceCode: true,
        price: true,
        image: true,
        stock: true,
        category: true,
        isOnSale: true,
        originalPrice: true,
        discountPrice: true,
        expiryDate: true,
        expiryBatchCount: true,
        hideFromProductsPage: true,
        overrideActive: true,
        overrideStock: true,
        lowStockThreshold: true,
        overrideReason: true,
        overrideUpdatedAt: true,
        overrideUpdatedBy: true,
      },
      skip,
      take,
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
    });

    // Debug logging
    console.log(`[PRODUCTS] Retrieved: ${products.length}, Total: ${total}, Category: ${category || 'all'}, Search: ${search || 'none'}`);
    console.log('[PRODUCT RESULT COUNT]', products.length);
    if (normalizedLocationCode) {
      const sampleRow = products[0];
      console.log(`[PRODUCT QUERY] uiLocation=${locationCode || '(none)'} branchCode=${where.branchCode || '(any)'} locationCode=${normalizedLocationCode} matchedRows=${total} pageRows=${products.length}${sampleRow ? ` sample=${sampleRow.sourceCode || sampleRow.name}` : ''}`);
    }
    const isZombaOperationalScope = normalizedLocationCode && ZOMBA_LOCATION_CODES.includes(normalizedLocationCode);
    if (isZombaOperationalScope && products.length > 0) {
      const sample = products[0];
      console.log(`[ZOMBA STOCK][PRODUCTS_PANEL] selectedLocation=${locationCode || '(none)'} resolvedStockLocation=${normalizedLocationCode} querySource=PersistedProduct.stock product=${sample.sourceCode || 'UNKNOWN'} stock=${Number(sample.stock || 0)}`);
      const verifyProduct = products.find((row) => String(row.sourceCode || '').trim() === '9501100002174');
      if (verifyProduct) {
        console.log(`[ZOMBA STOCK][VERIFY][PRODUCTS_PANEL] selectedLocation=${locationCode || '(none)'} resolvedStockLocation=${normalizedLocationCode} querySource=PersistedProduct.stock product=9501100002174 stock=${Number(verifyProduct.stock || 0)}`);
      }
    }
    if (normalizedLocationCode && ZOMBA_LOCATION_CODES.includes(normalizedLocationCode)) {
      console.log('[PRODUCTS][ZOMBA_SCOPE] response diagnostics', {
        requestedLocationCode: normalizedLocationCode,
        totalCount: total,
        pageRowCount: products.length,
        skip,
        take,
      });
    }

    // expiryDate is stored on each product record via POS sync; formatProduct computes expiryStatus from it.
    // The product list always uses stored DB batches (fast). Live POS fetch is reserved for the
    // dedicated alerts endpoint so paginated list loads don't hammer the SQL Server on every request.
    const enrichedProducts = await attachExpiryBatchesToProducts(products, {
      preferLive: false,
    });

    // Map over products and format with computed fields
    const productsWithFormatted = enrichedProducts.map((product) =>
      formatProduct(product, req, false)
    );

    const servedAtIso = new Date().toISOString();
    res.set('x-stock-data-source', 'db-live');
    res.set('x-stock-served-at', servedAtIso);
    console.log('[PRODUCTS][FRESHNESS]', {
      endpoint: '/api/products',
      locationCode: normalizedLocationCode || null,
      source: 'db-live',
      servedAt: servedAtIso,
      rowCount: products.length,
      total,
    });

    // Return response with pagination metadata
    return res.status(200).json({
      products: productsWithFormatted,
      pagination: {
        total,
        count: products.length,
        offset: skip,
        limit: take
      }
    });
  } catch (err) {
    console.error('[PRODUCTS GET] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
};

const getProductById = async (req, res) => {
  try {
    // Extract and convert id to integer
    const id = parseInt(req.params.id);

    // Fetch product by id - optimized to select only necessary fields
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        sourceCode: true,
        price: true,
        image: true,
        stock: true,
        category: true,
        isOnSale: true,
        originalPrice: true,
        discountPrice: true,
        expiryDate: true,
        expiryBatchCount: true,
        hideFromProductsPage: true,
        overrideActive: true,
        overrideStock: true,
        lowStockThreshold: true,
        overrideReason: true,
        overrideUpdatedAt: true,
        overrideUpdatedBy: true,
      }
    });

    // Return 404 if product not found
    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    // Format product with computed fields
    const productWithBatches = (await attachExpiryBatchesToProducts([product], {
      preferLive: shouldForceAdminExpiryEnrichment(req),
    }))[0];
    const formattedProduct = formatProduct(productWithBatches, req, true);

    return res.status(200).json(formattedProduct);
  } catch (err) {
    console.error('Error fetching product by id:', err);
    return res.status(500).json({
      error: 'Server error while fetching product',
    });
  }
};


/**
 * GET /api/products/suggestions?q=...
 * Return up to 8 product name suggestions matching the query string.
 * This endpoint is intentionally lightweight and returns only the name field.
 * It is used by the frontend autocomplete dropdown.
 */

const updateProduct = async (req, res) => {
  try {
    console.log('[BACKEND PRODUCT EDIT] updateProduct hit');
    console.log('[BACKEND PRODUCT EDIT] req.body:', req.body);
    const updatedBy = getAdjustmentActor(req);

    // Extract and convert id to integer
    const id = parseInt(req.params.id);
    console.log('[BACKEND PRODUCT EDIT] Product ID:', id);

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    console.log('[BACKEND PRODUCT EDIT] Existing product found:', {
      id: existingProduct?.id,
      name: existingProduct?.name,
      price: existingProduct?.price,
      sourceCode: existingProduct?.sourceCode,
    });

    if (!existingProduct) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    // Prepare update data with only provided fields
    const updateData = {};
    const changedFields = [];

    const incomingPriceProvided = req.body.price !== undefined && req.body.price !== '';
    let incomingParsedPrice;
    let priceChanged = false;
    const incomingStockProvided = req.body.stock !== undefined && req.body.stock !== '';
    let incomingParsedStock;
    let stockChanged = false;
    const oldStock = Number(existingProduct.stock);
    let newStock = oldStock;
    let normalizedIncomingName = null;
    let nameChanged = false;

    if (req.body.name !== undefined) {
      const normalizedName = normalizeProductNameInput(req.body.name);
      if (normalizedName.error) {
        return res.status(400).json({ error: normalizedName.error });
      }

      normalizedIncomingName = normalizedName.value;
      updateData.name = normalizedIncomingName;
      nameChanged = normalizedIncomingName !== existingProduct.name;
      if (nameChanged) {
        changedFields.push('name');
      }
    }
    if (req.body.price !== undefined && req.body.price !== '') {
      const parsedPrice = parseFloat(req.body.price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Invalid price value' });
      }
      updateData.price = parsedPrice;
      incomingParsedPrice = parsedPrice;
      priceChanged = parsedPrice !== Number(existingProduct.price);
      if (priceChanged) {
        changedFields.push('price');
      }

      if (req.body.originalPrice === undefined || req.body.originalPrice === null || req.body.originalPrice === '') {
        updateData.originalPrice = parsedPrice;
        if (parsedPrice !== Number(existingProduct.originalPrice)) {
          changedFields.push('originalPrice');
        }
      }
    }
    if (req.body.stock !== undefined && req.body.stock !== '') {
      const parsedStock = parseInt(req.body.stock, 10);
      if (isNaN(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ error: 'Invalid stock value' });
      }
      updateData.stock = parsedStock;
      incomingParsedStock = parsedStock;
      newStock = parsedStock;
      stockChanged = parsedStock !== Number(existingProduct.stock);
      if (stockChanged) {
        changedFields.push('stock');
      }
    }
    if (req.body.category !== undefined && req.body.category !== '') {
      updateData.category = req.body.category;
      if (req.body.category !== existingProduct.category) {
        changedFields.push('category');
      }
    }
    
    // Debug: Log file info before processing
    if (req.file) {
      console.log('[PRODUCT UPDATE] 📸 Image file received:', {
        originalname: req.file.originalname,
        secure_url: req.file.secure_url,
        public_id: req.file.public_id,
        size: req.file.size,
        format: req.file.format
      });
      updateData.image = req.file.secure_url; // Cloudinary URL
      console.log('[PRODUCT UPDATE] ✅ Image URL set to:', updateData.image);
      if (updateData.image !== existingProduct.image) {
        changedFields.push('image');
      }
    } else {
      console.log('[PRODUCT UPDATE] ⚠️ No image file in request (optional)');
    }

    // Handle expiryDate
    if (req.body.expiryDate !== undefined) {
      updateData.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
      const existingExpiry = existingProduct.expiryDate ? new Date(existingProduct.expiryDate).toISOString() : null;
      const incomingExpiry = updateData.expiryDate ? new Date(updateData.expiryDate).toISOString() : null;
      if (existingExpiry !== incomingExpiry) {
        changedFields.push('expiryDate');
      }
    }

    // Handle originalPrice
    if (req.body.originalPrice !== undefined) {
      if (req.body.originalPrice === '' || req.body.originalPrice === null) {
        updateData.originalPrice = req.body.price !== undefined && req.body.price !== ''
          ? updateData.price
          : Number(existingProduct.price);
        if (Number(updateData.originalPrice) !== Number(existingProduct.originalPrice)) {
          changedFields.push('originalPrice');
        }
      } else {
        const parsedOriginalPrice = parseFloat(req.body.originalPrice);
        if (!isNaN(parsedOriginalPrice) && parsedOriginalPrice >= 0) {
          updateData.originalPrice = parsedOriginalPrice;
          if (parsedOriginalPrice !== Number(existingProduct.originalPrice)) {
            changedFields.push('originalPrice');
          }
        }
      }
    }

    // Handle discountPrice and isOnSale
    if (req.body.discountPrice !== undefined) {
      if (req.body.discountPrice === '' || req.body.discountPrice === null) {
        updateData.discountPrice = null;
        updateData.isOnSale = false;
        if (existingProduct.discountPrice !== null) {
          changedFields.push('discountPrice');
        }
        if (existingProduct.isOnSale !== false) {
          changedFields.push('isOnSale');
        }
      } else {
        const parsedDiscountPrice = parseFloat(req.body.discountPrice);
        if (!isNaN(parsedDiscountPrice) && parsedDiscountPrice >= 0) {
          updateData.discountPrice = parsedDiscountPrice;
          updateData.isOnSale = true;
          if (parsedDiscountPrice !== Number(existingProduct.discountPrice)) {
            changedFields.push('discountPrice');
          }
          if (existingProduct.isOnSale !== true) {
            changedFields.push('isOnSale');
          }
        }
      }
    }

    // Handle explicit isOnSale toggle (only if discountPrice is already set)
    if (req.body.isOnSale !== undefined && updateData.discountPrice) {
      updateData.isOnSale = req.body.isOnSale === true || req.body.isOnSale === 'true';
      if (updateData.isOnSale !== existingProduct.isOnSale) {
        changedFields.push('isOnSale');
      }
    }

    console.log('[BACKEND PRODUCT EDIT] changedFields:', [...new Set(changedFields)]);

    // Update product in database
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    console.log('[BACKEND PRODUCT EDIT] Updated product:', {
      id: updatedProduct.id,
      name: updatedProduct.name,
      price: updatedProduct.price,
      sourceCode: updatedProduct.sourceCode,
    });

    // Persist updated image mapping by productCode / sourceCode when image was changed
    if (req.file && updatedProduct.sourceCode) {
      try {
        await productImageMappingService.saveImageMapping({
          productCode: updatedProduct.sourceCode,
          cloudinaryPublicId: req.file.public_id,
          secureUrl: req.file.secure_url,
          originalFilename: req.file.originalname || null,
          uploadedBy: String(req.user?.email || req.user?.id || 'admin'),
        });
      } catch (imgErr) {
        console.warn('[PRODUCT UPDATE] Image mapping save failed (non-fatal):', imgErr.message);
      }
    }

    const writebackScope = resolveProductWritebackScope(req, updatedProduct);
    const posCommands = [];
    let posWritebackSummary = {
      attempted: false,
      hasPending: false,
      hasFailure: false,
      hasSuccess: false,
      hasQueued: false,
      requestedLocationCode: writebackScope.requestedLocationCode,
      locationCode: writebackScope.posLocationCode,
      branchCode: writebackScope.branchCode,
      updatedFields: [...new Set(changedFields)],
    };

    let posCommand = {
      attempted: false,
      success: null,
      error: null,
      payload: null,
      commandId: null,
      commandType: null,
    };

    const resolvedPriceProductCode = normalizeProductCode(updatedProduct.sourceCode)
      || normalizeProductCode(updatedProduct.barcode)
      || normalizeProductCode(existingProduct.barcode);

    // Phase 1: enqueue UPDATE_PRICE command for products with actual price changes.
    // Product code resolution mirrors promotion sync behavior by requiring a valid POS product code.
    console.log('[UPDATE_PRICE CHECK] Conditions:', {
      hasSourceCode: Boolean(updatedProduct.sourceCode),
      hasBarcode: Boolean(updatedProduct.barcode || existingProduct.barcode),
      sourceCode: updatedProduct.sourceCode || null,
      barcode: updatedProduct.barcode || existingProduct.barcode || null,
      resolvedProductCode: resolvedPriceProductCode,
      incomingPriceProvided,
      priceChanged,
      existingPrice: Number(existingProduct.price),
      incomingParsedPrice,
      conditionMet: Boolean(resolvedPriceProductCode && incomingPriceProvided && priceChanged),
    });

    if (resolvedPriceProductCode && incomingPriceProvided && priceChanged) {
      const payload = {
        productId: String(updatedProduct.id),
        productCode: resolvedPriceProductCode,
        newPrice: incomingParsedPrice,
        oldPrice: Number(existingProduct.price),
        requestedLocationCode: writebackScope.requestedLocationCode,
        locationCode: writebackScope.posLocationCode,
        branchCode: writebackScope.branchCode,
        priceTypeCode: writebackScope.priceTypeCode,
      };

      posCommand.attempted = true;
      posCommand.commandType = 'UPDATE_PRICE';
      posCommand.payload = payload;

      console.log('[POS COMMAND QUEUE] enqueue UPDATE_PRICE start');
      console.log('[POS COMMAND QUEUE] enqueue payload:', payload);

      try {
        const queued = await posCommandQueueService.enqueueCommand('UPDATE_PRICE', payload, {
          source: 'product.updateProduct',
          relatedEntityType: 'Product',
          relatedEntityId: updatedProduct.id,
        });

        posCommand.success = true;
        posCommand.commandId = queued.id;
        posCommand.queueStatus = 'PENDING';
        console.log('[POS COMMAND QUEUE] UPDATE_PRICE queued:', {
          commandId: queued.id,
          productCode: payload.productCode,
          requestedLocationCode: payload.requestedLocationCode,
          resolvedPosLocationCode: payload.locationCode,
          branchCode: payload.branchCode,
          priceTypeCode: payload.priceTypeCode,
        });
      } catch (queueErr) {
        posCommand.success = false;
        posCommand.error = queueErr.message;
        posCommand.queueStatus = 'QUEUE_FAILED';
        console.error('[POS COMMAND QUEUE ERROR] enqueue UPDATE_PRICE failed:', queueErr.message);
      }

      posCommands.push({ ...posCommand });
    }

    if (updatedProduct.sourceCode && normalizedIncomingName && nameChanged) {
      const namePayload = {
        productId: String(updatedProduct.id),
        productCode: updatedProduct.sourceCode,
        oldName: existingProduct.name,
        newName: normalizedIncomingName,
        updatedBy,
        requestedLocationCode: writebackScope.requestedLocationCode,
        locationCode: writebackScope.posLocationCode,
        branchCode: writebackScope.branchCode,
      };

      const namePosCommand = {
        attempted: true,
        success: null,
        error: null,
        payload: namePayload,
        commandId: null,
        commandType: 'UPDATE_PRODUCT_NAME',
      };

      console.log('[POS COMMAND QUEUE] enqueue UPDATE_PRODUCT_NAME start', {
        productId: updatedProduct.id,
        productCode: updatedProduct.sourceCode,
        oldName: existingProduct.name,
        newName: normalizedIncomingName,
        updatedBy,
      });

      try {
        const queuedNameUpdate = await posCommandQueueService.enqueueCommand('UPDATE_PRODUCT_NAME', namePayload, {
          source: 'product.updateProduct',
          relatedEntityType: 'Product',
          relatedEntityId: updatedProduct.id,
          createdBy: updatedBy,
        });

        namePosCommand.success = true;
        namePosCommand.commandId = queuedNameUpdate.id;
        namePosCommand.queueStatus = 'PENDING';

        await recordProductNameSyncEvent({
          status: 'success',
          level: 'info',
          title: 'POS product name write-back queued',
          message: `Product name update for ${updatedProduct.sourceCode} was queued for POS sync.`,
          product: updatedProduct,
          payload: namePayload,
          queueResult: namePosCommand,
          req,
        });
      } catch (queueErr) {
        namePosCommand.success = false;
        namePosCommand.error = queueErr.message;
        namePosCommand.queueStatus = 'QUEUE_FAILED';

        console.error('[POS COMMAND QUEUE ERROR] enqueue UPDATE_PRODUCT_NAME failed:', queueErr.message);

        await recordProductNameSyncEvent({
          status: 'failed',
          level: 'error',
          title: 'POS product name write-back queue failed',
          message: `Product name update for ${updatedProduct.sourceCode} could not be queued for POS sync.`,
          product: updatedProduct,
          payload: namePayload,
          queueResult: namePosCommand,
          req,
          reason: queueErr.message,
        });
      }

      posCommands.push(namePosCommand);
    } else if (normalizedIncomingName && nameChanged && !updatedProduct.sourceCode) {
      console.log('[BACKEND POS WRITE SKIP] product name change skipped for non-POS product', {
        productId: updatedProduct.id,
        productName: updatedProduct.name,
      });
    }

    if (updatedProduct.sourceCode && incomingStockProvided && stockChanged) {
      console.log('[BACKEND PRODUCT EDIT] stockChanged detected', {
        productId: updatedProduct.id,
        sourceCode: updatedProduct.sourceCode,
        oldStock,
        newStock,
      });

      if (newStock < oldStock) {
        const qtyReduction = oldStock - newStock;
        const stockPayload = {
          productId: String(updatedProduct.id),
          productCode: updatedProduct.sourceCode,
          requestedLocationCode: writebackScope.requestedLocationCode,
          locationCode: writebackScope.posLocationCode,
          branchCode: writebackScope.branchCode,
          oldStock,
          newStock,
          qtyReduction,
          adjustmentType: 'DECREASE',
          reason: 'manual_admin_adjustment',
        };

        console.log('[POS COMMAND QUEUE] enqueue UPDATE_STOCK start', {
          oldStock,
          newStock,
          qtyReduction,
        });
        console.log('[POS COMMAND QUEUE] enqueue payload:', stockPayload);

        const stockPosCommand = {
          attempted: true,
          success: null,
          error: null,
          payload: stockPayload,
          commandId: null,
          commandType: 'UPDATE_STOCK',
        };

        try {
          const queuedStock = await posCommandQueueService.enqueueCommand('UPDATE_STOCK', stockPayload, {
            source: 'product.updateProduct',
            relatedEntityType: 'Product',
            relatedEntityId: updatedProduct.id,
          });

          stockPosCommand.success = true;
          stockPosCommand.commandId = queuedStock.id;
          stockPosCommand.queueStatus = 'PENDING';
          console.log('[POS COMMAND QUEUE] UPDATE_STOCK queued:', {
            commandId: queuedStock.id,
            productCode: stockPayload.productCode,
            requestedLocationCode: stockPayload.requestedLocationCode,
            resolvedPosLocationCode: stockPayload.locationCode,
            branchCode: stockPayload.branchCode,
          });
        } catch (queueErr) {
          stockPosCommand.success = false;
          stockPosCommand.error = queueErr.message;
          stockPosCommand.queueStatus = 'QUEUE_FAILED';
          console.error('[POS COMMAND QUEUE ERROR] enqueue UPDATE_STOCK failed:', queueErr.message);
        }

        posCommands.push(stockPosCommand);
      } else if (newStock > oldStock) {
        console.log('[BACKEND POS WRITE SKIP] stock increase detected; UPDATE_STOCK is decrease-only for Phase 2', {
          oldStock,
          newStock,
        });
      }
    } else if (incomingStockProvided && stockChanged && !updatedProduct.sourceCode) {
      console.log('[BACKEND POS WRITE SKIP] non-POS product stock change skipped', {
        productId: updatedProduct.id,
        oldStock,
        newStock,
      });
    }

    // Debug: Log what was actually saved to database
    console.log('[PRODUCT UPDATE] ✅ Product updated in database:', {
      id: updatedProduct.id,
      name: updatedProduct.name,
      imageSavedToDB: updatedProduct.image,
      imageIsCloudinary: updatedProduct.image?.startsWith('http'),
      isPOSProduct: !!updatedProduct.sourceCode,
      updatedFields: Object.keys(updateData)
    });

    // Notify if stock was updated and is now low (10 or below) or out of stock
    // ✅ This works for all products including POS products without images
    if (updateData.stock !== undefined) {
      await notifyLowStock(updatedProduct);
    }

    // Format product with computed fields
    const formattedProduct = formatProduct(updatedProduct, req, true);

    posWritebackSummary = {
      attempted: posCommands.some((command) => command.attempted),
      hasPending: posCommands.some((command) => command.queueStatus === 'PENDING'),
      hasFailure: posCommands.some((command) => command.success === false),
      hasSuccess: posCommands.some((command) => command.queueStatus === 'COMPLETED'),
      hasQueued: posCommands.some((command) => command.success === true),
      requestedLocationCode: writebackScope.requestedLocationCode,
      locationCode: writebackScope.posLocationCode,
      branchCode: writebackScope.branchCode,
      updatedFields: [...new Set(changedFields)],
      commands: posCommands.map((command) => ({
        commandId: command.commandId || null,
        commandType: command.commandType,
        success: command.success,
        queueStatus: command.queueStatus || null,
        requestedLocationCode: command.payload?.requestedLocationCode || null,
        locationCode: command.payload?.locationCode || null,
        branchCode: command.payload?.branchCode || null,
        error: command.error || null,
      })),
    };

    // Emit real-time product updates to all connected clients (name, price, promotion, stock, etc)
    try {
      const { emitProductUpdate } = require('../utils/socket');
      emitProductUpdate(updatedProduct);
      console.log(`[PRODUCT UPDATE] 🔄 Product update emitted for product ${updatedProduct.id}`);
    } catch (socketErr) {
      console.warn('[PRODUCT UPDATE] Could not emit socket event:', socketErr.message);
    }

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId || null,
      action: 'PRODUCT_UPDATED',
      resourceType: 'PRODUCT',
      resourceId: updatedProduct.id,
      status: 'SUCCESS',
      metadata: {
        updatedFields: Object.keys(updateData),
        changedFields: [...new Set(changedFields)],
        posWritebackSummary,
      },
    });

    return res.status(200).json({
      message: 'Product updated successfully',
      product: formattedProduct,
      posCommand,
      posCommands,
      posWritebackSummary,
    });
  } catch (err) {
    console.error('Error updating product:', err);
    return res.status(500).json({
      error: 'Server error while updating product',
    });
  }
};

/**
 * PUT /api/admin/inventory/stock-override/:id
 * Set or clear a website stock override for a product.
 * POS stock (product.stock) is never changed — only the override fields are updated.
 */
const setStockOverride = async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const overrideActive = req.body.overrideActive === true || req.body.overrideActive === 'true';
    const rawOverrideStock = req.body.overrideStock;
    const overrideReason = req.body.overrideReason == null
      ? null
      : String(req.body.overrideReason).trim() || null;
    const performedBy = getAdjustmentActor(req);

    let overrideStockValue = null;
    if (overrideActive) {
      const parsed = parseInt(rawOverrideStock, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return res.status(400).json({
          error: 'overrideStock must be a non-negative integer when Override Active is enabled',
        });
      }
      overrideStockValue = parsed;
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const previousOverrideActive = product.overrideActive;
    const previousOverrideStock = product.overrideStock;

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        overrideActive,
        overrideStock: overrideStockValue,
        overrideReason,
        overrideUpdatedAt: new Date(),
        overrideUpdatedBy: String(performedBy),
      },
    });

    // Logging
    if (overrideActive && !previousOverrideActive) {
      console.log('[STOCK OVERRIDE] Override ENABLED:', {
        productId,
        productName: product.name,
        posStock: product.stock,
        overrideStock: overrideStockValue,
        overrideReason,
        performedBy,
      });
    } else if (!overrideActive && previousOverrideActive) {
      console.log('[STOCK OVERRIDE] Override DISABLED — storefront reverts to POS stock:', {
        productId,
        productName: product.name,
        posStock: product.stock,
        performedBy,
      });
    } else if (overrideActive && previousOverrideStock !== overrideStockValue) {
      console.log('[STOCK OVERRIDE] Override QUANTITY CHANGED:', {
        productId,
        productName: product.name,
        from: previousOverrideStock,
        to: overrideStockValue,
        performedBy,
      });
    }

    try {
      const { emitProductUpdate } = require('../utils/socket');
      emitProductUpdate(updatedProduct);
    } catch (socketErr) {
      console.warn('[STOCK OVERRIDE] Socket emit failed:', socketErr.message);
    }

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId || null,
      action: 'PRODUCT_STOCK_OVERRIDE_UPDATED',
      resourceType: 'PRODUCT',
      resourceId: updatedProduct.id,
      status: 'SUCCESS',
      metadata: {
        overrideActive,
        overrideStock: overrideStockValue,
        overrideReason,
        previousOverrideActive,
        previousOverrideStock,
      },
    });

    return res.json({
      success: true,
      product: formatProduct(updatedProduct, req, true),
    });
  } catch (err) {
    console.error('[STOCK OVERRIDE] Error:', err.message);
    return res.status(500).json({ error: 'Failed to update stock override' });
  }
};

/**
 * PATCH /api/products/:id/stock-threshold
 * Update per-product low stock threshold.
 */
const updateProductStockThreshold = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const rawThreshold = req.body?.low_stock_threshold;
    if (rawThreshold === undefined || rawThreshold === null || String(rawThreshold).trim() === '') {
      return res.status(400).json({ error: 'low_stock_threshold is required' });
    }

    const parsedThreshold = parseInt(rawThreshold, 10);
    if (!Number.isInteger(parsedThreshold)) {
      return res.status(400).json({ error: 'low_stock_threshold must be an integer' });
    }

    if (parsedThreshold < 0) {
      return res.status(400).json({ error: 'low_stock_threshold cannot be negative' });
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        lowStockThreshold: parsedThreshold,
      },
    });

    const enriched = formatProduct(updated, req, true);

    console.log('[STOCK THRESHOLD] Updated per-product low stock threshold:', {
      productId: id,
      productName: updated.name,
      low_stock_threshold: enriched.low_stock_threshold,
      effective_stock: enriched.effective_stock,
      stock_status: enriched.stock_status,
      fallback_default: DEFAULT_LOW_STOCK_THRESHOLD,
    });

    try {
      const { emitProductUpdate } = require('../utils/socket');
      emitProductUpdate(updated);
    } catch (socketErr) {
      console.warn('[STOCK THRESHOLD] Socket emit failed:', socketErr.message);
    }

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId || null,
      action: 'PRODUCT_STOCK_THRESHOLD_UPDATED',
      resourceType: 'PRODUCT',
      resourceId: updated.id,
      status: 'SUCCESS',
      metadata: {
        lowStockThreshold: parsedThreshold,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Low stock threshold updated successfully',
      product: enriched,
    });
  } catch (error) {
    console.error('[STOCK THRESHOLD] Failed to update threshold:', error.message);
    return res.status(500).json({ error: 'Failed to update low stock threshold' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    // Extract and convert id to integer
    const id = parseInt(req.params.id);

    console.log('[DEBUG DELETE] Attempting to delete product:', id);

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    // Delete product from database
    // CASCADE constraints will automatically delete related CartItems and OrderItems
    await prisma.product.delete({
      where: { id },
    });

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId || null,
      action: 'PRODUCT_DELETED',
      resourceType: 'PRODUCT',
      resourceId: existingProduct.id,
      status: 'SUCCESS',
      metadata: {
        name: existingProduct.name,
        sourceCode: existingProduct.sourceCode,
      },
    });

    console.log('[DEBUG DELETE] Product deleted successfully:', id);

    return res.status(200).json({
      message: 'Product deleted successfully',
    });
  } catch (err) {  
    console.error('Error deleting product:', err);
    return res.status(500).json({
      error: 'Server error while deleting product',
    });
  }
};

/**
 * Sync products from POS Agent to database
 * ADMIN only endpoint
 */
const syncFromPOS = async (req, res) => {
  try {
    const { syncProductsFromPOS } = require('../services/posSync.service');

    console.log('[POS SYNC ENDPOINT] Starting manual sync...');
    const result = await syncProductsFromPOS();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Sync failed',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Products synced successfully',
      synced: result.synced,
      skipped: result.skipped,
      total: result.total,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[POS SYNC ENDPOINT] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Server error while syncing products',
      details: err.message,
    });
  }
};

/**
 * Receive products pushed from POS Sync Agent
 * Called by: POST /api/products/pos-sync/push
 * Authentication: x-pos-secret header
 * Updates Product table directly (single source of truth)
 */
const syncProductsFromPOSAgent = async (req, res) => {
  try {
    // Validate API secret
    const secret = req.headers['x-pos-secret'];
    const expectedSecret = process.env.POS_SECRET;

    if (!secret || secret !== expectedSecret) {
      console.error('[POS AGENT PUSH] Unauthorized attempt with secret:', secret ? 'provided' : 'missing');
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized: Invalid x-pos-secret header' 
      });
    }

    const { products, metadata = {} } = req.body;

    const rawPayloadLocationCode = metadata.locationCode
      || req.body.locationCode
      || process.env.POS_LOCATION_CODE
      || 'SH';
    const normalizedPayloadLocationCode = normalizeScopeCode(rawPayloadLocationCode);
    const branchCode = normalizeBranchCodeForIngest(
      req.headers['x-branch-code'] || metadata.branchCode || req.body.branchCode || 'BLANTYRE',
      normalizedPayloadLocationCode
    ) || 'BLANTYRE';
    const branchName = String(metadata.branchName || req.body.branchName || branchCode).trim() || branchCode;
    // Do not silently default Zomba payloads to SH when locationCode is missing.
    const payloadLocationCode = branchCode === 'ZOMBA'
      ? normalizeScopeCode(metadata.locationCode || req.body.locationCode || null)
      : normalizedPayloadLocationCode;
    const syncLogPrefix = `[${branchCode} SYNC]`;

    if (!products || !Array.isArray(products)) {
      console.error('[POS AGENT PUSH] Invalid products format');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid products format. Expected array.' 
      });
    }

    console.log(`${syncLogPrefix} Received ${products.length} products from POS Agent`);

    let synced = 0;
    let skipped = 0;
    const errors = [];
    const affectedLocations = new Set();
    const affectedSourceCodes = new Set();
    let stockChangedCount = 0;
    let priceChangedCount = 0;
    let upsertKeySamplesLogged = 0;
    let zombaIngestSamplesLogged = 0;
    let zombaResolvedSamplesLogged = 0;
    const zombaPersistedByLocation = {
      SH: 0,
      BAR: 0,
      ST999: 0,
    };

    for (const product of products) {
      try {
        const sourceCode = String(product.productCode || product.ProductCode || product.sourceCode || '').trim();
        const incomingLocationCode = normalizeScopeCode(product.locationCode || product.LocationCode || null);
        const productLocationCode = normalizeScopeCode(incomingLocationCode || payloadLocationCode);
        const stockSourceRaw = String(product.stockSource || product.StockSource || '').trim();
        const stockDateRaw = String(product.stockDate || product.StockDate || '').trim() || null;

        // Validate required fields
        if (!sourceCode || !product.name) {
          skipped++;
          errors.push(`Missing required fields for product: ${JSON.stringify(product)}`);
          continue;
        }

        if (branchCode === 'ZOMBA' && zombaIngestSamplesLogged < 20) {
          console.log('[POS PRODUCT INGEST][INCOMING]', {
            productCode: sourceCode,
            productName: String(product.name || ''),
            incomingBranchCode: String(req.headers['x-branch-code'] || metadata.branchCode || req.body.branchCode || '').trim() || null,
            incomingLocationCode: String(product.locationCode || product.LocationCode || metadata.locationCode || req.body.locationCode || '').trim() || null,
            sourceCode: String(product.sourceCode || '').trim() || null,
            stock: Number(product.stock || 0),
            price: Number(product.price || 0),
          });
          zombaIngestSamplesLogged += 1;
        }

        if (branchCode === 'ZOMBA' && !productLocationCode) {
          skipped++;
          const rejection = `[ZOMBA STOCK][REJECTED] product=${sourceCode || 'UNKNOWN'} stockDate=${stockDateRaw || 'NULL'} source=${stockSourceRaw || 'Unknown'} location=NULL stock=${Number(product.stock || 0)} reason=MISSING_LOCATION_CODE`;
          errors.push(rejection);
          console.warn(rejection);
          continue;
        }

        // Zomba sync accepts true POS location codes; UI decides which operational scopes are exposed.
        if (branchCode === 'ZOMBA' && !CORE_ZOMBA_LOCATION_CODES.includes(productLocationCode)) {
          skipped++;
          const rejection = `[ZOMBA STOCK][REJECTED] product=${sourceCode} stockDate=${stockDateRaw || 'NULL'} source=${stockSourceRaw || 'Unknown'} location=${productLocationCode || 'NULL'} stock=${Number(product.stock || 0)} reason=UNSUPPORTED_LOCATION_CODE`;
          errors.push(rejection);
          console.warn(rejection);
          continue;
        }

        if (branchCode === 'BLANTYRE' && BLANTYRE_DISALLOWED_LOCATION_CODES.includes(productLocationCode)) {
          skipped++;
          const rejection = `[POS PRODUCT INGEST][REJECTED] product=${sourceCode} branch=${branchCode} location=${productLocationCode} reason=BRANCH_LOCATION_MISMATCH`;
          errors.push(rejection);
          console.warn(rejection);
          continue;
        }

        if (branchCode === 'ZOMBA' && productLocationCode === 'BT') {
          skipped++;
          const rejection = `[POS PRODUCT INGEST][REJECTED] product=${sourceCode} branch=${branchCode} location=${productLocationCode} reason=BRANCH_LOCATION_MISMATCH`;
          errors.push(rejection);
          console.warn(rejection);
          continue;
        }

        // Guard against legacy calculated/fallback payloads for Zomba operational stock.
        if (branchCode === 'ZOMBA' && stockSourceRaw) {
          const normalizedSource = stockSourceRaw.toLowerCase();
          const allowedSource = normalizedSource.includes('dailystockbalance')
            || normalizedSource.includes('stockdetailslive')
            || normalizedSource.includes('stockdetailsreport')
            || normalizedSource.includes('productactivity')
            || normalizedSource === 'nostockrow';
          if (!allowedSource) {
            skipped++;
            const rejection = `[ZOMBA STOCK][REJECTED] product=${sourceCode} stockDate=${stockDateRaw || 'NULL'} source=${stockSourceRaw} location=${productLocationCode || 'NULL'} stock=${Number(product.stock || 0)} reason=UNSUPPORTED_STOCK_SOURCE`;
            errors.push(rejection);
            console.warn(rejection);
            continue;
          }
        }

        if (branchCode === 'ZOMBA' && zombaResolvedSamplesLogged < 20) {
          console.log('[POS PRODUCT INGEST][RESOLVED]', {
            productCode: sourceCode,
            resolvedBranchCode: branchCode,
            resolvedLocationCode: productLocationCode,
            resolvedSourceCode: sourceCode,
          });
          zombaResolvedSamplesLogged += 1;
        }

        const existingProduct = await prisma.product.findFirst({
          where: {
            sourceCode,
            branchCode,
            locationCode: productLocationCode,
          },
          select: {
            id: true,
            name: true,
            stock: true,
            sourceCode: true,
            branchCode: true,
            locationCode: true,
            lowStockThreshold: true,
            overrideActive: true,
            overrideStock: true,
          },
        });

        if (upsertKeySamplesLogged < 40) {
          console.log('[POS PRODUCT INGEST][UPSERT_KEY]', {
            branchCode,
            locationCode: productLocationCode,
            productCode: sourceCode,
            existingProductId: existingProduct ? existingProduct.id : null,
            operation: existingProduct ? 'update' : 'create',
          });
          upsertKeySamplesLogged += 1;
        }

        const normalizedBatches = Array.isArray(product.expiryBatches)
          ? product.expiryBatches
              .map((batch) => {
                const expiryDate = batch?.expiryDate ? new Date(batch.expiryDate) : null;
                const remainingQty = Number(batch?.remainingQty ?? batch?.RemainingQty ?? 0);
                const stockDetailId = batch?.stockDetailId ? String(batch.stockDetailId).trim() : null;
                const grnNo = batch?.grnNo ? String(batch.grnNo).trim() : null;
                if (!expiryDate || Number.isNaN(expiryDate.getTime())) return null;
                if (formatLocalDateKey(expiryDate) === '1900-01-01') return null;
                if (expiryDate < MIN_VALID_EXPIRY_DATE) return null;
                if (!Number.isFinite(remainingQty) || remainingQty <= 0) return null;

                return {
                  productCode: sourceCode,
                  expiryDate,
                  remainingQty,
                  locationCode: normalizeScopeCode(batch?.locationCode) || productLocationCode || payloadLocationCode,
                  batchNo: encodeExpiryBatchReference(stockDetailId, grnNo, batch?.batchNo),
                  lastSyncedAt: new Date(),
                };
              })
              .filter(Boolean)
          : [];

        const nearestBatch = normalizedBatches
          .slice()
          .sort((a, b) => a.expiryDate - b.expiryDate)[0] || null;

        const nearestExpiryDate = product.nearestExpiryDate
          ? new Date(product.nearestExpiryDate)
          : (product.expiryDate ? new Date(product.expiryDate) : (nearestBatch ? nearestBatch.expiryDate : null));

        // Upsert product into Product table (single source of truth)
        // IMPORTANT: override fields (overrideActive, overrideStock, overrideReason,
        // overrideUpdatedAt, overrideUpdatedBy) are intentionally NOT included in the
        // update block — POS sync must never overwrite admin-set website stock overrides.
        const baseProductData = {
          name: product.name,
          price: product.price || 0,
          stock: product.stock || 0,
          category: product.category || 'Uncategorized',
          description: product.description || '',
          barcode: product.barcode || '',
          expiryDate: nearestExpiryDate,
          expiryBatchCount: normalizedBatches.length,
          locationCode: productLocationCode,
          ...(branchCode === 'ZOMBA' ? { hideFromProductsPage: true } : {}),
          updatedAt: new Date(),
        };

        const result = existingProduct
          ? await prisma.product.update({
              where: { id: existingProduct.id },
              data: baseProductData,
            })
          : await prisma.product.create({
              data: {
                branchCode,
                sourceCode,
                ...baseProductData,
                hideFromProductsPage: branchCode === 'ZOMBA',
                isActive: true,
                createdAt: new Date(),
              },
            });

        // Reattach persistent image mapping after upsert so images survive wipe+resync flows.
        try {
          await productImageMappingService.reattachImageByProductCode(sourceCode);
        } catch (imgErr) {
          console.warn(`[POS AGENT PUSH] Image reattach skipped for ${sourceCode}:`, imgErr.message);
        }

        await prisma.productExpiryBatch.deleteMany({
          where: {
            productCode: sourceCode,
            locationCode: productLocationCode || payloadLocationCode,
          },
        });

        if (normalizedBatches.length > 0) {
          await prisma.productExpiryBatch.createMany({
            data: normalizedBatches,
            skipDuplicates: true,
          });
        }

        synced++;
        affectedLocations.add(productLocationCode || payloadLocationCode || 'UNKNOWN');
        affectedSourceCodes.add(sourceCode);
        if (existingProduct && Number(existingProduct.stock || 0) !== Number(baseProductData.stock || 0)) {
          stockChangedCount += 1;
        }
        if (existingProduct && Number(existingProduct.price || 0) !== Number(baseProductData.price || 0)) {
          priceChangedCount += 1;
        }
        if (branchCode === 'ZOMBA' && Object.prototype.hasOwnProperty.call(zombaPersistedByLocation, productLocationCode)) {
          zombaPersistedByLocation[productLocationCode] += 1;
        }
        
        // Fetch the complete product with all fields for frontend
        const completeProduct = await prisma.product.findUnique({
          where: { id: result.id }
        });

        if (completeProduct) {
          const currentStockStatus = enrichProductStock(completeProduct).stock_status;
          const isAlertState = ['low_stock', 'out_of_stock'].includes(currentStockStatus);

          if (branchCode === 'ZOMBA') {
            const stockSourceLabel = stockSourceRaw || 'UnknownPayloadSource';
            const isVerificationProduct = sourceCode === '9501100002174';
            console.log(`[ZOMBA STOCK] product=${sourceCode} stockDate=${stockDateRaw || 'NULL'} source=${stockSourceLabel} location=${productLocationCode || payloadLocationCode || 'SH'} stock=${Number(completeProduct.stock || 0)}`);
            if (isVerificationProduct) {
              console.log(`[ZOMBA STOCK][VERIFY] product=9501100002174 stockDate=${stockDateRaw || 'NULL'} source=${stockSourceLabel} location=${productLocationCode || payloadLocationCode || 'SH'} stock=${Number(completeProduct.stock || 0)}`);
            }
          }

          if (isAlertState) {
            await notifyLowStock(completeProduct);
          }
        }
        
        // Emit real-time update for this specific product (for instant frontend updates)


        
        console.log(`${syncLogPrefix} products synced: ${product.name} (${product.sourceCode})`);
      } catch (error) {
        skipped++;
        const errorMsg = `Failed to sync product ${product.sourceCode}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`${syncLogPrefix} error (product sync): ${errorMsg}`);
      }
    }

    if (branchCode === 'ZOMBA') {
      console.log('[POS PRODUCT INGEST][SUMMARY]', {
        persistedByLocation: zombaPersistedByLocation,
        synced,
        skipped,
      });
    }

    // Emit real-time update to all connected clients
    if (synced > 0 && global.io) {
      try {
        const affectedLocationsList = Array.from(affectedLocations.values()).filter(Boolean);
        const affectedProductCodeSample = Array.from(affectedSourceCodes.values()).slice(0, 50);

        global.io.emit('pos-products-synced', {
          synced,
          skipped,
          total: products.length,
          stockChangedCount,
          priceChangedCount,
          branchCode,
          locationCode: payloadLocationCode || null,
          affectedProductCodeSample,
affectedScopes: affectedLocationsList.map(loc => ({
  branchCode,
  locationCode: loc
})),
          timestamp: new Date().toISOString(),
        });
        console.log(`${syncLogPrefix} emitted realtime update for ${synced} synced products`, {
          stockChangedCount,
          priceChangedCount,
          affectedLocations: affectedLocationsList,
          affectedProductCodes: affectedProductCodeSample.length,
        });
      } catch (ioErr) {
        console.warn(`${syncLogPrefix} realtime emit warning:`, ioErr.message);
      }
    }

    if (synced > 0) {
      console.log('[POS AGENT PUSH][FRESHNESS]', {
        branchCode,
        locationCode: payloadLocationCode || null,
        synced,
        stockChangedCount,
        priceChangedCount,
        affectedLocations: Array.from(affectedLocations.values()).filter(Boolean),
        affectedProductCodesSample: Array.from(affectedSourceCodes.values()).slice(0, 20),
      });
    }

    console.log(`${syncLogPrefix} Sync complete - Synced: ${synced}, Skipped: ${skipped}`);

    await recordPosSyncEvent({
      eventType: 'agent-push-products',
      source: 'pos-sync-agent',
      status: skipped > 0 ? 'warning' : 'success',
      level: skipped > 0 ? 'warning' : 'info',
      title: skipped > 0 ? 'Agent push completed with sync errors' : 'Agent push completed',
      message: `POS agent pushed ${products.length} product(s): ${synced} synced, ${skipped} skipped.`,
      reason: skipped > 0 ? `${skipped} product record(s) could not be processed successfully.` : null,
      suggestion: skipped > 0 ? 'Inspect malformed product records and verify the agent payload still matches backend expectations.' : 'No action required.',
      metadata: {
        total: products.length,
        synced,
        skipped,
        branchCode,
        branchName,
        locationCode: payloadLocationCode,
        errors: errors.slice(0, 20),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Products received and processed',
      synced,
      skipped,
      total: products.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('[POS AGENT PUSH] Endpoint error:', err.message);

    await recordPosSyncEvent({
      eventType: 'agent-push-products',
      source: 'pos-sync-agent',
      status: 'failed',
      level: 'error',
      title: 'POS agent push failed',
      message: 'The backend failed to process an inbound product push from the POS sync agent.',
      reason: err.message,
      suggestion: 'Check authentication, payload shape, and backend database constraints for the pushed product batch.',
    });

    return res.status(500).json({
      success: false,
      error: 'Server error while processing POS products',
      details: err.message,
    });
  }
};

/**
 * Delete all POS synced products (products with sourceCode)
 * Admin only endpoint
 */
const deletePOSProducts = async (req, res) => {
  try {
    const deleted = await prisma.product.deleteMany({
      where: {
        sourceCode: {
          not: null
        }
      }
    });

    console.log(`[DELETE POS] Deleted ${deleted.count} POS products`);

    return res.status(200).json({
      success: true,
      message: `Deleted ${deleted.count} POS products`,
      deletedCount: deleted.count,
    });
  } catch (err) {
    console.error('[DELETE POS] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete POS products',
      details: err.message,
    });
  }
};

/**
 * Get all distinct categories
 * Used for filter dropdowns on frontend
 */
const getCategories = async (req, res) => {
  try {
    const requestedLocationCode = normalizeScopeCode(req.query.locationCode);
    const effectiveLocationCode = requestedLocationCode || (!isAdminRequest(req) ? getStorefrontLocationCode() : null);

    // Get all distinct categories from Product table (single source of truth)
    const where = {
      category: {
        not: null
      },
      enabled: true,
      isActive: true
    };

    if (effectiveLocationCode) {
      // For legacy Blantyre behavior, assume BLANTYRE branch
      const scopedProductCodes = await resolveLocationScopedProductCodes('BLANTYRE', effectiveLocationCode);
      if (!scopedProductCodes || scopedProductCodes.length === 0) {
        return res.status(200).json({ categories: [] });
      }

      where.sourceCode = { in: scopedProductCodes };
      where.branchCode = 'BLANTYRE';
    }

    const categories = await prisma.product.findMany({
      where,
      distinct: ['category'],
      select: {
        category: true
      },
      orderBy: {
        category: 'asc'
      }
    });

    const categoryList = categories
      .map(c => c.category)
      .filter(c => c && c.trim() !== '');

    console.log(`[CATEGORIES] Retrieved ${categoryList.length} unique categories from Product table`);

    return res.status(200).json({
      categories: categoryList
    });
  } catch (err) {
    console.error('[CATEGORIES ERROR]:', err);
    return res.status(500).json({
      error: 'Server error while fetching categories'
    });
  }
};

/**
 * Toggle product visibility (Enabled field)
 * Admin only endpoint
 */
const toggleProductVisibility = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'enabled field must be a boolean'
      });
    }

    // Fetch current product
    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    // Update product
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { enabled }
    });

    console.log(`[VISIBILITY] Product ${id} (${updatedProduct.name}) toggled to ${enabled ? 'visible' : 'hidden'}`);

    return res.status(200).json({
      success: true,
      message: `Product ${enabled ? 'enabled' : 'disabled'} successfully`,
      product: formatProduct(updatedProduct, req)
    });
  } catch (err) {
    console.error('[VISIBILITY ERROR]:', err.message);
    return res.status(500).json({
      error: 'Failed to toggle product visibility',
      details: err.message
    });
  }
};

async function refreshAllProductsExpiryCache(locationCode) {
  const expiryResult = await posSyncService.getExpiryProductsFromPOS({
    days: 3650,
    locationCode,
    includeExpired: true,
    source: 'view',
    requestTimeoutMs: ADMIN_EXPIRY_ALERTS_REQUEST_TIMEOUT_MS,
  });

  if (!expiryResult.success) {
    throw new Error(expiryResult.error || 'Live POS expiry alert fetch failed');
  }

  const rows = (Array.isArray(expiryResult.data?.data) ? expiryResult.data.data : [])
    .map((row) => ({
      productCode: normalizeProductCode(row?.ProductCode || row?.productCode),
      ...normalizeLiveBatchForResponse(row),
    }))
    .filter((row) => row.productCode && row.expiryDate);

  _allProductsExpiryCache.rows = rows;
  _allProductsExpiryCache.ts = Date.now();
  _allProductsExpiryCache.locationCode = locationCode;

  return rows;
}

const getExpiryBatchAlerts = async (req, res) => {
  try {
    const locationCode = String(req.query.locationCode || process.env.POS_LOCATION_CODE || 'SH').trim().toUpperCase();
    let rawRows = [];

    // Check if cache is fresh
    const now = Date.now();
    const isCacheFresh = _allProductsExpiryCache.ts > 0 && (now - _allProductsExpiryCache.ts) < ADMIN_EXPIRY_CACHE_TTL_MS;

    const hasCachedRows = Array.isArray(_allProductsExpiryCache.rows) && _allProductsExpiryCache.rows.length > 0;
    const cacheMatchesLocation = !_allProductsExpiryCache.locationCode || _allProductsExpiryCache.locationCode === locationCode;

    if (isCacheFresh && hasCachedRows && cacheMatchesLocation) {
      console.log('[EXPIRY ALERTS] using cached all-products expiry rows (age: %dms)', now - _allProductsExpiryCache.ts);
      rawRows = _allProductsExpiryCache.rows;
    } else {
      if (hasCachedRows && cacheMatchesLocation) {
        // stale-while-revalidate: return stale cache immediately and refresh in background
        rawRows = _allProductsExpiryCache.rows;

        if (!_allProductsExpiryCache.refreshing) {
          _allProductsExpiryCache.refreshing = true;
          refreshAllProductsExpiryCache(locationCode)
            .then((rows) => {
              console.log('[EXPIRY ALERTS] background cache refresh complete:', rows.length, 'rows');
            })
            .catch((refreshError) => {
              console.warn('[EXPIRY ALERTS] background cache refresh failed', refreshError.message);
            })
            .finally(() => {
              _allProductsExpiryCache.refreshing = false;
            });
        }
      } else {
        try {
          rawRows = await refreshAllProductsExpiryCache(locationCode);
        } catch (liveError) {
          console.warn('[EXPIRY ALERTS] live POS fetch failed, falling back to stored batches', liveError.message);
          rawRows = await prisma.productExpiryBatch.findMany({
            where: {
              OR: [
                { locationCode: null },
                { locationCode },
              ],
            },
            orderBy: [
              { expiryDate: 'asc' },
              { productCode: 'asc' },
            ],
          });
        }
      }
    }

    const productCodes = Array.from(new Set(rawRows.map((row) => row.productCode).filter(Boolean)));
    // For legacy compatibility, assume BLANTYRE branch for expiry data
    const derivedBranchCode = 'BLANTYRE';
    const products = productCodes.length > 0
      ? await prisma.product.findMany({
          where: {
            sourceCode: { in: productCodes },
            branchCode: derivedBranchCode,
          },
          select: { sourceCode: true, name: true, category: true },
        })
      : [];
    const productsByCode = new Map(products.map((product) => [String(product.sourceCode || '').trim(), product]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alerts = rawRows.map((row) => {
      const decodedRef = decodeExpiryBatchReference(row.batchNo);
      const expiryDate = row.expiryDate instanceof Date ? row.expiryDate : new Date(row.expiryDate);
      const days = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const status = days < 0
        ? 'expired'
        : (days <= 7 ? 'expiring_soon' : (days <= 30 ? 'near_expiry' : 'ok'));

      return {
        productCode: row.productCode,
        productName: productsByCode.get(String(row.productCode || '').trim())?.name || row.productCode,
        category: productsByCode.get(String(row.productCode || '').trim())?.category || null,
        expiryDate: expiryDate.toISOString(),
        locationCode: row.locationCode,
        stockDetailId: row.stockDetailId || decodedRef.stockDetailId,
        grnNo: row.grnNo || decodedRef.grnNo,
        batchNo: row.grnNo || decodedRef.grnNo || row.stockDetailId || decodedRef.stockDetailId || row.batchNo,
        receivedQty: row.receivedQty ?? null,
        daysToExpiry: days,
        status,
      };
    });

    const expiredCount = alerts.filter((row) => row.status === 'expired').length;
    const nearExpiryCount = alerts.filter((row) => row.status === 'expiring_soon' || row.status === 'near_expiry').length;
    console.log('[EXPIRY ALERTS] products evaluated count', productCodes.length);
    console.log('[EXPIRY ALERTS] expired count', expiredCount);
    console.log('[EXPIRY ALERTS] near expiry count', nearExpiryCount);
    console.log('[EXPIRY ALERTS] sample alert row', alerts[0] || null);

    return res.status(200).json({
      success: true,
      data: alerts,
      meta: {
        productsEvaluated: productCodes.length,
        expiredCount,
        nearExpiryCount,
      },
    });
  } catch (error) {
    console.error('[EXPIRY ALERTS] failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch expiry batch alerts',
      details: error.message,
    });
  }
};

/**
 * DELETE /api/products/:id/image
 * Permanently delete a product's image mapping AND its Cloudinary asset.
 * This is separate from deleting the product row itself.
 * The product row loses its image field; the mapping is also erased.
 */
const permanentDeleteProductImage = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!product.sourceCode) {
      return res.status(400).json({ error: 'This product has no POS ProductCode; cannot delete persistent image mapping' });
    }

    const result = await productImageMappingService.permanentlyDeleteImageMapping(product.sourceCode);
    if (!result.success) {
      return res.status(404).json({ error: result.error || 'Image mapping not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Product image permanently deleted from Cloudinary and mapping removed.',
      cloudinaryResult: result.cloudinaryResult,
    });
  } catch (err) {
    console.error('[PERMANENT DELETE IMAGE] Error:', err.message);
    return res.status(500).json({ error: 'Server error while deleting product image' });
  }
};

/**
 * POST /api/products/images/reconcile
 * Scan all POS products without images and reattach any available mappings.
 * Useful after a bulk POS rebuild.
 */
const reconcileProductImages = async (req, res) => {
  try {
    const result = await productImageMappingService.reconcileAllProductImages();
    return res.status(200).json({
      success: true,
      message: `Image reconciliation complete.`,
      processed: result.processed,
      matched: result.matched,
      unmatched: result.unmatched,
    });
  } catch (err) {
    console.error('[RECONCILE IMAGES] Error:', err.message);
    return res.status(500).json({ error: 'Server error during image reconciliation' });
  }
};

module.exports = {
  ensureProductPerformanceIndexes,
  createProduct,
  getProducts,
  getProductById,
  updateProductStockThreshold,
  updateProduct,
  setStockOverride,
  deleteProduct,
  syncFromPOS,
  syncProductsFromPOSAgent,
  permanentDeleteProductImage,
  reconcileProductImages,
  getExpiryBatchAlerts,
  getCategories,
  toggleProductVisibility,
  deletePOSProducts,
};
