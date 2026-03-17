const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { createDriver, createDriverWithAccount, getDrivers, updateDriver, deleteDriver, getDriverPerformance, getDriverPerformanceByDay, clearDriverPerformance } = require('../controllers/drivers.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const { verifyDriver } = require('../middleware/driver.middleware');

const router = express.Router();
const prisma = new PrismaClient();
const DRIVER_SECURITY_KEY_HASH_KEY = 'driver_security_key_hash';

// GET /api/drivers/security-key/status - Check if driver security key exists (DRIVER only)
router.get('/security-key/status', verifyTokenMiddleware, verifyDriver, async (req, res) => {
	try {
		const setting = await prisma.siteSetting.findUnique({
			where: { key: DRIVER_SECURITY_KEY_HASH_KEY },
			select: { value: true },
		});

		return res.json({
			success: true,
			hasSecurityKey: Boolean(setting?.value),
		});
	} catch (err) {
		console.error('[DRIVER SECURITY] Status check failed:', err.message);
		return res.status(500).json({ success: false, error: 'Failed to check driver security key status' });
	}
});

// POST /api/drivers/security-key/verify - Verify driver security key before dashboard access (DRIVER only)
router.post('/security-key/verify', verifyTokenMiddleware, verifyDriver, async (req, res) => {
	try {
		const { securityKey } = req.body;

		if (!securityKey || typeof securityKey !== 'string') {
			return res.status(400).json({ success: false, error: 'Security key is required' });
		}

		const setting = await prisma.siteSetting.findUnique({
			where: { key: DRIVER_SECURITY_KEY_HASH_KEY },
			select: { value: true },
		});

		if (!setting?.value) {
			return res.status(400).json({ success: false, error: 'No driver security key configured yet' });
		}

		const isValid = await bcrypt.compare(securityKey, setting.value);
		if (!isValid) {
			return res.status(401).json({ success: false, error: 'Invalid security key' });
		}

		return res.json({ success: true, verified: true });
	} catch (err) {
		console.error('[DRIVER SECURITY] Verification failed:', err.message);
		return res.status(500).json({ success: false, error: 'Failed to verify driver security key' });
	}
});

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
