const express = require('express');
const { getDriverOrders, updateDriverOrderStatus } = require('../controllers/drivers.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyDriver } = require('../middleware/driver.middleware');

const router = express.Router();

// GET /api/drivers/orders - Get all orders assigned to the driver
router.get('/', verifyTokenMiddleware, verifyDriver, getDriverOrders);

// PUT /api/drivers/orders/:id/status - Update order status (Driver only)
router.put('/:id/status', verifyTokenMiddleware, verifyDriver, updateDriverOrderStatus);

module.exports = router;
