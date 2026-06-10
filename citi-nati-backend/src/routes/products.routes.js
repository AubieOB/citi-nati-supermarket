const express = require('express');
const { createProduct, getProducts, getProductById, updateProduct, updateProductStockThreshold, deleteProduct, syncFromPOS, syncProductsFromPOSAgent, deletePOSProducts, getCategories, toggleProductVisibility, permanentDeleteProductImage, reconcileProductImages, getPopularProducts, recordProductInteraction } = require('../controllers/product.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const { requireTrustedAgent } = require('../middleware/agentAuth.middleware');
const uploadProductImage = require('../middlewares/uploadProductImageCloudinary');

const router = express.Router();

// GET /api/products/categories - Fetch all distinct categories
router.get('/categories', getCategories);

// GET /api/products/popular - Fetch promoted and popular storefront products
router.get('/popular', getPopularProducts);

// POST /api/products/interactions - Track lightweight storefront product interest
router.post('/interactions', recordProductInteraction);

// GET /api/products - Fetch all products (with pagination, filtering, category)
router.get('/', getProducts);

// POST /api/products - Create a new product (ADMIN only)
router.post(
  '/',
  verifyTokenMiddleware,
  verifyAdmin,
  uploadProductImage,
  createProduct
);

// GET /api/products/:id - Fetch product by id
router.get('/:id', getProductById);

// PUT /api/products/:id - Update product by id (ADMIN only)
router.put(
  '/:id',
  verifyTokenMiddleware,
  verifyAdmin,
  uploadProductImage,
  updateProduct
);

// PUT /api/products/:id/visibility - Toggle product visibility (ADMIN only)
router.put(
  '/:id/visibility',
  verifyTokenMiddleware,
  verifyAdmin,
  toggleProductVisibility
);

// PATCH /api/products/:id/stock-threshold - Update per-product low stock threshold (ADMIN only)
router.patch(
  '/:id/stock-threshold',
  verifyTokenMiddleware,
  verifyAdmin,
  updateProductStockThreshold
);

// DELETE /api/products/:id - Delete product by id (ADMIN only)
router.delete(
  '/:id',
  verifyTokenMiddleware,
  verifyAdmin,
  deleteProduct
);

// POST /api/products/sync/pos - Sync products from POS Agent (ADMIN only)
router.post(
  '/sync/pos',
  verifyTokenMiddleware,
  verifyAdmin,
  syncFromPOS
);

// POST /api/pos-sync/push - Receive products from POS Agent (API Key auth)
// This endpoint is called directly by the POS Sync Agent
router.post('/pos-sync/push', requireTrustedAgent, syncProductsFromPOSAgent);

// DELETE /api/products/pos-sync/clear - Delete all POS synced products (ADMIN only)
router.delete(
  '/pos-sync/clear',
  verifyTokenMiddleware,
  verifyAdmin,
  deletePOSProducts
);

// POST /api/products/images/reconcile - Reattach images for all POS products missing one (ADMIN only)
router.post(
  '/images/reconcile',
  verifyTokenMiddleware,
  verifyAdmin,
  reconcileProductImages
);

// DELETE /api/products/:id/image - Permanently delete a product's Cloudinary image + mapping (ADMIN only)
router.delete(
  '/:id/image',
  verifyTokenMiddleware,
  verifyAdmin,
  permanentDeleteProductImage
);

module.exports = router;
