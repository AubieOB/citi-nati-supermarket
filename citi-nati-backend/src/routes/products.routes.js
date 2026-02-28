const express = require('express');
const { createProduct, getProducts, getProductById, updateProduct, deleteProduct } = require('../controllers/product.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const uploadProductImage = require('../middlewares/uploadProductImageCloudinary');

const router = express.Router();

// GET /api/products - Fetch all products
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

// DELETE /api/products/:id - Delete product by id (ADMIN only)
router.delete(
  '/:id',
  verifyTokenMiddleware,
  verifyAdmin,
  deleteProduct
);

module.exports = router;
