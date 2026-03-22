const { PrismaClient } = require('@prisma/client');
const { computeExpiryStatus, suggestDiscount } = require('../utils/expiryStatus');
const { notifyLowStock } = require('../utils/messageService');
const posCommandQueueService = require('../services/posCommandQueue.service');
const posSyncService = require('../services/posSync.service');
const { verifyToken } = require('../utils/jwt');

const prisma = new PrismaClient();
const MIN_VALID_EXPIRY_DATE = new Date('2000-01-01T00:00:00.000Z');
const ADMIN_EXPIRY_REQUEST_TIMEOUT_MS = 30000;
const ADMIN_EXPIRY_CACHE_TTL_MS = 5 * 60 * 1000;
const ADMIN_EXPIRY_ALERTS_REQUEST_TIMEOUT_MS = Number(process.env.ADMIN_EXPIRY_ALERTS_REQUEST_TIMEOUT_MS || 8000);

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

const ADMIN_INVENTORY_ADJUSTMENT_AUDIT_SOURCE = 'admin_inventory_adjustment_audit';

function getAdjustmentActor(req) {
  return String(req.user?.email || req.user?.id || req.user?.userId || 'admin').trim();
}

function getDefaultLocationCode() {
  return String(process.env.POS_LOCATION_CODE || 'SH').trim();
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

// ensure a trigram index for fast case-insensitive name searches (autocomplete)
(async () => {
  try {
    // Existing trigram index for search
    await prisma.$executeRaw(`
      CREATE INDEX IF NOT EXISTS idx_product_name_search
      ON "Product" USING gin (name gin_trgm_ops);
    `);
    
    // Index for visibility filtering (enabled = true)
    await prisma.$executeRaw(`
      CREATE INDEX IF NOT EXISTS idx_product_enabled
      ON "Product"(enabled);
    `);
    
    // Index for category filtering
    await prisma.$executeRaw(`
      CREATE INDEX IF NOT EXISTS idx_product_category
      ON "Product"(category);
    `);
    
    // Combined index for enabled + category queries
    await prisma.$executeRaw(`
      CREATE INDEX IF NOT EXISTS idx_product_enabled_category
      ON "Product"(enabled, category);
    `);
    
    // Index for isOnSale filtering
    await prisma.$executeRaw(`
      CREATE INDEX IF NOT EXISTS idx_product_on_sale
      ON "Product"(isOnSale);
    `);
    
    console.log('[DB INIT] ensured all performance indexes on Product table');
  } catch (err) {
    console.error('[DB INIT] failed to create indexes:', err.message);
  }
})();

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

  const formatted = {
    ...product,
    imageUrl,
    expiryStatus,
    daysToExpiry,
    expirySource: product.expirySource || null,
    finalPrice
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

  const isoDate = date.toISOString().slice(0, 10);
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

    // Notify if stock is low (10 or below) or out of stock
    // ✅ This works for all products including POS products without images
    if (product.stock <= 10) {
      await notifyLowStock(product);
    }

    // Format product with computed fields
    const formattedProduct = formatProduct(product, req, true);

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
    const { search, category, onSale, page, pageSize, offset, limit, includePosExpiry } = req.query;
    const requestedPosExpiry = String(includePosExpiry || '').trim().toLowerCase() === 'true';
    const forceAdminPosExpiry = shouldForceAdminExpiryEnrichment(req);
    const shouldIncludePosExpiry = requestedPosExpiry || forceAdminPosExpiry;

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
      hideFromProductsPage: false, // Exclude hidden products
    };

    // Search filter (case-insensitive name search)
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive'
      };
    }

    // Category filter
    if (category) {
      where.category = category;
    }

    // On Sale filter
    if (onSale === 'true') {
      where.isOnSale = true;
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
        hideFromProductsPage: true
      },
      skip,
      take,
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Debug logging
    console.log(`[PRODUCTS] Retrieved: ${products.length}, Total: ${total}, Category: ${category || 'all'}, Search: ${search || 'none'}`);

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
        hideFromProductsPage: true
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

    // Extract and convert id to integer
    const id = parseInt(req.params.id);

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
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

    if (req.body.name !== undefined && req.body.name !== '') {
      updateData.name = req.body.name;
      if (req.body.name !== existingProduct.name) {
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
      incomingParsedStock = parsedStock;
      newStock = parsedStock;
      stockChanged = parsedStock !== Number(existingProduct.stock);

      if (stockChanged) {
        return res.status(400).json({
          error: 'Direct stock edits via product update are disabled. Use the admin inventory adjustment endpoint instead.',
          code: 'STOCK_UPDATE_REQUIRES_ADJUSTMENT_ENDPOINT',
        });
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

    const posCommands = [];

    let posCommand = {
      attempted: false,
      success: null,
      error: null,
      payload: null,
      commandId: null,
      commandType: null,
    };

    // Phase 1: enqueue UPDATE_PRICE command for POS-linked products with actual price changes
    if (updatedProduct.sourceCode && incomingPriceProvided && priceChanged) {
      const payload = {
        productId: String(updatedProduct.id),
        productCode: updatedProduct.sourceCode,
        newPrice: incomingParsedPrice,
        oldPrice: Number(existingProduct.price),
        locationCode: process.env.POS_LOCATION_CODE || 'SH',
        priceTypeCode: '1',
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
        console.log('[POS COMMAND QUEUE] enqueue UPDATE_PRICE success:', { commandId: queued.id });
      } catch (queueErr) {
        posCommand.success = false;
        posCommand.error = queueErr.message;
        console.error('[POS COMMAND QUEUE ERROR] enqueue UPDATE_PRICE failed:', queueErr.message);
      }

      posCommands.push({ ...posCommand });
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
    if (updateData.stock !== undefined && updatedProduct.stock <= 10) {
      await notifyLowStock(updatedProduct);
    }

    // Format product with computed fields
    const formattedProduct = formatProduct(updatedProduct, req, true);

    // Emit real-time product updates to all connected clients (name, price, promotion, stock, etc)
    try {
      const { emitProductUpdate } = require('../utils/socket');
      emitProductUpdate(updatedProduct);
      console.log(`[PRODUCT UPDATE] 🔄 Product update emitted for product ${updatedProduct.id}`);
    } catch (socketErr) {
      console.warn('[PRODUCT UPDATE] Could not emit socket event:', socketErr.message);
    }

    return res.status(200).json({
      message: 'Product updated successfully',
      product: formattedProduct,
      posCommand,
      posCommands,
    });
  } catch (err) {
    console.error('Error updating product:', err);
    return res.status(500).json({
      error: 'Server error while updating product',
    });
  }
};

const adjustInventoryStock = async (req, res) => {
  try {
    const requestedProductCode = typeof req.body.productCode === 'string'
      ? req.body.productCode
      : String(req.body.productCode == null ? '' : req.body.productCode);
    const expectedLocationCode = getDefaultLocationCode();
    const locationCode = String(req.body.locationCode || expectedLocationCode).trim();
    const reason = String(req.body.reason || '').trim();
    const notes = req.body.notes == null ? '' : String(req.body.notes).trim();
    const performedBy = getAdjustmentActor(req);
    const timestamp = new Date();
    const parsedAdjustmentQty = Number.parseInt(req.body.adjustmentQty, 10);

    if (!requestedProductCode || requestedProductCode.trim().length === 0) {
      return res.status(400).json({ error: 'productCode is required' });
    }

    console.log('[ADMIN INVENTORY] ProductCode validated:', {
      productCode: requestedProductCode,
      length: requestedProductCode.length,
    });

    if (!locationCode) {
      return res.status(400).json({ error: 'locationCode is required' });
    }

    if (locationCode !== expectedLocationCode) {
      return res.status(400).json({
        error: `Unsupported locationCode. Expected ${expectedLocationCode}`,
      });
    }

    if (!Number.isInteger(parsedAdjustmentQty) || parsedAdjustmentQty === 0) {
      return res.status(400).json({ error: 'adjustmentQty must be a non-zero integer' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { sourceCode: requestedProductCode },
      });

      if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const previousStock = Number(product.stock || 0);
      const newStock = previousStock + parsedAdjustmentQty;

      if (newStock < 0) {
        throw new Error('NEGATIVE_STOCK_NOT_ALLOWED');
      }

      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: { stock: newStock },
      });

      const auditPayload = {
        productId: String(product.id),
        productCode: product.sourceCode,
        locationCode,
        adjustmentQty: parsedAdjustmentQty,
        previousStock,
        newStock,
        reason,
        notes,
        performedBy,
        timestamp: timestamp.toISOString(),
        adjustmentClass: 'MANUAL_CORRECTION',
      };

      const auditLog = await tx.posWriteCommand.create({
        data: {
          commandType: 'UPDATE_STOCK',
          status: 'COMPLETED',
          payload: auditPayload,
          source: ADMIN_INVENTORY_ADJUSTMENT_AUDIT_SOURCE,
          relatedEntityType: 'Product',
          relatedEntityId: String(product.id),
          createdBy: performedBy,
          pickedAt: timestamp,
          processedAt: timestamp,
          resultSummary: {
            auditOnly: true,
            posWriteQueued: false,
          },
          maxRetries: 0,
        },
      });

      return {
        product: updatedProduct,
        auditLog,
        previousStock,
        newStock,
      };
    });

    let posCommand = null;

    if (parsedAdjustmentQty < 0) {
      const qtyReduction = Math.abs(parsedAdjustmentQty);
      const stockPayload = {
        productId: String(result.product.id),
        productCode: result.product.sourceCode,
        locationCode,
        oldStock: result.previousStock,
        newStock: result.newStock,
        qtyReduction,
        adjustmentType: 'DECREASE',
        reason,
        notes,
        performedBy,
        timestamp: timestamp.toISOString(),
      };

      try {
        posCommand = await posCommandQueueService.enqueueCommand('UPDATE_STOCK', stockPayload, {
          source: 'admin.inventory.adjustment',
          relatedEntityType: 'Product',
          relatedEntityId: result.product.id,
          createdBy: performedBy,
        });

        await prisma.posWriteCommand.update({
          where: { id: result.auditLog.id },
          data: {
            resultSummary: {
              auditOnly: true,
              posWriteQueued: true,
              posCommandId: posCommand.id,
            },
          },
        });
      } catch (queueErr) {
        await prisma.posWriteCommand.update({
          where: { id: result.auditLog.id },
          data: {
            resultSummary: {
              auditOnly: true,
              posWriteQueued: false,
              posWriteError: queueErr.message,
            },
          },
        });
      }
    } else {
      await prisma.posWriteCommand.update({
        where: { id: result.auditLog.id },
        data: {
          resultSummary: {
            auditOnly: true,
            posWriteQueued: false,
            note: 'Positive adjustments are recorded locally only. Website GRN/stock-in is intentionally not implemented in this phase.',
          },
        },
      });
    }

    try {
      const { emitProductUpdate } = require('../utils/socket');
      emitProductUpdate(result.product);
    } catch (socketErr) {
      console.warn('[INVENTORY ADJUSTMENT] Could not emit socket event:', socketErr.message);
    }

    if (result.product.stock <= 10) {
      await notifyLowStock(result.product);
    }

    return res.status(200).json({
      success: true,
      message: 'Inventory adjustment applied successfully',
      adjustment: {
        productCode: result.product.sourceCode,
        locationCode,
        adjustmentQty: parsedAdjustmentQty,
        reason,
        notes,
        performedBy,
        timestamp: timestamp.toISOString(),
        previousStock: result.previousStock,
        newStock: result.newStock,
        auditLogId: result.auditLog.id,
        posWriteCommandId: posCommand?.id || null,
      },
    });
  } catch (err) {
    if (err.message === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({ error: 'POS-linked product not found for productCode' });
    }

    if (err.message === 'NEGATIVE_STOCK_NOT_ALLOWED') {
      return res.status(400).json({ error: 'Adjustment would make stock negative' });
    }

    console.error('[INVENTORY ADJUSTMENT] failed:', err.message);
    return res.status(500).json({
      error: 'Failed to apply inventory adjustment',
      details: err.message,
    });
  }
};

