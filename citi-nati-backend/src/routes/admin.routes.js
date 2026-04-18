/**
 * Admin Routes
 * 
 * All routes protected by:
 * 1. verifyToken - Ensures user is authenticated
 * 2. verifyAdmin - Ensures user has admin role
 * 
 * Usage in server.js:
 *   app.use('/api/admin', adminRoutes);
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const { PrismaClient } = require('@prisma/client');
const { getRefundPendingOrders, markOrderAsRefunded } = require('../controllers/order.controller');
const { getCurrentPromotions, updatePromotion, previewPromotion, applyPromotion, removePromotion } = require('../controllers/promotion.controller');
const {
  getExpiryCandidates,
  previewPromotion: previewPosPromotion,
  applyPromotion: applyPosPromotion,
  revertPromotion: revertPosPromotion,
} = require('../controllers/posExpiryPromotion.controller');
const {
  getPosSyncMonitor,
  getPosSyncEvents,
  togglePosSync,
  runManualPosSync,
  clearFailedQueueCommands,
  clearFailedActivityEvents,
} = require('../controllers/posSyncMonitor.controller');
const { getExpiryBatchAlerts, setStockOverride } = require('../controllers/product.controller');
const { emitProductUpdate } = require('../utils/socket');
const { VAT_ENABLED_KEY, clearVatSettingsCache, getVatSettings } = require('../utils/vat');
const {
  getBusinessOffsetMinutes,
  formatUtcOffsetLabel,
  getBusinessTimezoneName,
  formatBusinessDateTimeLabel,
} = require('../utils/businessTime');

const router = express.Router();
const prisma = new PrismaClient();
const MAINTENANCE_MODE_KEY = 'maintenance_mode_enabled';
const MAINTENANCE_MESSAGE_KEY = 'maintenance_mode_message';
const DEFAULT_MAINTENANCE_MESSAGE = 'We are currently carrying out maintenance to improve your experience. We apologize for the inconvenience.';

function normalizeLocationCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

const ZOMBA_LOCATION_CODES = ['ZA', 'SH', 'BAR', 'RES', 'WH'];

function expandLocationScopeCodes(locationCode) {
  const normalizedLocationCode = normalizeLocationCode(locationCode);
  if (!normalizedLocationCode) return [];

  if (normalizedLocationCode === 'BT') {
    return ['BT'];
  }

  if (normalizedLocationCode === 'ZA') {
    // Branch-level ZA should include all known Zomba operational sources.
    return ['SH', 'BAR', 'RES', 'WH'];
  }

  return [normalizedLocationCode];
}

function buildLocationCodeScopeWhere(locationCodes) {
  if (!Array.isArray(locationCodes) || locationCodes.length === 0) {
    return null;
  }

  return {
    OR: locationCodes.map((code) => ({
      locationCode: {
        equals: code,
        mode: 'insensitive',
      },
    })),
  };
}

function deriveBranchCodeFromScopeCodes(scopeCodes = []) {
  if (scopeCodes.includes('BT')) return 'BLANTYRE';
  if (scopeCodes.some((code) => ZOMBA_LOCATION_CODES.includes(code))) return 'ZOMBA';
  return null;
}

async function resolveLocationScopedProductCodesFromSales(scopeCodes = [], branchCodeHint = null) {
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
    return [];
  }

  const normalizedBranchHint = normalizeLocationCode(branchCodeHint);
  // Preserve branch-level fallback only for legacy Blantyre rows.
  const derivedBranchCode = scopeCodes.includes('BT')
    ? (normalizedBranchHint || deriveBranchCodeFromScopeCodes(scopeCodes))
    : null;
  const locationPredicates = scopeCodes.map((code) => ({
    locationCode: {
      equals: code,
      mode: 'insensitive',
    },
  }));

  const rows = await prisma.salesInvoiceItem.findMany({
    where: {
      productCode: { not: null },
      salesInvoice: {
        OR: [
          ...locationPredicates,
          ...(derivedBranchCode ? [{ branchCode: derivedBranchCode }] : []),
        ],
      },
    },
    select: { productCode: true },
    distinct: ['productCode'],
  });

  return rows
    .map((row) => String(row.productCode || '').trim())
    .filter(Boolean);
}

async function resolveLocationScopedProductCodesFromLatestCosts(scopeCodes = [], branchCodeHint = null) {
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
    return [];
  }

  const normalizedBranchHint = normalizeLocationCode(branchCodeHint);
  // Preserve branch-level fallback only for legacy Blantyre rows.
  const derivedBranchCode = scopeCodes.includes('BT')
    ? (normalizedBranchHint || deriveBranchCodeFromScopeCodes(scopeCodes))
    : null;
  const locationPredicates = scopeCodes.map((code) => ({
    locationCode: {
      equals: code,
      mode: 'insensitive',
    },
  }));

  const rows = await prisma.posLatestProductCost.findMany({
    where: {
      OR: [
        ...locationPredicates,
        ...(derivedBranchCode ? [{ branchCode: derivedBranchCode }] : []),
      ],
    },
    select: { productCode: true },
    distinct: ['productCode'],
  });

  return rows
    .map((row) => String(row.productCode || '').trim())
    .filter(Boolean);
}

async function resolveLocationScopedProductCodes(locationCode, branchCodeHint = null) {
  const scopeCodes = expandLocationScopeCodes(locationCode);
  if (scopeCodes.length === 0) return null;
  const normalizedBranchHint = normalizeLocationCode(branchCodeHint);

  const scopedWhere = buildLocationCodeScopeWhere(scopeCodes);

  const expiryRows = await prisma.productExpiryBatch.findMany({
    where: scopedWhere || undefined,
    select: { productCode: true },
    distinct: ['productCode'],
  });

  const scopedCodes = new Set(
    expiryRows
      .map((row) => String(row.productCode || '').trim())
      .filter(Boolean)
  );

  if (normalizedBranchHint && scopedCodes.size > 0) {
    const expiryBranchRows = await prisma.product.findMany({
      where: {
        branchCode: normalizedBranchHint,
        sourceCode: { in: Array.from(scopedCodes.values()) },
      },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });

    scopedCodes.clear();
    expiryBranchRows
      .map((row) => String(row.sourceCode || '').trim())
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
  }

  const costCodes = await resolveLocationScopedProductCodesFromLatestCosts(scopeCodes, normalizedBranchHint);
  costCodes.forEach((code) => scopedCodes.add(code));

  const salesCodes = await resolveLocationScopedProductCodesFromSales(scopeCodes, normalizedBranchHint);
  salesCodes.forEach((code) => scopedCodes.add(code));

  const isZombaScope = scopeCodes.some((code) => ['SH', 'BAR', 'RES', 'WH'].includes(code));
  if (isZombaScope) {
    console.log('[ADMIN POS][SCOPE][ZA] code-source diagnostics', {
      scopeCodes,
      expiryDistinctCount: expiryRows.length,
      latestCostDistinctCount: costCodes.length,
      salesDistinctCount: salesCodes.length,
      combinedDistinctCount: scopedCodes.size,
    });
  }

  if (scopedCodes.size === 0 && scopeCodes.includes('BT')) {
    const legacyRows = await prisma.product.findMany({
      where: {
        branchCode: 'BLANTYRE',
        sourceCode: { not: null },
      },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });

    legacyRows
      .map((row) => String(row.sourceCode || '').trim())
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
  }

  return Array.from(scopedCodes.values());
}

const getSettingValue = async (key, fallbackValue) => {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  return setting ? setting.value : fallbackValue;
};

/**
 * GET /api/admin/test
 * Simple test endpoint to verify admin access
 * Returns success if user is authenticated admin
 */
