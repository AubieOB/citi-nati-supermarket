const { PrismaClient } = require('@prisma/client');
const { computeExpiryStatus, suggestDiscount } = require('../utils/expiryStatus');
const { notifyLowStock } = require('../utils/messageService');

const prisma = new PrismaClient();

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

  const formatted = {
    ...product,
    imageUrl: product.image
      ? `${req.protocol}://${req.get('host')}/${product.image}`
      : null,
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

    // Prepare product data
    const productData = {
      name: name.trim(),
      price: parsedPrice,
      stock: parsedStock,
      category: category.trim(),
      image: req.file ? req.file.path.replace(/\\/g, '/') : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null
    };

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
    console.error('Error creating product:', err);
    return res.status(500).json({
      error: 'Server error while creating product',
    });
  }
};

const getProducts = async (req, res) => {
  try {
    // Extract query parameters for filtering
    const { search, category, onSale } = req.query;

    // Build where clause for filtering
    const where = {};

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

    // Fetch products with filters, ordered by createdAt descending
    const products = await prisma.product.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Map over products and format with computed fields
    const productsWithFormatted = products.map((product) =>
      formatProduct(product, req, false)
    );

    return res.status(200).json({
      products: productsWithFormatted,
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    return res.status(500).json({
      error: 'Server error while fetching products',
    });
  }
};

const getProductById = async (req, res) => {
  try {
    // Extract and convert id to integer
    const id = parseInt(req.params.id);

    // Fetch product by id
    const product = await prisma.product.findUnique({
      where: { id },
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
    if (req.file) {
      updateData.image = req.file.path.replace(/\\/g, '/');
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

    // Notify if stock was updated and is now low (10 or below) or out of stock
    if (updateData.stock !== undefined && updatedProduct.stock <= 10) {
      await notifyLowStock(updatedProduct);
    }

    // Format product with computed fields
    const formattedProduct = formatProduct(updatedProduct, req, true);

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

module.exports = { createProduct, getProducts, getProductById, updateProduct, deleteProduct };
