const express = require('express');
const {
  startSalesDay,
  endSalesDay,
  getCurrentSalesDay,
  getSalesDayById,
  getSalesDayHistory,
  exportSaleDayCSV,
  clearSalesHistory,
  exportSalesSnapshot,
  importSalesSnapshot
} = require('../controllers/sales.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

// All routes require authentication and ADMIN role via verifyAdmin middleware
// POST /api/sales/start - Start a new sales day
router.post(
  '/start',
  verifyTokenMiddleware,
  verifyAdmin,
  startSalesDay
);

// POST /api/sales/end - End current sales day
router.post(
  '/end',
  verifyTokenMiddleware,
  verifyAdmin,
  endSalesDay
);

// GET /api/sales/current - Get current open sales day
router.get(
  '/current',
  verifyTokenMiddleware,
  verifyAdmin,
  getCurrentSalesDay
);

// GET /api/sales/history - Get all closed sales days
router.get(
  '/history',
  verifyTokenMiddleware,
  verifyAdmin,
  getSalesDayHistory
);

// GET /api/sales/:id - Get sales day details
router.get(
  '/:id',
  verifyTokenMiddleware,
  verifyAdmin,
  getSalesDayById
);

// GET /api/sales/:id/export - Export sales day as CSV
router.get(
  '/:id/export',
  verifyTokenMiddleware,
  verifyAdmin,
  exportSaleDayCSV
);

// DELETE /api/sales/history - Clear all sales history
router.delete(
  '/history',
  verifyTokenMiddleware,
  verifyAdmin,
  clearSalesHistory
);

// GET /api/sales/export/snapshot - Export complete sales data
router.get(
  '/export/snapshot',
  verifyTokenMiddleware,
  verifyAdmin,
  exportSalesSnapshot
);

// POST /api/sales/import/snapshot - Import complete sales data
router.post(
  '/import/snapshot',
  verifyTokenMiddleware,
  verifyAdmin,
  importSalesSnapshot
);

module.exports = router;