router.get('/test', verifyTokenMiddleware, verifyAdmin, (req, res) => {
  return res.json({ 
    success: true,
    message: 'Admin access granted',
    user: { 
      id: req.user.id, 
      email: req.user.email,
      role: req.user.role 
    }
  });
});

/**
 * GET /api/admin/zomba-stock-trace
 * Quick trace endpoint for Zomba operational stock verification.
 * Query params:
 *   productCode (optional, defaults to Castel Beer 9501100002174)
 */
router.get('/zomba-stock-trace', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const productCode = String(req.query.productCode || '9501100002174').trim();
    if (!productCode) {
      return res.status(400).json({ success: false, error: 'productCode is required' });
    }

    const [product, latestShBatch] = await Promise.all([
      prisma.product.findFirst({
        where: {
          branchCode: 'ZOMBA',
          sourceCode: productCode,
        },
        select: {
          id: true,
          name: true,
          sourceCode: true,
          branchCode: true,
          stock: true,
          updatedAt: true,
          overrideActive: true,
          overrideStock: true,
          lowStockThreshold: true,
        },
      }),
      prisma.productExpiryBatch.findFirst({
        where: {
          productCode,
          locationCode: {
            equals: 'SH',
            mode: 'insensitive',
          },
        },
        orderBy: [
          { lastSyncedAt: 'desc' },
          { updatedAt: 'desc' },
        ],
        select: {
          id: true,
          locationCode: true,
          expiryDate: true,
          remainingQty: true,
          lastSyncedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const payload = {
      productCode,
      zombaOperationalRule: {
        locationCode: 'SH',
        source: 'DailyStockBalance latest snapshot <= today (agent-enforced)',
      },
      product: product || null,
      latestShBatchSyncMeta: latestShBatch || null,
      trace: {
        sourceUsed: 'PersistedProduct.stock from POS agent push',
        finalStockReturned: Number(product?.stock || 0),
      },
    };

    console.log('[ZOMBA STOCK][TRACE ENDPOINT]', {
      productCode,
      source: payload.zombaOperationalRule.source,
      locationCode: 'SH',
      finalStockReturned: payload.trace.finalStockReturned,
      productUpdatedAt: product?.updatedAt || null,
      latestShBatchSyncedAt: latestShBatch?.lastSyncedAt || null,
    });

    return res.json({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error('[ZOMBA STOCK][TRACE ENDPOINT] error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load Zomba stock trace' });
  }
});

/**
 * GET /api/admin/dashboard
 * Admin dashboard statistics
 * Protected: Admin only
 */
router.get('/dashboard', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalOrders = await prisma.order.count();
    
    res.json({
      success: true,
      data: {
        totalUsers,
        totalOrders,
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

router.get('/system/settings', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const [maintenanceEnabled, maintenanceMessage, vatSettings] = await Promise.all([
      getSettingValue(MAINTENANCE_MODE_KEY, 'false'),
      getSettingValue(MAINTENANCE_MESSAGE_KEY, DEFAULT_MAINTENANCE_MESSAGE),
      getVatSettings(),
    ]);

    const businessOffsetMinutes = getBusinessOffsetMinutes();
    const businessTime = {
      timezoneName: getBusinessTimezoneName(),
      offsetMinutes: businessOffsetMinutes,
      offsetLabel: formatUtcOffsetLabel(businessOffsetMinutes),
      now: formatBusinessDateTimeLabel(new Date()),
    };

    return res.json({
      success: true,
      settings: {
        maintenanceMode: maintenanceEnabled === 'true',
        maintenanceMessage,
        vatEnabled: vatSettings.enabled,
        vatRatePercent: vatSettings.ratePercent,
        configuredVatRatePercent: vatSettings.configuredRatePercent,
        businessTime,
      },
    });
  } catch (err) {
    console.error('[ADMIN SYSTEM] Failed to fetch settings:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch system settings' });
  }
});

router.put('/system/maintenance', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { maintenanceMode, maintenanceMessage } = req.body;
    const vatEnabled = req.body?.vatEnabled !== undefined ? Boolean(req.body.vatEnabled) : true;

    const messageToSave = (maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE).trim();

    await prisma.$transaction([
      prisma.siteSetting.upsert({
        where: { key: MAINTENANCE_MODE_KEY },
        update: { value: maintenanceMode ? 'true' : 'false' },
        create: { key: MAINTENANCE_MODE_KEY, value: maintenanceMode ? 'true' : 'false' },
      }),
      prisma.siteSetting.upsert({
        where: { key: MAINTENANCE_MESSAGE_KEY },
        update: { value: messageToSave },
        create: { key: MAINTENANCE_MESSAGE_KEY, value: messageToSave },
      }),
      prisma.siteSetting.upsert({
        where: { key: VAT_ENABLED_KEY },
        update: { value: vatEnabled ? 'true' : 'false' },
        create: { key: VAT_ENABLED_KEY, value: vatEnabled ? 'true' : 'false' },
      }),
    ]);

    clearVatSettingsCache();
    const vatSettings = await getVatSettings(true);
    const businessOffsetMinutes = getBusinessOffsetMinutes();
    const businessTime = {
      timezoneName: getBusinessTimezoneName(),
      offsetMinutes: businessOffsetMinutes,
      offsetLabel: formatUtcOffsetLabel(businessOffsetMinutes),
      now: formatBusinessDateTimeLabel(new Date()),
    };

    return res.json({
      success: true,
      message: 'System settings saved successfully',
      settings: {
        maintenanceMode: Boolean(maintenanceMode),
        maintenanceMessage: messageToSave,
        vatEnabled: vatSettings.enabled,
        vatRatePercent: vatSettings.ratePercent,
        configuredVatRatePercent: vatSettings.configuredRatePercent,
        businessTime,
      },
    });
  } catch (err) {
    console.error('[ADMIN SYSTEM] Failed to update maintenance mode:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update maintenance mode' });
  }
});

router.get('/pos-sync/monitor', verifyTokenMiddleware, verifyAdmin, getPosSyncMonitor);
router.get('/pos-sync/events', verifyTokenMiddleware, verifyAdmin, getPosSyncEvents);
router.post('/pos-sync/toggle', verifyTokenMiddleware, verifyAdmin, togglePosSync);
router.post('/pos-sync/manual-sync', verifyTokenMiddleware, verifyAdmin, runManualPosSync);
router.delete('/pos-sync/failed-commands', verifyTokenMiddleware, verifyAdmin, clearFailedQueueCommands);
router.delete('/pos-sync/failed-events', verifyTokenMiddleware, verifyAdmin, clearFailedActivityEvents);

/**
 * GET /api/admin/security-key/status
 * Returns whether current admin has configured a security key
 */
router.get('/security-key/status', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { adminSecurityKeyHash: true }
    });

    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    return res.json({
      success: true,
      hasSecurityKey: Boolean(adminUser.adminSecurityKeyHash),
    });
  } catch (err) {
    console.error('[ADMIN SECURITY] Status check failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to check security key status' });
  }
});

