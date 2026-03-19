const { PrismaClient } = require('@prisma/client');
const { computeExpiryStatus, suggestDiscount } = require('../utils/expiryStatus');
const { notifyLowStock } = require('../utils/messageService');
const posCommandQueueService = require('../services/posCommandQueue.service');
const posSyncService = require('../services/posSync.service');

const prisma = new PrismaClient();
const MIN_VALID_EXPIRY_DATE = new Date('2000-01-01T00:00:00.000Z');
const ADMIN_EXPIRY_REQUEST_TIMEOUT_MS = 800;
const ADMIN_EXPIRY_CACHE_TTL_MS = 5 * 60 * 1000;
const ADMIN_EXPIRY_FAILURE_COOLDOWN_MS = 60 * 1000;

const adminExpiryFetchState = {
  rows: [],
  fetchedAt: 0,
  lastFailureAt: 0,
  lastFailureReason: null,
};

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

function normalizeProductCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
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
      const remainingQty = Number(row.RemainingQty ?? row.remainingQty ?? row.quantity ?? row.Quantity ?? 0);

      return {
        normalizedDate,
        remainingQty,
      };
    })
    .filter((row) => row.normalizedDate && Number.isFinite(row.remainingQty) && row.remainingQty > 0);

  if (normalizedRows.length === 0) {
    return null;
  }

  const today = getStartOfToday();
  const upcomingRows = normalizedRows
    .filter((row) => row.normalizedDate >= today)
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

  console.log('[ADMIN PRODUCTS] merge key used', 'product.sourceCode -> expiry.ProductCode (normalized trim+uppercase)');

  const now = Date.now();
  const hasFreshCache = adminExpiryFetchState.fetchedAt > 0 && (now - adminExpiryFetchState.fetchedAt) < ADMIN_EXPIRY_CACHE_TTL_MS;
  const inFailureCooldown = adminExpiryFetchState.lastFailureAt > 0
    && (now - adminExpiryFetchState.lastFailureAt) < ADMIN_EXPIRY_FAILURE_COOLDOWN_MS;

  let expiryRows = [];

  if (inFailureCooldown) {
    console.warn('[ADMIN PRODUCTS] expiry fetch skipped (cooldown active)', {
      cooldownMsRemaining: ADMIN_EXPIRY_FAILURE_COOLDOWN_MS - (now - adminExpiryFetchState.lastFailureAt),
      lastFailureReason: adminExpiryFetchState.lastFailureReason,
    });
    if (hasFreshCache || adminExpiryFetchState.rows.length > 0) {
      expiryRows = adminExpiryFetchState.rows;
      console.log('[ADMIN PRODUCTS] using cached expiry rows', expiryRows.length);
    }
    console.log('[ADMIN PRODUCTS] expiry rows fetched count', expiryRows.length);
    console.log('[ADMIN PRODUCTS] first expiry row', expiryRows[0] || null);
  }

  if (!inFailureCooldown) {

    console.log('[ADMIN PRODUCTS] calling POS expiry endpoint', {
      endpoint: '/pos-sync/expiry-products',
      targetUrl: `${process.env.POS_AGENT_URL || 'http://localhost:3001'}/pos-sync/expiry-products`,
      source: 'view',
      includeExpired: true,
      requestTimeoutMs: ADMIN_EXPIRY_REQUEST_TIMEOUT_MS,
    });

    const expiryResult = await posSyncService.getExpiryProductsFromPOS({
      days: 3650,
      locationCode: process.env.POS_LOCATION_CODE || 'SH',
      includeExpired: true,
      source: 'view',
      requestTimeoutMs: ADMIN_EXPIRY_REQUEST_TIMEOUT_MS,
    });

    if (!expiryResult.success) {
      adminExpiryFetchState.lastFailureAt = Date.now();
      adminExpiryFetchState.lastFailureReason = expiryResult.error;
      console.warn('[ADMIN PRODUCTS] expiry fetch failed', {
        error: expiryResult.error,
        status: expiryResult.meta?.status || null,
        rawBody: expiryResult.meta?.rawBody || null,
        targetUrl: expiryResult.meta?.targetUrl || null,
      });
      if (hasFreshCache || adminExpiryFetchState.rows.length > 0) {
        expiryRows = adminExpiryFetchState.rows;
        console.log('[ADMIN PRODUCTS] using cached expiry rows', expiryRows.length);
      }
    } else {
      expiryRows = Array.isArray(expiryResult.data?.data) ? expiryResult.data.data : [];
      console.log('[ADMIN PRODUCTS] POS expiry response status', expiryResult.meta?.status || 200);
      console.log('[ADMIN PRODUCTS] POS expiry rows count', expiryRows.length);
      adminExpiryFetchState.rows = expiryRows;
      adminExpiryFetchState.fetchedAt = Date.now();
      adminExpiryFetchState.lastFailureAt = 0;
      adminExpiryFetchState.lastFailureReason = null;
    }

    console.log('[ADMIN PRODUCTS] expiry rows fetched count', expiryRows.length);
    console.log('[ADMIN PRODUCTS] first expiry row', expiryRows[0] || null);
  }

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
    const mergedFields = createMergedExpiryFields(preferredExpiryDate, 'pos');

    if (mergedFields) {
      expiryMap.set(productCode, mergedFields);
    }
  }

  const firstExpiryMapKeys = Array.from(expiryMap.keys()).slice(0, 5);
  const firstProductKeys = Array.from(productCodeSet.values()).slice(0, 5);
  console.log('[ADMIN PRODUCTS] expiry map size', expiryMap.size);
  console.log('[ADMIN PRODUCTS] first 5 expiry map keys', firstExpiryMapKeys);
  console.log('[ADMIN PRODUCTS] first 5 product sourceCode keys', firstProductKeys);

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
  console.log('[ADMIN PRODUCTS] merged products with expiry count', mergedWithExpiryCount);
  console.log('[ADMIN PRODUCTS] sample merged row with expiry', mergedProducts[0] || null);

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
    const shouldIncludePosExpiry = String(includePosExpiry || '').trim().toLowerCase() === 'true';

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

    let enrichedProducts = products;
    if (shouldIncludePosExpiry) {
      console.log('[ADMIN PRODUCTS] expiry enrichment branch entered');
      try {
        enrichedProducts = await enrichProductsWithExpiry(products);
        console.log('[ADMIN PRODUCTS] merged products count', enrichedProducts.length);
        console.log('[ADMIN PRODUCTS] sample merged row', enrichedProducts[0] ? {
          id: enrichedProducts[0].id,
          name: enrichedProducts[0].name,
          sourceCode: enrichedProducts[0].sourceCode,
          expiryDate: enrichedProducts[0].expiryDate,
          expiryStatus: enrichedProducts[0].expiryStatus,
          daysToExpiry: enrichedProducts[0].daysToExpiry,
          expirySource: enrichedProducts[0].expirySource,
        } : null);
      } catch (expiryMergeError) {
        console.error('[ADMIN PRODUCTS] expiry enrichment failed, returning base products', expiryMergeError.message);
        enrichedProducts = products;
      }
    }

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
    const formattedProduct = formatProduct(product, req, true);

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
          locationCode: process.env.POS_LOCATION_CODE || 'SH',
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
          console.log('[POS COMMAND QUEUE] enqueue UPDATE_STOCK success:', { commandId: queuedStock.id });
        } catch (queueErr) {
          stockPosCommand.success = false;
          stockPosCommand.error = queueErr.message;
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

        // Upsert product into Product table (single source of truth)
        const result = await prisma.product.upsert(
          {
            where: { sourceCode: product.sourceCode },
            update: {
              name: product.name,
              price: product.price || 0,
              stock: product.stock || 0,
              category: product.category || 'Uncategorized',
              description: product.description || '',
              barcode: product.barcode || '',
              updatedAt: new Date(),
            },
            create: {
              sourceCode: product.sourceCode,
              name: product.name,
              price: product.price || 0,
              stock: product.stock || 0,
              category: product.category || 'Uncategorized',
              description: product.description || '',
              barcode: product.barcode || '',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

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

module.exports = { 
  createProduct, 
  getProducts, 
  getProductById, 
  updateProduct, 
  deleteProduct, 
  syncFromPOS,
  syncProductsFromPOSAgent,
  deletePOSProducts,
  getCategories,
  toggleProductVisibility
};
