const express = require('express');
const { acceptDriverOrder, declineDriverOrder, getDriverOrders, updateDriverOrderStatus } = require('../controllers/drivers.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyDriver } = require('../middleware/driver.middleware');

const router = express.Router();

// GET /api/drivers/orders - Get all orders assigned to the driver
router.get('/', verifyTokenMiddleware, verifyDriver, getDriverOrders);

// PUT /api/drivers/orders/:id/accept - Accept an assigned delivery (Driver only)
router.put('/:id/accept', verifyTokenMiddleware, verifyDriver, acceptDriverOrder);

// PUT /api/drivers/orders/:id/decline - Decline an assigned delivery (Driver only)
router.put('/:id/decline', verifyTokenMiddleware, verifyDriver, declineDriverOrder);

// PUT /api/drivers/orders/:id/status - Update order status (Driver only)
router.put('/:id/status', verifyTokenMiddleware, verifyDriver, updateDriverOrderStatus);

module.exports = router;