/**
 * POST /api/admin/security-key/verify
 * Verify security key before allowing admin dashboard access
 */
router.post('/security-key/verify', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { securityKey } = req.body;

    if (!securityKey || typeof securityKey !== 'string') {
      return res.status(400).json({ success: false, error: 'Security key is required' });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { adminSecurityKeyHash: true }
    });

    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    if (!adminUser.adminSecurityKeyHash) {
      return res.status(400).json({ success: false, error: 'No security key configured yet' });
    }

    const isValid = await bcrypt.compare(securityKey, adminUser.adminSecurityKeyHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid security key' });
    }

    return res.json({ success: true, verified: true });
  } catch (err) {
    console.error('[ADMIN SECURITY] Verification failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to verify security key' });
  }
});

/**
 * PUT /api/admin/security-key
 * Set first security key or change existing security key
 */
router.put('/security-key', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { securityKey, confirmSecurityKey, currentSecurityKey } = req.body;

    if (!securityKey || !confirmSecurityKey) {
      return res.status(400).json({ success: false, error: 'Enter and confirm security key are required' });
    }

    if (securityKey !== confirmSecurityKey) {
      return res.status(400).json({ success: false, error: 'Security key confirmation does not match' });
    }

    if (securityKey.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Security key must be at least 4 characters' });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, adminSecurityKeyHash: true }
    });

    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    if (adminUser.adminSecurityKeyHash) {
      if (!currentSecurityKey) {
        return res.status(400).json({ success: false, error: 'Current security key is required to change key' });
      }

      const currentMatches = await bcrypt.compare(currentSecurityKey, adminUser.adminSecurityKeyHash);
      if (!currentMatches) {
        return res.status(401).json({ success: false, error: 'Current security key is incorrect' });
      }
    }

    const newHash = await bcrypt.hash(securityKey, 10);

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { adminSecurityKeyHash: newHash }
    });

    return res.json({
      success: true,
      message: adminUser.adminSecurityKeyHash ? 'Security key changed successfully' : 'Security key set successfully',
    });
  } catch (err) {
    console.error('[ADMIN SECURITY] Set/change key failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save security key' });
  }
});

