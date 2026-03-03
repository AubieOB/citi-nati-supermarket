/**
 * 🎯 PROMOTIONS CONTROLLER
 * Handles promotion management for:
 * 1. Global promotions (all products)
 * 2. Category-based promotions
 * 3. Random product promotions
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get current promotions
 */
const getCurrentPromotions = async (req, res) => {
  try {
    const promotions = await prisma.promotion.findMany();
    
    // Format promotions by type
    const formattedPromotions = {
      global: promotions.find(p => p.type === 'global') || { enabled: false, percentage: 10, type: 'global' },
      category: promotions.find(p => p.type === 'category') || { enabled: false, percentage: 10, type: 'category', categoryId: null },
      random: promotions.find(p => p.type === 'random') || { enabled: false, percentage: 10, type: 'random', productCount: 5 },
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

/**
 * Activate or deactivate a promotion
 */
const updatePromotion = async (req, res) => {
  try {
    const { type } = req.params;
    const { enabled, percentage, categoryId, productCount } = req.body;

    // Validate promotion type
    if (!['global', 'category', 'random'].includes(type)) {
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

    // Deactivate other promotions if enabling this one (optional: only one at a time)
    // Uncomment below if you want only one active promotion at a time
    // if (enabled) {
    //   await prisma.promotion.updateMany({
    //     where: { type: { not: type } },
    //     data: { enabled: false }
    //   });
    // }

    // Update or create promotion
    const promotion = await prisma.promotion.upsert({
      where: { type },
      update: {
        enabled,
        percentage: parseInt(percentage) || 10,
        categoryId: type === 'category' ? categoryId : null,
        productCount: type === 'random' ? parseInt(productCount) || 5 : null,
        updatedAt: new Date(),
      },
      create: {
        type,
        enabled,
        percentage: parseInt(percentage) || 10,
        categoryId: type === 'category' ? categoryId : null,
        productCount: type === 'random' ? parseInt(productCount) || 5 : null,
      },
    });

    // Log promotion change
    console.log(`[Promotions] ${type} promotion ${enabled ? 'activated' : 'deactivated'} - ${percentage}% off`);

    return res.json({
      success: true,
      promotion: {
        type: promotion.type,
        enabled: promotion.enabled,
        percentage: promotion.percentage,
        categoryId: promotion.categoryId,
        productCount: promotion.productCount,
      },
    });
  } catch (err) {
    console.error('Error updating promotion:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update promotion'
    });
  }
};

/**
 * Preview products matching promotion criteria
 */
const previewPromotion = async (req, res) => {
  try {
    const { type } = req.params;
    const { percentage, categoryId, productCount } = req.body;

    let products = [];

    if (type === 'global') {
      // Get all products
      products = await prisma.product.findMany();
    } else if (type === 'category') {
      // Get products in specific category
      if (!categoryId) {
        return res.status(400).json({
          success: false,
          error: 'Category must be specified'
        });
      }
      products = await prisma.product.findMany({
        where: { category: categoryId }
      });
    } else if (type === 'random') {
      // Get random products
      const allProducts = await prisma.product.findMany();
      products = allProducts.sort(() => Math.random() - 0.5).slice(0, productCount || 5);
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
    const promotions = await prisma.promotion.findMany({
      where: { enabled: true }
    });

    let updatedCount = 0;

    for (const promotion of promotions) {
      let products = [];

      if (promotion.type === 'global') {
        products = await prisma.product.findMany();
      } else if (promotion.type === 'category') {
        products = await prisma.product.findMany({
          where: { category: promotion.categoryId }
        });
      } else if (promotion.type === 'random') {
        const allProducts = await prisma.product.findMany();
        products = allProducts.sort(() => Math.random() - 0.5).slice(0, promotion.productCount || 5);
      }

      // Update each product with discount price
      for (const product of products) {
        const discountAmount = (product.price * promotion.percentage) / 100;
        const discountedPrice = product.price - discountAmount;

        await prisma.product.update({
          where: { id: product.id },
          data: {
            discountPrice: discountedPrice,
            isOnSale: true,
            updatedAt: new Date(),
          },
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
    // Disable all promotions
    await prisma.promotion.updateMany({
      data: { enabled: false }
    });

    // Reset all product discount prices
    await prisma.product.updateMany({
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
  updatePromotion,
  previewPromotion,
  applyPromotion,
  removePromotion,
};
