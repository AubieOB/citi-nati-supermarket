const express = require('express');
const {
  startSalesDay,
  endSalesDay,
  getCurrentSalesDay,
  getSalesDayById,
  getSalesDayHistory,
  exportSaleDayCSV
} = require('../controllers/sales.controller');
const { verifyTokenMiddleware, authorizeRoles } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication and ADMIN role
// POST /api/sales/start - Start a new sales day
router.post(
  '/start',
  verifyTokenMiddleware,
  authorizeRoles('admin'),
  startSalesDay
);

// POST /api/sales/end - End current sales day
router.post(
  '/end',
  verifyTokenMiddleware,
  authorizeRoles('admin'),
  endSalesDay
);

// GET /api/sales/current - Get current open sales day
router.get(
  '/current',
  verifyTokenMiddleware,
  authorizeRoles('admin'),
  getCurrentSalesDay
);

// GET /api/sales/history - Get all closed sales days
router.get(
  '/history',
  verifyTokenMiddleware,
  authorizeRoles('admin'),
  getSalesDayHistory
);

// GET /api/sales/:id - Get sales day details
router.get(
  '/:id',
  verifyTokenMiddleware,
  authorizeRoles('admin'),
  getSalesDayById
);

// GET /api/sales/:id/export - Export sales day as CSV
router.get(
  '/:id/export',
  verifyTokenMiddleware,
  authorizeRoles('admin'),
  exportSaleDayCSV
);

module.exports = router;
