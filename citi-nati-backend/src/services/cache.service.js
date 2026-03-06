/**
 * 📦 WEBSITE CACHE SERVICE
 * 
 * Manages the WebsiteProductsCache table.
 * This is the single source of truth for website product data.
 * 
 * The cache layer ensures:
 * - Website reads from cache only (fast queries)
 * - POS sync updates cache (single-point update)
 * - Product visibility control (admin feature)
 * - No direct access to POS tables
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Upsert a single product into the cache
 * Called by POS Sync Agent
 * 
 * @param {Object} product - Product data from POS
 * @returns {Promise<Object>} Upserted cache entry
 */
async function upsertProductCache(product) {
  try {
    const cached = await prisma.websiteProductsCache.upsert({
      where: { ProductCode: product.ProductCode },
      update: {
        ProductName: product.ProductName,
        Category: product.Category || null,
        Barcode: product.Barcode || null,
        Price: product.Price || 0,
        Stock: product.Stock || 0,
        LastUpdated: new Date(),
      },
      create: {
        ProductCode: product.ProductCode,
        ProductName: product.ProductName,
        Category: product.Category || null,
        Barcode: product.Barcode || null,
        Price: product.Price || 0,
        Stock: product.Stock || 0,
        Enabled: true,
        LastUpdated: new Date(),
      },
    });

    return cached;
  } catch (error) {
    console.error(`[CACHE] Error upserting product ${product.ProductCode}:`, error.message);
    throw error;
  }
}

/**
 * Upsert multiple products into cache
 * Called by POS Sync Agent for batch updates
 * 
 * @param {Array} products - Array of product data
 * @returns {Promise<Object>} Result with counts
 */
async function upsertProductsCacheBatch(products) {
  try {
    console.log(`[CACHE] Upserting ${products.length} products into cache...`);

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const product of products) {
      try {
        await upsertProductCache(product);
        synced++;
      } catch (error) {
        failed++;
        errors.push(`Product ${product.ProductCode}: ${error.message}`);
      }
    }

    console.log(`[CACHE] Batch upsert complete - Synced: ${synced}, Failed: ${failed}`);

    return {
      success: true,
      synced,
      failed,
      total: products.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('[CACHE] Batch upsert error:', error.message);
    throw error;
  }
}

/**
 * Update product stock in cache
 * Called when stock changes from POS
 * 
 * @param {string} productCode - Product code
 * @param {number} stock - New stock quantity
 * @returns {Promise<Object>} Updated cache entry
 */
async function updateProductStock(productCode, stock) {
  try {
    const updated = await prisma.websiteProductsCache.update({
      where: { ProductCode: productCode },
      data: {
        Stock: stock,
        LastUpdated: new Date(),
      },
    });

    return updated;
  } catch (error) {
    console.error(`[CACHE] Error updating stock for ${productCode}:`, error.message);
    throw error;
  }
}

/**
 * Update product price in cache
 * Called when price changes from POS
 * 
 * @param {string} productCode - Product code
 * @param {number} price - New price
 * @returns {Promise<Object>} Updated cache entry
 */
async function updateProductPrice(productCode, price) {
  try {
    const updated = await prisma.websiteProductsCache.update({
      where: { ProductCode: productCode },
      data: {
        Price: price,
        LastUpdated: new Date(),
      },
    });

    return updated;
  } catch (error) {
    console.error(`[CACHE] Error updating price for ${productCode}:`, error.message);
    throw error;
  }
}

/**
 * Set product visibility
 * Admin only - controls whether product appears on website
 * 
 * @param {string} productCode - Product code
 * @param {boolean} enabled - Visibility state
 * @returns {Promise<Object>} Updated cache entry
 */