const getInventoryAdjustmentAudit = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number.parseInt(req.query.limit, 10) || 50));

    const rows = await prisma.posWriteCommand.findMany({
      where: {
        source: ADMIN_INVENTORY_ADJUSTMENT_AUDIT_SOURCE,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    const adjustments = rows.map((row) => ({
      id: row.id,
      productCode: row.payload?.productCode || null,
      locationCode: row.payload?.locationCode || null,
      adjustmentQty: row.payload?.adjustmentQty || 0,
      previousStock: row.payload?.previousStock ?? null,
      newStock: row.payload?.newStock ?? null,
      reason: row.payload?.reason || null,
      notes: row.payload?.notes || '',
      performedBy: row.payload?.performedBy || row.createdBy || null,
      timestamp: row.payload?.timestamp || row.createdAt,
      audit: row.resultSummary || {},
    }));

    return res.status(200).json({
      success: true,
      adjustments,
      meta: {
        limit,
        count: adjustments.length,
        writeModel: 'sales decrement remains webhook-driven; website GRN receiving is disabled in this phase',
      },
    });
  } catch (err) {
    console.error('[INVENTORY ADJUSTMENT AUDIT] failed:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch inventory adjustment audit log',
      details: err.message,
    });
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

    const { products } = req.body;

    if (!products || !Array.isArray(products)) {
      console.error('[POS AGENT PUSH] Invalid products format');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid products format. Expected array.' 
      });
    }

    console.log(`[POS AGENT PUSH] Received ${products.length} products from POS Agent`);

    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const product of products) {
      try {
        // Validate required fields
        if (!product.sourceCode || !product.name) {
          skipped++;
          errors.push(`Missing required fields for product: ${JSON.stringify(product)}`);
          continue;
        }

        const normalizedBatches = Array.isArray(product.expiryBatches)
          ? product.expiryBatches
              .map((batch) => {
                const expiryDate = batch?.expiryDate ? new Date(batch.expiryDate) : null;
                const remainingQty = Number(batch?.remainingQty ?? batch?.RemainingQty ?? 0);
                const stockDetailId = batch?.stockDetailId ? String(batch.stockDetailId).trim() : null;
                const grnNo = batch?.grnNo ? String(batch.grnNo).trim() : null;
                if (!expiryDate || Number.isNaN(expiryDate.getTime())) return null;
                if (expiryDate.toISOString().slice(0, 10) === '1900-01-01') return null;
                if (expiryDate < MIN_VALID_EXPIRY_DATE) return null;
                if (!Number.isFinite(remainingQty) || remainingQty <= 0) return null;

                return {
                  productCode: String(product.sourceCode).trim(),
                  expiryDate,
                  remainingQty,
                  locationCode: batch?.locationCode || process.env.POS_LOCATION_CODE || 'SH',
                  batchNo: encodeExpiryBatchReference(stockDetailId, grnNo, batch?.batchNo),
                  lastSyncedAt: new Date(),
                };
              })
              .filter(Boolean)
          : [];

        const nearestBatch = normalizedBatches
          .slice()
          .sort((a, b) => a.expiryDate - b.expiryDate)[0] || null;

        const normalizedStock = Math.max(0, Number(product.stock || 0));

        const nearestExpiryDate = product.nearestExpiryDate
          ? new Date(product.nearestExpiryDate)
          : (product.expiryDate ? new Date(product.expiryDate) : (nearestBatch ? nearestBatch.expiryDate : null));

        // Upsert product into Product table (single source of truth)
        const result = await prisma.product.upsert(
          {
            where: { sourceCode: product.sourceCode },
            update: {
              name: product.name,
              price: product.price || 0,
              stock: normalizedStock,
              category: product.category || 'Uncategorized',
              description: product.description || '',
              barcode: product.barcode || '',
              expiryDate: nearestExpiryDate,
              expiryBatchCount: normalizedBatches.length,
              updatedAt: new Date(),
            },
            create: {
              sourceCode: product.sourceCode,
              name: product.name,
              price: product.price || 0,
              stock: normalizedStock,
              category: product.category || 'Uncategorized',
              description: product.description || '',
              barcode: product.barcode || '',
              expiryDate: nearestExpiryDate,
              expiryBatchCount: normalizedBatches.length,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

        await prisma.productExpiryBatch.deleteMany({
          where: {
            productCode: String(product.sourceCode).trim(),
          },
        });

        if (normalizedBatches.length > 0) {
          await prisma.productExpiryBatch.createMany({
            data: normalizedBatches,
            skipDuplicates: true,
          });
        }

        synced++;
        
        // Fetch the complete product with all fields for frontend
        const completeProduct = await prisma.product.findUnique({
          where: { id: result.id }
        });
        
        // Emit real-time update for this specific product (for instant frontend updates)
        if (global.io && completeProduct) {
          try {
            console.log(`[POS AGENT PUSH] 📡 Emitting real-time update for: ${completeProduct.name}`);
            global.io.emit('pos-product-updated', {
              id: completeProduct.id,
              sourceCode: completeProduct.sourceCode,
              name: completeProduct.name,
              price: completeProduct.price,
              stock: completeProduct.stock,
              category: completeProduct.category,
            });
          } catch (ioErr) {
            console.warn('[POS AGENT PUSH] Socket emit failed:', ioErr.message);
          }
        }
        
        console.log(`[POS AGENT PUSH] ✅ Synced product: ${product.name} (${product.sourceCode})`);
      } catch (error) {
        skipped++;
        const errorMsg = `Failed to sync product ${product.sourceCode}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`[POS AGENT PUSH] ❌ ${errorMsg}`);
      }
    }

    // Emit real-time update to all connected clients
    if (synced > 0 && global.io) {
      try {
        global.io.emit('pos-products-synced', {
          synced,
          skipped,
          total: products.length,
          timestamp: new Date().toISOString(),
        });
        console.log(`[POS AGENT PUSH] 🔄 Emitted real-time update to ${synced} synced products`);
      } catch (ioErr) {
        console.warn('[POS AGENT PUSH] Could not emit socket event:', ioErr.message);
      }
    }

    console.log(`[POS AGENT PUSH] Sync complete - Synced: ${synced}, Skipped: ${skipped}`);

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
    // Get all distinct categories from Product table (single source of truth)
    const categories = await prisma.product.findMany({
      where: {
        category: {
          not: null
        },
        enabled: true,
        isActive: true
      },
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
    const products = productCodes.length > 0
      ? await prisma.product.findMany({
          where: { sourceCode: { in: productCodes } },
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

module.exports = { 
  createProduct, 
  getProducts, 
  getProductById, 
  updateProduct, 
  adjustInventoryStock,
  getInventoryAdjustmentAudit,
  deleteProduct, 
  syncFromPOS,
  syncProductsFromPOSAgent,
  getExpiryBatchAlerts,
  deletePOSProducts,
  getCategories,
  toggleProductVisibility
};
