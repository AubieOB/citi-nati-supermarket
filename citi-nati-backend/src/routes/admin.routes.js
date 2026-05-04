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
const { verifyAdmin, verifyAdminRole } = require('../middleware/admin.middleware');
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
const {
  normalizeScopeCode,
  expandLocationScopeCodes: expandOperationalLocationScopeCodes,
  deriveBranchCodeFromLocationCode,
  ZOMBA_LOCATION_CODES: CORE_ZOMBA_LOCATION_CODES,
} = require('../utils/operationalScope');
const { PERMISSION_GROUPS, ALL_PERMISSION_KEYS, ROLE_DEFAULT_PERMISSIONS, isValidPermissionKey } = require('../security/permissions');
const { getPermissionSnapshotForUser } = require('../security/userPermissions.service');
const { requirePermission } = require('../middleware/permissions.middleware');
const { validateStrongPassword } = require('../utils/passwordPolicy');
const { recordAuditLog } = require('../services/auditLog.service');
const {
  getEmergencySalesDayOpen,
  setEmergencySalesDayOpen,
} = require('../utils/emergencySalesAccess');
const {
  MINIMUM_ORDER_VALUE_KEY,
  normalizeMinimumOrderValue,
  clearCheckoutRulesCache,
  getMinimumOrderValue,
} = require('../utils/checkoutRules');

const router = express.Router();
const prisma = new PrismaClient();
const MAINTENANCE_MODE_KEY = 'maintenance_mode_enabled';
const MAINTENANCE_MESSAGE_KEY = 'maintenance_mode_message';
const DEFAULT_MAINTENANCE_MESSAGE = 'We are currently carrying out maintenance to improve your experience. We apologize for the inconvenience.';

function normalizeLocationCode(value) {
  // Handle cases like "SH:1" by extracting the location code before the colon
  const cleanValue = String(value || '').trim().split(':')[0];
  return normalizeScopeCode(cleanValue);
}

const BRANCH_CODE_ALIASES = {
  ZOMBA: 'ZOMBA',
  ZA: 'ZOMBA',
  ZOMBA_SH: 'ZOMBA',
  ZOMBA_BAR: 'ZOMBA',
  ZOMBA_RES: 'ZOMBA',
  BLANTYRE: 'BLANTYRE',
  BT: 'BLANTYRE',
  BLANTYRE_SH: 'BLANTYRE',
};

function normalizeBranchCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  return BRANCH_CODE_ALIASES[normalized] || normalized;
}

const ZOMBA_LOCATION_CODES = ['ZA'].concat(CORE_ZOMBA_LOCATION_CODES);

function isConcreteZombaOperationalLocationCode(locationCode) {
  return CORE_ZOMBA_LOCATION_CODES.includes(String(locationCode || '').trim().toUpperCase());
}

function expandLocationScopeCodes(locationCode) {
  return expandOperationalLocationScopeCodes(locationCode);
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
  for (const code of scopeCodes) {
    const branchCode = deriveBranchCodeFromLocationCode(code);
    if (branchCode) return branchCode;
  }
  return null;
}

async function resolveLocationScopedProductCodesFromSales(scopeCodes = []) {
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
    return [];
  }

  // Preserve branch-level fallback only for legacy Blantyre rows.
  const derivedBranchCode = scopeCodes.includes('BT')
    ? deriveBranchCodeFromScopeCodes(scopeCodes)
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

async function resolveLocationScopedProductCodesFromLatestCosts(scopeCodes = []) {
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
    return [];
  }

  // Preserve branch-level fallback only for legacy Blantyre rows.
  const derivedBranchCode = scopeCodes.includes('BT')
    ? deriveBranchCodeFromScopeCodes(scopeCodes)
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

