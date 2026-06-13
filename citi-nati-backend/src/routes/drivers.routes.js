const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const {
	createDriver,
	createDriverWithAccount,
	getDrivers,
	updateDriver,
	deleteDriver,
	getDriverAvailability,
	updateDriverAvailability,
	updateDriverPresence,
	getDriverPerformance,
	getDriverPerformanceByDay,
	clearDriverPerformance,
} = require('../controllers/drivers.controller');
const { registerDriverPushToken, unregisterDriverPushToken } = require('../controllers/driverPushTokens.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const { verifyDriver } = require('../middleware/driver.middleware');

const router = express.Router();
const prisma = new PrismaClient();
const logger = require('../utils/logger');

// GET /api/drivers/security-key/status - Check if current driver account has a security key (DRIVER only)
router.get('/security-key/status', verifyTokenMiddleware, verifyDriver, async (req, res) => {
	try {
		const driverUser = await prisma.user.findUnique({
			where: { id: req.user.userId },
			select: { driverSecurityKeyHash: true },
		});

		return res.json({
			success: true,
			hasSecurityKey: Boolean(driverUser?.driverSecurityKeyHash),
		});
	} catch (err) {
		logger.errorLog('[DRIVER SECURITY] Status check failed:', { message: err.message });
		return res.status(500).json({ success: false, error: 'Failed to check driver security key status' });
	}
});

// POST /api/drivers/security-key/verify - Verify current driver's own security key before dashboard access (DRIVER only)
router.post('/security-key/verify', verifyTokenMiddleware, verifyDriver, async (req, res) => {
	try {
		const { securityKey } = req.body;

		if (!securityKey || typeof securityKey !== 'string') {
			return res.status(400).json({ success: false, error: 'Security key is required' });
		}

		const driverUser = await prisma.user.findUnique({
			where: { id: req.user.userId },
			select: { driverSecurityKeyHash: true },
		});

		if (!driverUser?.driverSecurityKeyHash) {
			return res.status(400).json({ success: false, error: 'No driver security key configured yet' });
		}

		const isValid = await bcrypt.compare(securityKey, driverUser.driverSecurityKeyHash);
		if (!isValid) {
			return res.status(401).json({ success: false, error: 'Invalid security key' });
		}

		return res.json({ success: true, verified: true });
	} catch (err) {
		logger.errorLog('[DRIVER SECURITY] Verification failed:', { message: err.message });
		return res.status(500).json({ success: false, error: 'Failed to verify driver security key' });
	}
});

// POST /api/drivers/mobile-push-token - Register this device for driver push notifications (DRIVER only)
router.post('/mobile-push-token', verifyTokenMiddleware, verifyDriver, registerDriverPushToken);

// DELETE /api/drivers/mobile-push-token - Disable this device's driver push token (DRIVER only)
router.delete('/mobile-push-token', verifyTokenMiddleware, verifyDriver, unregisterDriverPushToken);

// GET /api/drivers/availability - Load current driver's availability (DRIVER only)
router.get('/availability', verifyTokenMiddleware, verifyDriver, getDriverAvailability);

// PUT /api/drivers/availability - Update current driver's availability (DRIVER only)
router.put('/availability', verifyTokenMiddleware, verifyDriver, updateDriverAvailability);

// PUT /api/drivers/presence - Update current driver's live presence (DRIVER only)
router.put('/presence', verifyTokenMiddleware, verifyDriver, updateDriverPresence);

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
