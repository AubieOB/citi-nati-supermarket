const express = require('express');
const { createDriver, createDriverWithAccount, getDrivers, updateDriver, deleteDriver, getDriverPerformance, getDriverPerformanceByDay, clearDriverPerformance } = require('../controllers/drivers.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

// POST /api/drivers/with-account - Create driver with user account (ADMIN only - new drivers can login)
// DEFINE SPECIFIC ROUTES FIRST before generic ones
router.post('/with-account', verifyTokenMiddleware, verifyAdmin, createDriverWithAccount);

// GET /api/drivers/performance - Get driver performance metrics (ADMIN only)
router.get('/performance', verifyTokenMiddleware, verifyAdmin, getDriverPerformance);

// GET /api/drivers/performance/:salesDayId - Get driver performance for specific sales day (ADMIN only)
router.get('/performance/:salesDayId', verifyTokenMiddleware, verifyAdmin, getDriverPerformanceByDay);

// DELETE /api/drivers/performance - Clear driver performance data (ADMIN only)
router.delete('/performance', verifyTokenMiddleware, verifyAdmin, clearDriverPerformance);

// POST /api/drivers - Create a new driver (ADMIN only - legacy, without user account)
router.post('/', verifyTokenMiddleware, verifyAdmin, createDriver);

// GET /api/drivers - Get all drivers (ADMIN only)
router.get('/', verifyTokenMiddleware, verifyAdmin, getDrivers);

// PUT /api/drivers/:id - Update driver by id (ADMIN only)
router.put('/:id', verifyTokenMiddleware, verifyAdmin, updateDriver);

// DELETE /api/drivers/:id - Delete driver by id (ADMIN only)
router.delete('/:id', verifyTokenMiddleware, verifyAdmin, deleteDriver);

module.exports = router;
