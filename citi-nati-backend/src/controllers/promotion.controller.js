/**
 * 🎯 PROMOTIONS CONTROLLER
 * Handles promotion management for:
 * 1. Global promotions (all products)
 * 2. Category-based promotions
 * 3. Selective product promotions
 */

const { PrismaClient } = require('@prisma/client');
const posCommandQueueService = require('../services/posCommandQueue.service');
const prisma = new PrismaClient();

const POS_DEFAULT_LOCATION_CODE = process.env.POS_LOCATION_CODE || 'SH';
const POS_DEFAULT_PRICE_TYPE_CODE = process.env.POS_PRICE_TYPE_CODE || 'RT';
const POS_PROMO_REASON_CODE = 'WEBSITE_SELECTIVE_PROMO';

const ACTIVE_PRODUCT_FILTER = {
  isActive: true,
  enabled: true,
  hideFromProductsPage: false,
};

function parseProductIds(ids = []) {
  return ids
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function getPromotionProductWhere(type, categoryId, selectedProducts) {
  if (type === 'global') {
    return { ...ACTIVE_PRODUCT_FILTER };
  }

  if (type === 'category') {
    return {
      ...ACTIVE_PRODUCT_FILTER,
      category: categoryId,
    };
  }

  const parsedIds = parseProductIds(selectedProducts);
  return {
    ...ACTIVE_PRODUCT_FILTER,
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

async function queueSelectivePosPromotionCommands({
  enabled,
  percentage,
  selectedProductIds,
  previousSelectedProductIds,
  actor,
}) {
  const targetIds = enabled
    ? parseProductIds(selectedProductIds || [])
    : parseProductIds(previousSelectedProductIds || selectedProductIds || []);

  if (targetIds.length === 0) {
    console.log('[PROMO][POS QUEUE] No selective products available for POS command queue');
    return { enqueued: 0, skippedNoSourceCode: 0, skippedInvalidPrice: 0, targetCount: 0 };
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: targetIds },
    },
    select: {
      id: true,
      sourceCode: true,
      price: true,
      originalPrice: true,
    },
  });

  let enqueued = 0;
  let skippedNoSourceCode = 0;
  let skippedInvalidPrice = 0;

  for (const product of products) {
    if (!product.sourceCode) {
      skippedNoSourceCode++;
      continue;
    }

    if (enabled) {
      const promotionalPrice = getPromotionalPrice(product, percentage);

      if (!Number.isFinite(promotionalPrice) || promotionalPrice <= 0) {
        skippedInvalidPrice++;
        continue;
      }

      await posCommandQueueService.enqueueCommand('APPLY_PROMOTION', {
        productCode: product.sourceCode,
        promotionalPrice,
        locationCode: POS_DEFAULT_LOCATION_CODE,
        priceTypeCode: POS_DEFAULT_PRICE_TYPE_CODE,
        reasonCode: POS_PROMO_REASON_CODE,
        updatePromotionalFlag: false,
      }, {
        source: 'admin.promotions.updatePromotion.selective.apply',
        relatedEntityType: 'POS_PRODUCT',
        relatedEntityId: product.sourceCode,
        createdBy: actor,
      });
    } else {
      const restorePrice = roundPrice(getBaseProductPrice(product));

      if (!Number.isFinite(restorePrice) || restorePrice <= 0) {
        skippedInvalidPrice++;
        continue;
      }

      await posCommandQueueService.enqueueCommand('REVERT_PROMOTION', {
        productCode: product.sourceCode,
        restorePrice,
        locationCode: POS_DEFAULT_LOCATION_CODE,
        priceTypeCode: POS_DEFAULT_PRICE_TYPE_CODE,
        reasonCode: POS_PROMO_REASON_CODE,
        updatePromotionalFlag: false,
      }, {
        source: 'admin.promotions.updatePromotion.selective.revert',
        relatedEntityType: 'POS_PRODUCT',
        relatedEntityId: product.sourceCode,
        createdBy: actor,
      });
    }

    enqueued++;
  }

  return {
    enqueued,
    skippedNoSourceCode,
    skippedInvalidPrice,
    targetCount: targetIds.length,
  };
}