/**
 * GET /api/admin/security-key/driver/:userId/status
 * Returns whether the selected driver account has configured a security key
 */
router.get('/security-key/driver/:userId/status', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const driverUser = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, role: true, driverSecurityKeyHash: true, name: true },
    });

    if (!driverUser || driverUser.role !== 'driver') {
      return res.status(404).json({ success: false, error: 'Driver account not found' });
    }

    return res.json({
      success: true,
      hasSecurityKey: Boolean(driverUser.driverSecurityKeyHash),
      driver: {
        id: driverUser.id,
        name: driverUser.name,
      },
    });
  } catch (err) {
    console.error('[DRIVER SECURITY] Admin status check failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to check driver security key status' });
  }
});

/**
 * PUT /api/admin/security-key/driver/:userId
 * Set first security key or change existing key for a selected driver account
 */
router.put('/security-key/driver/:userId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { securityKey, confirmSecurityKey, currentSecurityKey } = req.body;

    if (!securityKey || !confirmSecurityKey) {
      return res.status(400).json({ success: false, error: 'Enter and confirm driver security key are required' });
    }

    if (securityKey !== confirmSecurityKey) {
      return res.status(400).json({ success: false, error: 'Driver security key confirmation does not match' });
    }

    if (securityKey.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Driver security key must be at least 4 characters' });
    }

    const driverUser = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, role: true, name: true, driverSecurityKeyHash: true },
    });

    if (!driverUser || driverUser.role !== 'driver') {
      return res.status(404).json({ success: false, error: 'Driver account not found' });
    }

    if (driverUser.driverSecurityKeyHash) {
      if (!currentSecurityKey) {
        return res.status(400).json({ success: false, error: 'Current driver security key is required to change key' });
      }

      const currentMatches = await bcrypt.compare(currentSecurityKey, driverUser.driverSecurityKeyHash);
      if (!currentMatches) {
        return res.status(401).json({ success: false, error: 'Current driver security key is incorrect' });
      }
    }

    const newHash = await bcrypt.hash(securityKey, 10);

    await prisma.user.update({
      where: { id: driverUser.id },
      data: { driverSecurityKeyHash: newHash },
    });

    return res.json({
      success: true,
      message: driverUser.driverSecurityKeyHash ? 'Driver security key changed successfully' : 'Driver security key set successfully',
    });
  } catch (err) {
    console.error('[DRIVER SECURITY] Admin set/change key failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save driver security key' });
  }
});

/**
 * GET /api/admin/users
 * Get all active users in the system
 * Protected: Admin only
 */