async function setProductVisibility(productCode, enabled) {
  try {
    const updated = await prisma.websiteProductsCache.update({
      where: { ProductCode: productCode },
      data: {
        Enabled: enabled,
        LastUpdated: new Date(),
      },
    });

    console.log(`[CACHE] Product ${productCode} visibility set to ${enabled}`);
    return updated;
  } catch (error) {
    console.error(`[CACHE] Error setting visibility for ${productCode}:`, error.message);
    throw error;
  }
}

/**
 * Get paginated products from cache
 * Website reads only from cache
 * 
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @param {string} category - Optional category filter
 * @returns {Promise<Object>} Paginated products with metadata
 */
async function getPaginatedProducts(page = 1, limit = 50, category = null) {
  try {
    // Validate inputs
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {
      Enabled: true, // Only return enabled products
    };

    if (category) {
      where.Category = category;
    }

    // Get total count
    const total = await prisma.websiteProductsCache.count({ where });

    // Get paginated products
    const products = await prisma.websiteProductsCache.findMany({
      where,
      skip: offset,
      take: limitNum,
      orderBy: {
        ProductName: 'asc',
      },
    });

    const hasNextPage = offset + limitNum < total;
    const hasPrevPage = pageNum > 1;
    const totalPages = Math.ceil(total / limitNum);

    return {
      products,
      pagination: {
        currentPage: pageNum,
        pageSize: limitNum,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    };
  } catch (error) {
    console.error('[CACHE] Error fetching paginated products:', error.message);
    throw error;
  }
}

/**
 * Get all distinct categories from cache
 * Used for filter dropdowns
 * 
 * @returns {Promise<Array>} Array of category strings
 */
async function getCategories() {
  try {
    const results = await prisma.websiteProductsCache.findMany({
      where: {
        Enabled: true,
        Category: {
          not: null,
        },
      },
      distinct: ['Category'],
      select: {
        Category: true,
      },
      orderBy: {
        Category: 'asc',
      },
    });

    const categories = results
      .map(r => r.Category)
      .filter(c => c && c.trim() !== '');

    console.log(`[CACHE] Retrieved ${categories.length} unique categories`);
    return categories;
  } catch (error) {
    console.error('[CACHE] Error fetching categories:', error.message);
    throw error;
  }
}

/**
 * Get a single product by code
 * 
 * @param {string} productCode - Product code
 * @returns {Promise<Object>} Product object or null
 */
async function getProductByCode(productCode) {
  try {
    const product = await prisma.websiteProductsCache.findUnique({
      where: { ProductCode: productCode },
    });

    return product;
  } catch (error) {
    console.error(`[CACHE] Error fetching product ${productCode}:`, error.message);
    throw error;
  }
}

/**
 * Clear entire cache (for testing/admin purposes)
 * 
 * @returns {Promise<Object>} Result with count of deleted entries
 */
async function clearCache() {
  try {
    const result = await prisma.websiteProductsCache.deleteMany({});
    console.log(`[CACHE] Cleared ${result.count} entries from cache`);
    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error('[CACHE] Error clearing cache:', error.message);
    throw error;
  }
}

/**
 * Get cache statistics
 * 
 * @returns {Promise<Object>} Cache stats
 */
async function getCacheStats() {
  try {
    const total = await prisma.websiteProductsCache.count();
    const enabled = await prisma.websiteProductsCache.count({
      where: { Enabled: true },
    });
    const disabled = total - enabled;

    const categories = await prisma.websiteProductsCache.findMany({
      where: { Enabled: true },
      distinct: ['Category'],
      select: { Category: true },
    });

    return {
      total,
      enabled,
      disabled,
      categories: categories.map(c => c.Category).filter(c => c),
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.error('[CACHE] Error getting stats:', error.message);
    throw error;
  }
}

module.exports = {
  upsertProductCache,
  upsertProductsCacheBatch,
  updateProductStock,
  updateProductPrice,
  setProductVisibility,
  getPaginatedProducts,
  getCategories,
  getProductByCode,
  clearCache,
  getCacheStats,
};