/**
 * Emit promotion update to all connected clients (both admin and users) via Socket.io
 */
const emitPromotionUpdate = (promotion) => {
  try {
    if (global.io) {
      // Broadcast to everyone - both admins and users seeing products page need to know
      global.io.emit('promotionUpdated', promotion);
      console.log(`[Socket.io] Promotion updated: ${promotion.type} - emitted to all clients`);
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
    const promotions = await prisma.promotion.findMany();
    
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

/**
 * Activate or deactivate a promotion and apply it
 */
const updatePromotion = async (req, res) => {
  try {
    const { type } = req.params;
    const { enabled, percentage, categoryId, selectedProducts } = req.body;
    const parsedSelectedProducts = parseProductIds(selectedProducts || []);
    const actor = req.user?.email || String(req.user?.userId || req.user?.id || 'admin');

    const previousPromotion = await prisma.promotion.findUnique({
      where: { type },
      select: {
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
    }

    // First, reset all products (remove promotional pricing) if disabling
    if (!enabled) {
      await prisma.product.updateMany({
        where: ACTIVE_PRODUCT_FILTER,
        data: {
          discountPrice: null,
          isOnSale: false,
        }
      });
    }

    // Update or create promotion in database
    const promotionData = {
      type,
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

    console.log('[Promotions] Upserting promotion:', { type, enabled, percentage, selectedProductIds: promotionData.selectedProductIds });

    const promotion = await prisma.promotion.upsert({
      where: { type },
      update: promotionData,
      create: promotionData,
    });

    console.log('[Promotions] Promotion upserted:', promotion);

    // Apply promotions if enabled
    if (enabled) {
      let productsToUpdate = [];

      if (type === 'global') {
        productsToUpdate = await prisma.product.findMany({
          where: getPromotionProductWhere('global', null, []),
        });
      } else if (type === 'category') {
        productsToUpdate = await prisma.product.findMany({
          where: getPromotionProductWhere('category', categoryId, []),
        });
      } else if (type === 'selective') {
        if (parsedSelectedProducts.length > 0) {
          productsToUpdate = await prisma.product.findMany({
            where: getPromotionProductWhere('selective', null, parsedSelectedProducts),
          });
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
    if (type === 'selective') {
      posQueueSummary = await queueSelectivePosPromotionCommands({
        enabled: promotion.enabled,
        percentage: promotion.percentage,
        selectedProductIds: promotion.selectedProductIds || [],
        previousSelectedProductIds: previousPromotion?.selectedProductIds || [],
        actor,
      });

      console.log('[PROMO][POS QUEUE] selective promotion bridge summary:', {
        type,
        enabled: promotion.enabled,
        ...posQueueSummary,
      });
    }
    
    try {
      emitPromotionUpdate(promotionResponse);
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
        where: getPromotionProductWhere('global', null, []),
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
        where: getPromotionProductWhere('category', categoryId, []),
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
        where: getPromotionProductWhere('selective', null, parsedSelectedProducts),
      });
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
        products = await prisma.product.findMany({
          where: getPromotionProductWhere('global', null, []),
        });
      } else if (promotion.type === 'category') {
        products = await prisma.product.findMany({
          where: getPromotionProductWhere('category', promotion.categoryId, []),
        });
      } else if (promotion.type === 'selective') {
        // Use selectedProductIds from database
        const selectedIds = parseProductIds(promotion.selectedProductIds || []);
        if (selectedIds.length === 0) continue; // Skip if no products selected
        products = await prisma.product.findMany({
          where: getPromotionProductWhere('selective', null, selectedIds),
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
    // Disable all promotions
    await prisma.promotion.updateMany({
      data: { enabled: false }
    });

    // Reset all product discount prices
    await prisma.product.updateMany({
      where: ACTIVE_PRODUCT_FILTER,
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