async function resolveLocationScopedProductCodes(locationCode) {
  const scopeCodes = expandLocationScopeCodes(locationCode);
  if (scopeCodes.length === 0) return null;

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

  const costCodes = await resolveLocationScopedProductCodesFromLatestCosts(scopeCodes);
  costCodes.forEach((code) => scopedCodes.add(code));

  const salesCodes = await resolveLocationScopedProductCodesFromSales(scopeCodes);
  salesCodes.forEach((code) => scopedCodes.add(code));

  const isZombaScope = scopeCodes.some((code) => CORE_ZOMBA_LOCATION_CODES.includes(code));
  if (isZombaScope) {
    console.log('[ADMIN POS][SCOPE][ZOMBA] code-source diagnostics', {
      scopeCodes,
      expiryDistinctCount: expiryRows.length,
      latestCostDistinctCount: costCodes.length,
      salesDistinctCount: salesCodes.length,
      combinedDistinctCount: scopedCodes.size,
    });
  }

  if (scopedCodes.size === 0 && scopeCodes.includes('BT')) {
    const legacyRows = await prisma.product.findMany({
      where: { sourceCode: { not: null } },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });

    legacyRows
      .map((row) => String(row.sourceCode || '').trim())
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
  }

  // Zomba fallback: if no activity-table records exist yet for the requested
  // Zomba location, fall back to products stored with branchCode='ZOMBA' AND
  // the specific locationCode (SH/BAR/ST999).
  if (scopedCodes.size === 0 && isZombaScope) {
    const locationWhere = buildLocationCodeScopeWhere(scopeCodes);
    const zombaRows = await prisma.product.findMany({
      where: { 
        branchCode: 'ZOMBA', 
        sourceCode: { not: null },
        ...(locationWhere || {})
      },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });
    zombaRows
      .map((row) => String(row.sourceCode || '').trim())
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
    console.log('[ADMIN POS][ZOMBA_SCOPE][FALLBACK] fell back to Product table branchCode=ZOMBA + locationCodes', {
      scopeCodes,
      fallbackCodeCount: scopedCodes.size,
    });
  }

  return Array.from(scopedCodes.values());
}

const getSettingValue = async (key, fallbackValue) => {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  return setting ? setting.value : fallbackValue;
};