router.get('/users', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    // Return in expected format for frontend
    res.json({
      success: true,
      users: users,
      total: users.length
    });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * PUT /api/admin/users/:userId/role
 * Update user role (user, admin, driver, cashier)
 * Protected: Admin only
 */
router.put('/users/:userId/role', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['user', 'admin', 'driver', 'cashier'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent changing own role
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Get the user first to access their details
    const userBefore = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!userBefore) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user role
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      }
    });

    // If changing role TO driver, ensure Driver record exists
    if (role === 'driver' && userBefore.role !== 'driver') {
      const existingDriver = await prisma.driver.findUnique({
        where: { email: user.email }
      });

      if (!existingDriver) {
        await prisma.driver.create({
          data: {
            name: user.name,
            email: user.email,
            phone: null // Can be updated later
          }
        });
        console.log('[ADMIN] Created Driver record for user:', { userId, email: user.email });
      }
    }

    console.log('[ADMIN] User role updated:', { userId, newRole: role, admin: req.user.email });
    res.json({ 
      success: true, 
      user,
      message: `User role updated to ${role}`
    });
  } catch (err) {
    console.error('Update user role error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Failed to update user role', details: err.message });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Permanently delete user account and all associated data (cart, orders, driver record)
 * CASCADE DELETE handles cart/order cleanup automatically
 * Protected: Admin only
 */
