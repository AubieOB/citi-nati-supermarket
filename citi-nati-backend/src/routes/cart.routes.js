const express = require('express');
const { addToCart, getCart, updateCartItem } = require('../controllers/cart.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

// GET /api/cart - Get user's cart (requires authentication)
router.get('/', verifyTokenMiddleware, getCart);

// POST /api/cart - Add product to cart (requires authentication)
router.post('/', verifyTokenMiddleware, addToCart);

// POST /api/cart/add - Add product to cart (requires authentication) - alias for backward compatibility
router.post('/add', verifyTokenMiddleware, addToCart);

// PUT /api/cart/update - Update cart item quantity (requires authentication)
router.put('/update', verifyTokenMiddleware, updateCartItem);

module.exports = router;
