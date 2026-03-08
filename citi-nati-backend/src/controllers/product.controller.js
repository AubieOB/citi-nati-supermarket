const { PrismaClient } = require('@prisma/client');
const { computeExpiryStatus, suggestDiscount } = require('../utils/expiryStatus');
const { notifyLowStock } = require('../utils/messageService');

const prisma = new PrismaClient();

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
  const expiryStatus = computeExpiryStatus(product.expiryDate);
  
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
    if (originalPrice) {
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
      hasImage: !!product.image
    });

    // Notify if stock is low (10 or below) or out of stock
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
    // Extract query parameters for filtering and pagination
    // Support both offset-based (offset, limit) and page-based (page, pageSize) for backwards compatibility
    const { search, category, onSale, page, pageSize, offset, limit } = req.query;

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

    // Map over products and format with computed fields
    const productsWithFormatted = products.map((product) =>
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

    if (req.body.name !== undefined && req.body.name !== '') {
      updateData.name = req.body.name;
    }
    if (req.body.price !== undefined && req.body.price !== '') {
      const parsedPrice = parseFloat(req.body.price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Invalid price value' });
      }
      updateData.price = parsedPrice;
    }
    if (req.body.stock !== undefined && req.body.stock !== '') {
      const parsedStock = parseInt(req.body.stock, 10);
      if (isNaN(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ error: 'Invalid stock value' });
      }
      updateData.stock = parsedStock;
    }
    if (req.body.category !== undefined && req.body.category !== '') {
      updateData.category = req.body.category;
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
    } else {
      console.log('[PRODUCT UPDATE] ⚠️ No image file in request (optional)');
    }

    // Handle expiryDate
    if (req.body.expiryDate !== undefined) {
      updateData.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
    }

    // Handle originalPrice
    if (req.body.originalPrice !== undefined) {
      if (req.body.originalPrice === '' || req.body.originalPrice === null) {
        updateData.originalPrice = null;
      } else {
        const parsedOriginalPrice = parseFloat(req.body.originalPrice);
        if (!isNaN(parsedOriginalPrice) && parsedOriginalPrice >= 0) {
          updateData.originalPrice = parsedOriginalPrice;
        }
      }
    }

    // Handle discountPrice and isOnSale
    if (req.body.discountPrice !== undefined) {
      if (req.body.discountPrice === '' || req.body.discountPrice === null) {
        updateData.discountPrice = null;
        updateData.isOnSale = false;
      } else {
        const parsedDiscountPrice = parseFloat(req.body.discountPrice);
        if (!isNaN(parsedDiscountPrice) && parsedDiscountPrice >= 0) {
          updateData.discountPrice = parsedDiscountPrice;
          updateData.isOnSale = true;
        }
      }
    }

    // Handle explicit isOnSale toggle (only if discountPrice is already set)
    if (req.body.isOnSale !== undefined && updateData.discountPrice) {
      updateData.isOnSale = req.body.isOnSale === true || req.body.isOnSale === 'true';
    }

    // Update product in database
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    // Debug: Log what was actually saved to database
    console.log('[PRODUCT UPDATE] ✅ Product updated in database:', {
      id: updatedProduct.id,
      name: updatedProduct.name,
      imageSavedToDB: updatedProduct.image,
      imageIsCloudinary: updatedProduct.image?.startsWith('http'),
      updatedFields: Object.keys(updateData)
    });

    // Notify if stock was updated and is now low (10 or below) or out of stock
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