router.delete('/users/:userId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting self
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists first
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If user is a driver, delete the Driver record first (before cascade)
    if (existingUser.role === 'driver') {
      await prisma.driver.deleteMany({
        where: { email: existingUser.email },
      });
      console.log('[ADMIN DELETE USER] Deleted associated Driver record for:', existingUser.email);
    }

    // Hard delete user - CASCADE DELETE automatically removes:
    // - Cart (and CartItems via CASCADE)
    // - Orders (and OrderItems via CASCADE)
    // - SalesDay relationships
    await prisma.user.delete({
      where: { id: userId },
    });

    console.log('[ADMIN] User permanently deleted:', { 
      userId, 
      email: existingUser.email, 
      name: existingUser.name,
      admin: req.user.email 
    });
    
    res.json({ 
      success: true, 
      message: 'User account permanently deleted. All associated data (cart, orders) has been removed.'
    });
  } catch (err) {
    console.error('Delete user error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

/**
 * GET /api/admin/orders
 * Get all orders in the system (only payment-verified orders, exclude PENDING_PAYMENT)
 * Protected: Admin only
 */
router.get('/orders', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: { not: 'PENDING_PAYMENT' }  // Exclude orders waiting for payment (PENDING_PAYMENT status means payment not verified yet)
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        driver: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      orders: orders,
      total: orders.length
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/admin/orders/:orderId
 * Get single order details
 * Protected: Admin only
 */
router.get('/orders/:orderId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      include: {
        user: { select: { id: true, name: true, email: true } },
        driver: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * GET /api/admin/refunds/pending
 * Get all orders pending refund
 * Protected: Admin only
 */
router.get('/refunds/pending', verifyTokenMiddleware, verifyAdmin, getRefundPendingOrders);

/**
 * PUT /api/admin/refunds/:orderId/approve
 * Mark an order as refunded (after manual processing)
 * Protected: Admin only
 */
router.put('/refunds/:orderId/approve', verifyTokenMiddleware, verifyAdmin, markOrderAsRefunded);

/**
 * PUT /api/admin/inventory/stock-override/:id
 * Set or clear a website stock override for a product.
 * POS stock is never modified — only override fields are changed.
 * Protected: Admin only
 */
router.put('/inventory/stock-override/:id', verifyTokenMiddleware, verifyAdmin, setStockOverride);

/**
 * ============================================
 * 🎯 PROMOTIONS MANAGEMENT ROUTES
 * ============================================
 */

/**
 * GET /api/admin/promotions
 * Get current promotion settings
 * Protected: Admin only
 */
router.get('/promotions', verifyTokenMiddleware, verifyAdmin, getCurrentPromotions);

/**
 * POST /api/admin/promotions/apply
 * Apply active promotions to products
 * Protected: Admin only
 */
router.post('/promotions/apply', verifyTokenMiddleware, verifyAdmin, applyPromotion);

/**
 * POST /api/admin/promotions/remove
 * Remove all active promotions
 * Protected: Admin only
 */
router.post('/promotions/remove', verifyTokenMiddleware, verifyAdmin, removePromotion);

/**
 * POST /api/admin/promotions/:type/preview
 * Preview products matching promotion criteria
 * Protected: Admin only
 */
router.post('/promotions/:type/preview', verifyTokenMiddleware, verifyAdmin, previewPromotion);

/**
 * POST /api/admin/promotions/:type
 * Update/toggle a promotion (global, category, or selective)
 * Protected: Admin only
 */
router.post('/promotions/:type', verifyTokenMiddleware, verifyAdmin, updatePromotion);

/**
 * GET /api/admin/pos-expiry
 * Fetch expired or near-expiry products from POS.
 * Protected: Admin only
 */
router.get('/pos-expiry', verifyTokenMiddleware, verifyAdmin, getExpiryCandidates);
router.get('/expiry-batches', verifyTokenMiddleware, verifyAdmin, getExpiryBatchAlerts);

/**
 * GET /api/admin/pos-promotions/:productCode/preview
 * Preview the latest POS price row before applying a promotion.
 * Protected: Admin only
 */
router.get('/pos-promotions/:productCode/preview', verifyTokenMiddleware, verifyAdmin, previewPosPromotion);

/**
 * POST /api/admin/pos-promotions/apply
 * Queue an insert-only POS promotion write-back.
 * Protected: Admin only
 */
router.post('/pos-promotions/apply', verifyTokenMiddleware, verifyAdmin, applyPosPromotion);

/**
 * POST /api/admin/pos-promotions/revert
 * Queue an insert-only POS promotion revert write-back.
 * Protected: Admin only
 */
router.post('/pos-promotions/revert', verifyTokenMiddleware, verifyAdmin, revertPosPromotion);

/**
 * GET /api/admin/pos-products
 * Get all POS synced products with optional search
 * Query params: search, page, limit
 * Protected: Admin only
 */
router.get('/pos-products', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 5000, locationCode, branchCode } = req.query;
    const skip = (page - 1) * limit;
    const normalizedLocationCode = normalizeLocationCode(locationCode);
    const normalizedBranchCode = String(branchCode || '').trim().toUpperCase() || null;

    if ((normalizedBranchCode && !normalizedLocationCode) || (!normalizedBranchCode && normalizedLocationCode)) {
      return res.status(400).json({
        success: false,
        error: 'Operational scope requires both branchCode and locationCode',
      });
    }

    // Build where clause
    const where = {
      sourceCode: { not: null }, // Only POS products
    };

    if (normalizedBranchCode && normalizedLocationCode) {
      const scopedProductCodes = await resolveLocationScopedProductCodes(normalizedLocationCode, normalizedBranchCode);
      if (!scopedProductCodes || scopedProductCodes.length === 0) {
        return res.json({
          success: true,
          products: [],
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0,
        });
      } else {
        where.branchCode = normalizedBranchCode;
        where.sourceCode = { in: scopedProductCodes };
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sourceCode: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await prisma.product.count({ where });

    // Get paginated products
    const products = await prisma.product.findMany({
      where,
      skip,
      take: parseInt(limit),
      select: {
        id: true,
        branchCode: true,
        name: true,
        sourceCode: true,
        category: true,
        price: true,
        stock: true,
        hideFromProductsPage: true,
        image: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const isZombaScope = normalizedLocationCode && ['ZA', 'SH', 'BAR', 'RES', 'WH'].includes(normalizedLocationCode);
        if (normalizedBranchCode && normalizedLocationCode) {
          const sampleRows = products.slice(0, 5).map((row) => ({
            id: row.id,
            sourceCode: row.sourceCode,
            branchCode: row.branchCode,
          }));

          console.log('[ADMIN POS][SCOPE] strict response diagnostics', {
            requestedBranchCode: normalizedBranchCode,
            requestedLocationCode: normalizedLocationCode,
            totalCount: total,
            pageRowCount: products.length,
            skip,
            limit: parseInt(limit),
            sampleRows,
          });
        }

    if (isZombaScope && products.length > 0) {
      const sample = products[0];
      console.log(`[ZOMBA STOCK][POS_MANAGEMENT] product=${sample.sourceCode || 'UNKNOWN'} source=PersistedProductStock location=SH stock=${Number(sample.stock || 0)}`);
      const verifyProduct = products.find((row) => String(row.sourceCode || '').trim() === '9501100002174');
      if (verifyProduct) {
        console.log(`[ZOMBA STOCK][VERIFY][POS_MANAGEMENT] product=9501100002174 source=PersistedProductStock location=SH stock=${Number(verifyProduct.stock || 0)}`);
      }
    }

    res.json({
      success: true,
      products,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[ADMIN POS] Get products error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch POS products',
      details: err.message,
    });
  }
});

/**
 * PUT /api/admin/pos-products/:id/visibility
 * Toggle product visibility (hide/show from products page)
 * Protected: Admin only
 */
router.put('/pos-products/:id/visibility', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { hideFromProductsPage } = req.body;
    const normalizedLocationCode = normalizeLocationCode(req.query.locationCode || req.body?.locationCode);
    const normalizedBranchCode = String(req.query.branchCode || req.body?.branchCode || '').trim().toUpperCase() || null;

    if (normalizedBranchCode) {
      const product = await prisma.product.findUnique({
        where: { id: parseInt(id) },
        select: { branchCode: true },
      });

      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      if (String(product.branchCode || '').trim().toUpperCase() !== normalizedBranchCode) {
        return res.status(400).json({ success: false, error: 'Product is not available in the selected branch scope' });
      }
    } else if (normalizedLocationCode) {
      const product = await prisma.product.findUnique({
        where: { id: parseInt(id) },
        select: { sourceCode: true },
      });

      if (!product?.sourceCode) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const scopedCodes = await resolveLocationScopedProductCodes(normalizedLocationCode);
      if (!scopedCodes || !scopedCodes.includes(product.sourceCode)) {
        return res.status(400).json({ success: false, error: 'Product is not available in the selected location scope' });
      }
    }

    const product = await prisma.product.update({
      where: { id: parseInt(id) },
      data: { hideFromProductsPage: Boolean(hideFromProductsPage) },
      select: {
        id: true,
        name: true,
        hideFromProductsPage: true,
        price: true,
        originalPrice: true,
        discountPrice: true,
        isOnSale: true,
        stock: true,
        category: true,
        image: true,
        expiryDate: true,
        updatedAt: true,
      },
    });

    console.log(`[ADMIN POS] Product ${id} visibility updated: ${product.hideFromProductsPage ? 'HIDDEN' : 'VISIBLE'}`);

    // Broadcast visibility change to all connected clients
    emitProductUpdate(product);

    res.json({
      success: true,
      message: product.hideFromProductsPage ? 'Product hidden from products page' : 'Product shown on products page',
      product,
    });
  } catch (err) {
    console.error('[ADMIN POS] Update visibility error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update product visibility',
      details: err.message,
    });
  }
});

/**
 * PUT /api/admin/pos-products/:id/enabled
 * Toggle product enabled/disabled status
 * Body: { enabled: true/false }
 * Protected: Admin only
 */
router.put('/pos-products/:id/enabled', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const product = await prisma.product.update({
      where: { id: parseInt(id) },
      data: { enabled: Boolean(enabled) },
      select: {
        id: true,
        name: true,
        enabled: true,
      },
    });

    console.log(`[ADMIN POS] Product ${id} enabled status updated: ${product.enabled ? 'ENABLED' : 'DISABLED'}`);

    res.json({
      success: true,
      message: product.enabled ? 'Product enabled and available for purchase' : 'Product disabled',
      product,
    });
  } catch (err) {
    console.error('[ADMIN POS] Update enabled error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update product status',
      details: err.message,
    });
  }
});