const getEmergencySalesDayLastChange = async () => {
  const latest = await prisma.securityAuditLog.findFirst({
    where: {
      action: {
        in: ['EMERGENCY_SALES_DAY_OPENED', 'EMERGENCY_SALES_DAY_CLOSED'],
      },
      resourceType: 'SYSTEM_SETTING',
      resourceId: 'emergency_sales_day_open',
    },
    orderBy: { createdAt: 'desc' },
    select: {
      action: true,
      createdAt: true,
      actorUserId: true,
      actorUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!latest) {
    return null;
  }

  return {
    action: latest.action,
    changedAt: latest.createdAt,
    actorUserId: latest.actorUserId || latest.actorUser?.id || null,
    actorName: latest.actorUser?.name || null,
    actorEmail: latest.actorUser?.email || null,
  };
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
      id: req.user.userId,
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
    const selectedLocationCode = normalizeLocationCode(req.query.locationCode || 'SH');
    if (!productCode) {
      return res.status(400).json({ success: false, error: 'productCode is required' });
    }
    if (!isConcreteZombaOperationalLocationCode(selectedLocationCode)) {
      return res.status(400).json({
        success: false,
        error: 'locationCode must be one of SH, BAR, or ST999',
      });
    }

    const [product, latestLocationBatch] = await Promise.all([
      prisma.product.findFirst({
        where: {
          branchCode: 'ZOMBA',
          sourceCode: productCode,
          locationCode: {
            equals: selectedLocationCode,
            mode: 'insensitive',
          },
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
            equals: selectedLocationCode,
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
        locationCode: selectedLocationCode,
        source: 'StockDetailsLive preferred, DailyStockBalance fallback (agent-enforced)',
      },
      product: product || null,
      latestLocationBatchSyncMeta: latestLocationBatch || null,
      trace: {
        sourceUsed: 'PersistedProduct.stock from POS agent push',
        finalStockReturned: Number(product?.stock || 0),
      },
    };

    console.log('[ZOMBA STOCK][TRACE ENDPOINT]', {
      productCode,
      selectedLocation: req.query.locationCode || '(none)',
      resolvedStockLocation: selectedLocationCode,
      source: payload.zombaOperationalRule.source,
      locationCode: selectedLocationCode,
      finalStockReturned: payload.trace.finalStockReturned,
      productUpdatedAt: product?.updatedAt || null,
      latestLocationBatchSyncedAt: latestLocationBatch?.lastSyncedAt || null,
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
    const [maintenanceEnabled, maintenanceMessage, vatSettings, emergencySalesDayOpen, emergencySalesDayLastChange, minimumOrderValue] = await Promise.all([
      getSettingValue(MAINTENANCE_MODE_KEY, 'false'),
      getSettingValue(MAINTENANCE_MESSAGE_KEY, DEFAULT_MAINTENANCE_MESSAGE),
      getVatSettings(),
      getEmergencySalesDayOpen(prisma),
      getEmergencySalesDayLastChange(),
      getMinimumOrderValue(prisma),
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
        minimumOrderValue,
        emergencySalesDayOpen,
        emergencySalesDayLastChange,
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
    const minimumOrderInput = req.body?.minimumOrderValue;
    const currentMinimumOrderValue = await getMinimumOrderValue(prisma);
    const minimumOrderValue = minimumOrderInput === undefined
      ? currentMinimumOrderValue
      : normalizeMinimumOrderValue(minimumOrderInput, Number.NaN);

    if (!Number.isFinite(minimumOrderValue) || minimumOrderValue < 0) {
      return res.status(400).json({ success: false, error: 'Minimum order value must be a valid non-negative number.' });
    }

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
      prisma.siteSetting.upsert({
        where: { key: MINIMUM_ORDER_VALUE_KEY },
        update: { value: String(minimumOrderValue) },
        create: { key: MINIMUM_ORDER_VALUE_KEY, value: String(minimumOrderValue) },
      }),
    ]);

    clearVatSettingsCache();
    clearCheckoutRulesCache();
    const vatSettings = await getVatSettings(true);
    const updatedMinimumOrderValue = await getMinimumOrderValue(prisma, true);
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
        minimumOrderValue: updatedMinimumOrderValue,
        businessTime,
      },
    });
  } catch (err) {
    console.error('[ADMIN SYSTEM] Failed to update maintenance mode:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update maintenance mode' });
  }
});

router.put('/system/emergency-sales-day', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const emergencySalesDayOpen = Boolean(req.body?.emergencySalesDayOpen);

    await setEmergencySalesDayOpen(prisma, emergencySalesDayOpen);

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId,
      action: emergencySalesDayOpen ? 'EMERGENCY_SALES_DAY_OPENED' : 'EMERGENCY_SALES_DAY_CLOSED',
      resourceType: 'SYSTEM_SETTING',
      resourceId: 'emergency_sales_day_open',
      status: 'SUCCESS',
      metadata: {
        emergencySalesDayOpen,
      },
    });

    const emergencySalesDayLastChange = await getEmergencySalesDayLastChange();

    return res.json({
      success: true,
      message: emergencySalesDayOpen
        ? 'Emergency sales day opened. Cashiers can use the emergency sales dashboard.'
        : 'Emergency sales day closed. Cashier emergency sales dashboard is now locked.',
      settings: {
        emergencySalesDayOpen,
        emergencySalesDayLastChange,
      },
    });
  } catch (err) {
    console.error('[ADMIN SYSTEM] Failed to update emergency sales day:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update emergency sales day state' });
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
 * Uses verifyAdminRole to allow access even if user lacks ADMIN_DASHBOARD_ACCESS permission
 */
