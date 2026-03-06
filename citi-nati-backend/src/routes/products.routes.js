const express = require('express');
const { createProduct, getProducts, getProductById, updateProduct, deleteProduct, syncFromPOS, syncProductsFromPOSAgent, deletePOSProducts, getCategories, toggleProductVisibility } = require('../controllers/product.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const uploadProductImage = require('../middlewares/uploadProductImageCloudinary');

const router = express.Router();

// GET /api/products/categories - Fetch all distinct categories
router.get('/categories', getCategories);

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
router.post('/pos-sync/push', syncProductsFromPOSAgent);

// DELETE /api/products/pos-sync/clear - Delete all POS synced products (ADMIN only)
router.delete(
  '/pos-sync/clear',
  verifyTokenMiddleware,
  verifyAdmin,
  deletePOSProducts
);

module.exports = router;