/**
 * DELETE /api/admin/pos-products/delete-selected
 * Delete selected product IDs
 * Body: { productIds: [1, 2, 3] }
 * Protected: Admin only
 */
router.delete('/pos-products/delete-selected', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { productIds } = req.body;
    const normalizedLocationCode = normalizeLocationCode(req.query.locationCode || req.body?.locationCode);
    const normalizedBranchCode = String(req.query.branchCode || req.body?.branchCode || '').trim().toUpperCase() || null;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'productIds must be a non-empty array',
      });
    }

    const where = {
      id: { in: productIds.map(id => parseInt(id)) },
      sourceCode: { not: null }, // Only allow deleting POS products
    };

    if (normalizedBranchCode) {
      where.branchCode = normalizedBranchCode;
    } else if (normalizedLocationCode) {
      const scopedCodes = await resolveLocationScopedProductCodes(normalizedLocationCode);
      const derivedBranchCode = deriveBranchCodeFromScopeCodes(expandLocationScopeCodes(normalizedLocationCode));
      if (!scopedCodes || scopedCodes.length === 0) {
        return res.json({ success: true, message: 'No POS products found for selected location', deletedCount: 0 });
      }
      where.sourceCode = { in: scopedCodes };
      if (derivedBranchCode) {
        where.branchCode = derivedBranchCode;
      }
    }

    const deleted = await prisma.product.deleteMany({ where });

    console.log(`[ADMIN POS] Deleted ${deleted.count} selected products`);

    res.json({
      success: true,
      message: `Deleted ${deleted.count} product(s)`,
      deletedCount: deleted.count,
    });
  } catch (err) {
    console.error('[ADMIN POS] Delete selected error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete selected products',
      details: err.message,
    });
  }
});

/**
 * DELETE /api/admin/pos-products/delete-all
 * Delete ALL POS synced products
 * Protected: Admin only
 */
router.delete('/pos-products/delete-all', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const normalizedLocationCode = normalizeLocationCode(req.query.locationCode || req.body?.locationCode);
    const normalizedBranchCode = String(req.query.branchCode || req.body?.branchCode || '').trim().toUpperCase() || null;
    const where = {
      sourceCode: { not: null }, // Only POS products
    };

    if (normalizedBranchCode) {
      where.branchCode = normalizedBranchCode;
    } else if (normalizedLocationCode) {
      const scopedCodes = await resolveLocationScopedProductCodes(normalizedLocationCode);
      const derivedBranchCode = deriveBranchCodeFromScopeCodes(expandLocationScopeCodes(normalizedLocationCode));
      if (!scopedCodes || scopedCodes.length === 0) {
        return res.json({ success: true, message: 'No POS products found for selected location', deletedCount: 0 });
      }
      where.sourceCode = { in: scopedCodes };
      if (derivedBranchCode) {
        where.branchCode = derivedBranchCode;
      }
    }

    const deleted = await prisma.product.deleteMany({ where });

    console.log(`[ADMIN POS] Deleted ALL ${deleted.count} POS products`);

    res.json({
      success: true,
      message: `Deleted all ${deleted.count} POS products`,
      deletedCount: deleted.count,
    });
  } catch (err) {
    console.error('[ADMIN POS] Delete all error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete all POS products',
      details: err.message,
    });
  }
});

