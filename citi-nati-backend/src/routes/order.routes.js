const express = require('express');
const { createOrder, updateOrderStatus, assignDriverToOrder, getUserOrders, getOrderById, getOrderByReference, checkPaymentStatus, getReceipt } = require('../controllers/order.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

// GET /api/orders - Get current user's orders (requires authentication)
router.get('/', verifyTokenMiddleware, getUserOrders);

// GET /api/orders/payment-check/:reference - Quick payment status check for polling (lightweight)
router.get('/payment-check/:reference', verifyTokenMiddleware, checkPaymentStatus);

// GET /api/orders/by-reference/:reference - Get order by payment reference (authenticated users)
router.get('/by-reference/:reference', verifyTokenMiddleware, getOrderByReference);

// GET /api/orders/:id/receipt - Get order receipt (authenticated users only)
router.get('/:id/receipt', verifyTokenMiddleware, getReceipt);

// GET /api/orders/:id - Get single order by ID (authenticated users - customers, drivers)
router.get('/:id', verifyTokenMiddleware, getOrderById);

// POST /api/orders - Create a new order (requires authentication)
router.post('/', verifyTokenMiddleware, createOrder);

// POST /api/orders/create - Create a new order (requires authentication) - alias for backward compatibility
router.post('/create', verifyTokenMiddleware, createOrder);

// PUT /api/orders/:id/status - Update order status (ADMIN or DRIVER)
router.put('/:id/status', verifyTokenMiddleware, updateOrderStatus);

// PUT /api/orders/:id/assign-driver - Assign driver to order (ADMIN only)
router.put('/:id/assign-driver', verifyTokenMiddleware, verifyAdmin, assignDriverToOrder);

module.exports = router;