router.get('/security-key/status', verifyTokenMiddleware, verifyAdminRole, async (req, res) => {
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
 * Uses verifyAdminRole to allow access even if user lacks ADMIN_DASHBOARD_ACCESS permission
 */
router.post('/security-key/verify', verifyTokenMiddleware, verifyAdminRole, async (req, res) => {
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
 * GET /api/admin/permissions/catalog
 * Get permission groups and role defaults for admin permission editor UI.
 */
router.get(
  '/permissions/catalog',
  verifyTokenMiddleware,
  verifyAdmin,
  requirePermission('admin.users.manage_permissions'),
  async (_req, res) => {
    try {
      return res.json({
        success: true,
        groups: PERMISSION_GROUPS,
        allPermissionKeys: ALL_PERMISSION_KEYS,
        roleDefaults: ROLE_DEFAULT_PERMISSIONS,
      });
    } catch (err) {
      console.error('[ADMIN PERMISSIONS] Failed to load catalog:', err);
      return res.status(500).json({ error: 'Failed to load permissions catalog' });
    }
  }
);

/**
 * GET /api/admin/users/:userId/permissions
 * Get explicit and effective permission values for one user.
 */
router.get(
  '/users/:userId/permissions',
  verifyTokenMiddleware,
  verifyAdmin,
  requirePermission('admin.users.manage_permissions'),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const snapshot = await getPermissionSnapshotForUser(user.id, user.role);
      return res.json({
        success: true,
        user,
        ...snapshot,
      });
    } catch (err) {
      console.error('[ADMIN PERMISSIONS] Failed to fetch user permissions:', err);
      return res.status(500).json({ error: 'Failed to fetch user permissions' });
    }
  }
);

/**
 * PUT /api/admin/users/:userId/permissions
 * Upsert per-user permission overrides.
 * Body: { permissions: [{ key, allowed }], reason?: string }
 */
router.put(
  '/users/:userId/permissions',
  verifyTokenMiddleware,
  verifyAdmin,
  requirePermission('admin.users.manage_permissions'),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { permissions, reason } = req.body;

      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: 'permissions must be an array' });
      }

      const adminUserId = req.user.userId;
      if (userId === adminUserId) {
        return res.status(400).json({ error: 'You cannot edit your own permission overrides' });
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });

      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const existingOverrides = await prisma.userPermission.findMany({
        where: { userId },
        select: { permissionKey: true, allowed: true },
      });
      const existingMap = new Map(existingOverrides.map((item) => [item.permissionKey, item.allowed]));

      const normalizedUpdates = [];
      for (const entry of permissions) {
        const key = String(entry?.key || '').trim();
        if (!isValidPermissionKey(key)) {
          return res.status(400).json({ error: `Invalid permission key: ${key}` });
        }

        const rawAllowed = entry?.allowed;
        const allowed = rawAllowed === null || rawAllowed === undefined ? null : Boolean(rawAllowed);
        normalizedUpdates.push({ key, allowed });
      }

      await prisma.$transaction(async (tx) => {
        for (const update of normalizedUpdates) {
          const previousValue = existingMap.has(update.key) ? existingMap.get(update.key) : null;
          const hasChanged = previousValue !== update.allowed;

          if (!hasChanged) {
            continue;
          }

          if (update.allowed === null) {
            await tx.userPermission.deleteMany({
              where: { userId, permissionKey: update.key },
            });
          } else {
            await tx.userPermission.upsert({
              where: {
                userId_permissionKey: {
                  userId,
                  permissionKey: update.key,
                },
              },
              update: {
                allowed: update.allowed,
              },
              create: {
                userId,
                permissionKey: update.key,
                allowed: update.allowed,
              },
            });
          }

          await tx.permissionAuditLog.create({
            data: {
              actorUserId: adminUserId,
              targetUserId: userId,
              permissionKey: update.key,
              previousValue,
              newValue: update.allowed,
              reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : null,
              metadata: {
                roleAtChange: targetUser.role,
              },
            },
          });
        }
      });

      const snapshot = await getPermissionSnapshotForUser(targetUser.id, targetUser.role);
      await recordAuditLog({
        req,
        actorUserId: adminUserId,
        action: 'ADMIN_PERMISSION_OVERRIDES_UPDATED',
        resourceType: 'USER',
        resourceId: targetUser.id,
        status: 'SUCCESS',
        metadata: {
          updatedPermissionCount: normalizedUpdates.length,
          reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : null,
        },
      });
      return res.json({
        success: true,
        message: 'User permissions updated successfully',
        ...snapshot,
      });
    } catch (err) {
      console.error('[ADMIN PERMISSIONS] Failed to update user permissions:', err);
      return res.status(500).json({ error: 'Failed to update user permissions' });
    }
  }
);

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
    if (userId === req.user.userId) {
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

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId,
      action: 'ADMIN_USER_ROLE_UPDATED',
      resourceType: 'USER',
      resourceId: user.id,
      status: 'SUCCESS',
      metadata: {
        previousRole: userBefore.role,
        newRole: role,
      },
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
    if (userId === req.user.userId) {
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

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId,
      action: 'ADMIN_USER_DELETED',
      resourceType: 'USER',
      resourceId: existingUser.id,
      status: 'SUCCESS',
      metadata: {
        email: existingUser.email,
        role: existingUser.role,
      },
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
    const normalizedBranchCode = normalizeBranchCode(branchCode);

    // Build where clause
    const where = {
      sourceCode: { not: null }, // Only POS products
      price: { gt: 0 }, // Only show products with price > 0
    };

    if (normalizedLocationCode) {
      const scopeCodes = expandLocationScopeCodes(normalizedLocationCode);
      const derivedBranchCode = deriveBranchCodeFromScopeCodes(scopeCodes);
      const rawParam = String(locationCode || '').trim().toUpperCase();
      const resWasMapped = (rawParam === 'RES' || rawParam === 'ZOMBA_RES') && normalizedLocationCode === 'ST999';

      if (derivedBranchCode === 'ZOMBA') {
        // For Zomba, require explicit branchCode if locationCode is ambiguous (SH)
        const resolvedLocationCode = normalizedLocationCode;
        const isAmbiguousSH = resolvedLocationCode === 'SH';
        const requiresExplicitBranch = isAmbiguousSH && !normalizedBranchCode;
        
        if (requiresExplicitBranch) {
          console.warn('[PRODUCT QUERY][POS_MANAGEMENT][AMBIGUOUS_ZOMBA_SCOPE]', {
            view: 'POS Management / Stock panel',
            selectedLocation: locationCode || '(none)',
            normalizedLocation: normalizedLocationCode,
            scopeCodes,
            reason: 'branchCode is required for SH because SH exists in multiple branches.',
          });
          return res.status(400).json({
            success: false,
            error: 'branchCode is required for SH because SH exists in multiple branches.',
          });
        }

        if (!isConcreteZombaOperationalLocationCode(resolvedLocationCode)) {
          console.warn('[PRODUCT QUERY][POS_MANAGEMENT][INVALID_ZOMBA_SCOPE]', {
            view: 'POS Management / Stock panel',
            selectedLocation: locationCode || '(none)',
            normalizedLocation: normalizedLocationCode,
            scopeCodes,
            reason: 'Concrete locationCode required for Zomba stock reads (SH|BAR|ST999)',
          });
          return res.status(400).json({
            success: false,
            error: 'Concrete locationCode is required for Zomba stock reads (use SH, BAR, or ST999)',
          });
        }

        where.branchCode = normalizedBranchCode || 'ZOMBA';
        where.locationCode = {
          equals: resolvedLocationCode,
          mode: 'insensitive',
        };
        where.sourceCode = { not: null };

        console.log('[PRODUCT QUERY][POS_MANAGEMENT]', {
          view: 'POS Management / Stock panel',
          uiLocation: locationCode || '(none)',
          selectedLocation: normalizedLocationCode,
          resolvedStockLocation: resolvedLocationCode,
          branchCode: normalizedBranchCode || 'ZOMBA',
          locationCode: resolvedLocationCode,
          querySource: 'PersistedProduct.stock',
          resAlias: resWasMapped ? 'RES->ST999' : null,
        });
      } else {
        const scopedProductCodes = await resolveLocationScopedProductCodes(normalizedLocationCode);
        const explicitBranchCode = normalizedBranchCode || derivedBranchCode;
        console.log('[PRODUCT QUERY][POS_MANAGEMENT]', {
          uiLocation: locationCode || '(none)',
          branchCode: explicitBranchCode || '(any)',
          locationCode: normalizedLocationCode,
          scopedCodeCount: scopedProductCodes ? scopedProductCodes.length : 0,
        });
        if (!scopedProductCodes || scopedProductCodes.length === 0) {
          return res.json({
            success: true,
            products: [],
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: 0,
          });
        }

        where.sourceCode = { in: scopedProductCodes };
        if (explicitBranchCode) {
          where.branchCode = explicitBranchCode;
        }
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
        locationCode: true,
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

    console.log('[PRODUCT RESULT COUNT]', products.length);

    const isZombaScope = normalizedLocationCode && ZOMBA_LOCATION_CODES.includes(normalizedLocationCode);
    if (isZombaScope && products.length > 0) {
      const sample = products[0];
      console.log(`[ZOMBA STOCK][POS_MANAGEMENT] selectedLocation=${locationCode || '(none)'} resolvedStockLocation=${normalizedLocationCode} querySource=PersistedProduct.stock product=${sample.sourceCode || 'UNKNOWN'} stock=${Number(sample.stock || 0)}`);
      const verifyProduct = products.find((row) => String(row.sourceCode || '').trim() === '9501100002174');
      if (verifyProduct) {
        console.log(`[ZOMBA STOCK][VERIFY][POS_MANAGEMENT] selectedLocation=${locationCode || '(none)'} resolvedStockLocation=${normalizedLocationCode} querySource=PersistedProduct.stock product=9501100002174 stock=${Number(verifyProduct.stock || 0)}`);
      }
    }

    const servedAtIso = new Date().toISOString();
    res.set('x-stock-data-source', 'db-live');
    res.set('x-stock-served-at', servedAtIso);
    console.log('[ADMIN POS][FRESHNESS]', {
      endpoint: '/api/admin/pos-products',
      locationCode: normalizedLocationCode || null,
      source: 'db-live',
      servedAt: servedAtIso,
      rowCount: products.length,
      total,
    });

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
    const normalizedBranchCode = normalizeBranchCode(req.query.branchCode || req.body?.branchCode);

    if (normalizedLocationCode) {
      // For ambiguous Zomba locations, require explicit branchCode
      if (normalizedLocationCode === 'SH' && !normalizedBranchCode) {
        return res.status(400).json({
          success: false,
          error: 'branchCode is required for SH because SH exists in multiple branches.',
        });
      }

      const product = await prisma.product.findUnique({
        where: { id: parseInt(id) },
        select: { sourceCode: true, branchCode: true, locationCode: true },
      });

      if (!product?.sourceCode) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      // For Zomba, validate exact branch/location match
      if (normalizedBranchCode === 'ZOMBA' || product.branchCode === 'ZOMBA') {
        if (product.branchCode !== (normalizedBranchCode || 'ZOMBA')) {
          return res.status(400).json({ 
            success: false, 
            error: 'Product branch does not match the specified branchCode' 
          });
        }
        if (product.locationCode !== normalizedLocationCode) {
          return res.status(400).json({ 
            success: false, 
            error: 'Product location does not match the specified locationCode' 
          });
        }
      } else {
        const scopedCodes = await resolveLocationScopedProductCodes(normalizedLocationCode);
        if (!scopedCodes || !scopedCodes.includes(product.sourceCode)) {
          return res.status(400).json({ success: false, error: 'Product is not available in the selected location scope' });
        }
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
    const normalizedBranchCode = normalizeBranchCode(req.query.branchCode || req.body?.branchCode);

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

    if (normalizedLocationCode) {
      // For ambiguous Zomba locations, require explicit branchCode
      if (normalizedLocationCode === 'SH' && !normalizedBranchCode) {
        return res.status(400).json({
          success: false,
          error: 'branchCode is required for SH because SH exists in multiple branches.',
        });
      }

      const scopeCodes = expandLocationScopeCodes(normalizedLocationCode);
      const derivedBranchCode = deriveBranchCodeFromScopeCodes(scopeCodes);

      if (derivedBranchCode === 'ZOMBA') {
        const resolvedLocationCode = normalizedLocationCode;
        if (!isConcreteZombaOperationalLocationCode(resolvedLocationCode)) {
          return res.status(400).json({ success: false, error: 'Concrete locationCode is required for Zomba delete scope (use SH, BAR, or ST999)' });
        }
        where.branchCode = normalizedBranchCode || 'ZOMBA';
        where.locationCode = {
          equals: resolvedLocationCode,
          mode: 'insensitive',
        };
      } else {
        const scopedCodes = await resolveLocationScopedProductCodes(normalizedLocationCode);
        if (!scopedCodes || scopedCodes.length === 0) {
          return res.json({ success: true, message: 'No POS products found for selected location', deletedCount: 0 });
        }
        where.sourceCode = { in: scopedCodes };
        const explicitBranchCode = normalizedBranchCode || derivedBranchCode;
        if (explicitBranchCode) {
          where.branchCode = explicitBranchCode;
        }
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
    const normalizedBranchCode = normalizeBranchCode(req.query.branchCode || req.body?.branchCode);
    const where = {
      sourceCode: { not: null }, // Only POS products
    };

    if (normalizedLocationCode) {
      // For ambiguous Zomba locations, require explicit branchCode
      if (normalizedLocationCode === 'SH' && !normalizedBranchCode) {
        return res.status(400).json({
          success: false,
          error: 'branchCode is required for SH because SH exists in multiple branches.',
        });
      }

      const scopeCodes = expandLocationScopeCodes(normalizedLocationCode);
      const derivedBranchCode = deriveBranchCodeFromScopeCodes(scopeCodes);

      if (derivedBranchCode === 'ZOMBA') {
        const resolvedLocationCode = normalizedLocationCode;
        if (!isConcreteZombaOperationalLocationCode(resolvedLocationCode)) {
          return res.status(400).json({ success: false, error: 'Concrete locationCode is required for Zomba delete scope (use SH, BAR, or ST999)' });
        }
        where.branchCode = normalizedBranchCode || 'ZOMBA';
        where.locationCode = {
          equals: resolvedLocationCode,
          mode: 'insensitive',
        };
      } else {
        const scopedCodes = await resolveLocationScopedProductCodes(normalizedLocationCode);
        if (!scopedCodes || scopedCodes.length === 0) {
          return res.json({ success: true, message: 'No POS products found for selected location', deletedCount: 0 });
        }
        where.sourceCode = { in: scopedCodes };
        const explicitBranchCode = normalizedBranchCode || derivedBranchCode;
        if (explicitBranchCode) {
          where.branchCode = explicitBranchCode;
        }
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

    const passwordValidation = validateStrongPassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ success: false, error: passwordValidation.errors[0] });
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

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId,
      action: 'ADMIN_CASHIER_CREATED',
      resourceType: 'USER',
      resourceId: cashier.id,
      status: 'SUCCESS',
      metadata: { role: 'cashier', email: cashier.email },
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
      const passwordValidation = validateStrongPassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ success: false, error: passwordValidation.errors[0] });
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

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId,
      action: 'ADMIN_CASHIER_UPDATED',
      resourceType: 'USER',
      resourceId: updated.id,
      status: 'SUCCESS',
      metadata: { updatedFields: Object.keys(updateData) },
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

    await recordAuditLog({
      req,
      actorUserId: req.user?.userId,
      action: 'ADMIN_CASHIER_DELETED',
      resourceType: 'USER',
      resourceId: cashier.id,
      status: 'SUCCESS',
      metadata: { name: cashier.name },
    });

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
