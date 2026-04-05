const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyCashier } = require('../middleware/cashier.middleware');
const {
  lookupEmergencyProducts,
  createEmergencySale,
  listEmergencySales,
  downloadEmergencySaleReceiptPDF,
} = require('../controllers/emergencySales.controller');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Cashier Security PIN (self-service) ────────────────────────────────────

/**
 * GET /api/cashier/security-key/status
 * Returns whether this cashier account has a PIN configured.
 */
router.get('/security-key/status', verifyTokenMiddleware, verifyCashier, async (req, res) => {
  try {
    const cashierUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { cashierSecurityKeyHash: true },
    });

    return res.json({
      success: true,
      hasSecurityKey: Boolean(cashierUser?.cashierSecurityKeyHash),
    });
  } catch (err) {
    console.error('[CASHIER SECURITY] Status check failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to check cashier security key status' });
  }
});

/**
 * POST /api/cashier/security-key/verify
 * Verify this cashier's own PIN before allowing POS access.
 */
router.post('/security-key/verify', verifyTokenMiddleware, verifyCashier, async (req, res) => {
  try {
    const { securityKey } = req.body;

    if (!securityKey || typeof securityKey !== 'string') {
      return res.status(400).json({ success: false, error: 'Security key is required' });
    }

    const cashierUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { cashierSecurityKeyHash: true },
    });

    if (!cashierUser?.cashierSecurityKeyHash) {
      return res.status(400).json({ success: false, error: 'No cashier security key configured yet' });
    }

    const isValid = await bcrypt.compare(securityKey, cashierUser.cashierSecurityKeyHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid security key' });
    }

    return res.json({ success: true, verified: true });
  } catch (err) {
    console.error('[CASHIER SECURITY] Verification failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to verify cashier security key' });
  }
});

// ─── Cashier Emergency Sales ─────────────────────────────────────────────────

// All routes below require cashier auth
router.use(verifyTokenMiddleware, verifyCashier);

/**
 * GET /api/cashier/emergency-sales/lookup
 * Product lookup for POS scanner.
 */
router.get('/emergency-sales/lookup', lookupEmergencyProducts);

/**
 * POST /api/cashier/emergency-sales
 * Create a new emergency sale (cashier is the authenticated user).
 */
router.post('/emergency-sales', createEmergencySale);

/**
 * GET /api/cashier/emergency-sales/:id/receipt.pdf
 * Download receipt as PDF for a specific emergency sale.
 */
router.get('/emergency-sales/:id/receipt.pdf', downloadEmergencySaleReceiptPDF);

/**
 * GET /api/cashier/emergency-sales
 * List only this cashier's own sales.
 */
router.get('/emergency-sales', (req, res, next) => {
  // Restrict list to this cashier's own sales by injecting their userId as cashier filter
  req.query.cashier = req.user.userId;
  next();
}, listEmergencySales);

/**
 * GET /api/cashier/emergency-sales/:id
 * Get a specific sale — cashier can only view their own sale.
 */
router.get('/emergency-sales/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid emergency sale id' });

    const sale = await prisma.emergencySale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) return res.status(404).json({ success: false, error: 'Emergency sale not found' });

    // Cashiers may only see their own sales
    if (sale.cashierId !== req.user.userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    return res.status(200).json({ success: true, sale });
  } catch (err) {
    console.error('[CASHIER] get sale by id failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch emergency sale' });
  }
});

module.exports = router;