// ─── CASHIER ACCOUNT MANAGEMENT ─────────────────────────────────────────────

/**
 * GET /api/admin/cashiers
 * List all cashier user accounts.
 */
router.get('/cashiers', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const cashiers = await prisma.user.findMany({
      where: { role: 'cashier', isActive: true },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, cashiers });
  } catch (err) {
    console.error('[ADMIN CASHIERS] List failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to list cashier accounts' });
  }
});

/**
 * POST /api/admin/cashiers
 * Create a new cashier user account.
 * Body: { name, email, password }
 */
router.post('/cashiers', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'A user with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const cashier = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: 'cashier',
        emailVerified: true,
        isActive: true,
      },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return res.status(201).json({ success: true, cashier });
  } catch (err) {
    console.error('[ADMIN CASHIERS] Create failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create cashier account' });
  }
});

/**
 * PUT /api/admin/cashiers/:userId
 * Update a cashier's name, email, or password.
 * Body: { name?, email?, password? }
 */
router.put('/cashiers/:userId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const cashier = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, role: true, email: true },
    });

    if (!cashier || cashier.role !== 'cashier') {
      return res.status(404).json({ success: false, error: 'Cashier account not found' });
    }

    const { name, email, password } = req.body;
    const updateData = {};

    if (name) updateData.name = name.trim();

    if (email) {
      const emailTrimmed = email.trim().toLowerCase();
      if (emailTrimmed !== cashier.email) {
        const conflict = await prisma.user.findUnique({ where: { email: emailTrimmed } });
        if (conflict) {
          return res.status(409).json({ success: false, error: 'Email already in use by another account' });
        }
        updateData.email = emailTrimmed;
      }
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'No update fields provided' });
    }

    const updated = await prisma.user.update({
      where: { id: cashier.id },
      data: updateData,
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return res.json({ success: true, cashier: updated });
  } catch (err) {
    console.error('[ADMIN CASHIERS] Update failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update cashier account' });
  }
});

/**
 * DELETE /api/admin/cashiers/:userId
 * Permanently delete a cashier account.
 */
router.delete('/cashiers/:userId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const cashier = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, role: true, name: true },
    });

    if (!cashier || cashier.role !== 'cashier') {
      return res.status(404).json({ success: false, error: 'Cashier account not found' });
    }

    await prisma.user.delete({ where: { id: cashier.id } });

    return res.json({ success: true, message: `Cashier account "${cashier.name}" deleted successfully` });
  } catch (err) {
    console.error('[ADMIN CASHIERS] Delete failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete cashier account' });
  }
});

// ─── CASHIER SECURITY PIN (Admin Managed) ───────────────────────────────────

/**
 * GET /api/admin/security-key/cashier/:userId/status
 * Returns whether the selected cashier has a PIN configured.
 */
router.get('/security-key/cashier/:userId/status', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const cashierUser = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, role: true, cashierSecurityKeyHash: true, name: true },
    });

    if (!cashierUser || cashierUser.role !== 'cashier') {
      return res.status(404).json({ success: false, error: 'Cashier account not found' });
    }

    return res.json({
      success: true,
      hasSecurityKey: Boolean(cashierUser.cashierSecurityKeyHash),
      cashier: { id: cashierUser.id, name: cashierUser.name },
    });
  } catch (err) {
    console.error('[CASHIER SECURITY] Admin status check failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to check cashier security key status' });
  }
});

/**
 * PUT /api/admin/security-key/cashier/:userId
 * Set or replace a cashier's security PIN (admin can override without current key).
 * Body: { securityKey, confirmSecurityKey }
 */
router.put('/security-key/cashier/:userId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { securityKey, confirmSecurityKey } = req.body;

    if (!securityKey || !confirmSecurityKey) {
      return res.status(400).json({ success: false, error: 'Enter and confirm cashier security key are required' });
    }

    if (securityKey !== confirmSecurityKey) {
      return res.status(400).json({ success: false, error: 'Cashier security key confirmation does not match' });
    }

    if (securityKey.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Security key must be at least 4 characters' });
    }

    const cashierUser = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, role: true, name: true, cashierSecurityKeyHash: true },
    });

    if (!cashierUser || cashierUser.role !== 'cashier') {
      return res.status(404).json({ success: false, error: 'Cashier account not found' });
    }

    const newHash = await bcrypt.hash(securityKey, 10);

    await prisma.user.update({
      where: { id: cashierUser.id },
      data: { cashierSecurityKeyHash: newHash },
    });

    return res.json({
      success: true,
      message: cashierUser.cashierSecurityKeyHash
        ? 'Cashier security key changed successfully'
        : 'Cashier security key set successfully',
    });
  } catch (err) {
    console.error('[CASHIER SECURITY] Admin set/change key failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save cashier security key' });
  }
});

module.exports = router;
