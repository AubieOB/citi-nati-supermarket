'use strict';

/**
 * Business Operations – Reporting Routes
 *
 * All routes are protected by verifyToken (authenticated) + verifyAdmin (admin role).
 *
 * Mounted at: /api/business-operations
 *
 * Available endpoints:
 *   GET /reports/sales/summary   – aggregated metrics for period + filters
 *   GET /reports/sales/invoices  – paginated invoice list
 *   GET /reports/sales/products  – product-level aggregations
 *   GET /reports/sales/users     – cashier/user aggregations
 *   GET /reports/sales/payments  – payment-method summary
 *   GET /reports/sales/profit-latest-cost – profit analytics using latest finalized GRN cost per product
 *
 * Common query params (all endpoints):
 *   periodType = day | week | month | quarter | year | custom  (required)
 *   date       = YYYY-MM-DD   (required for day / week)
 *   month      = 1-12         (required for month)
 *   year       = YYYY         (required for year / quarter; defaults to current year for month/quarter)
 *   quarter    = 1-4          (required for quarter)
 *   startDate  = YYYY-MM-DD   (required for custom)
 *   endDate    = YYYY-MM-DD   (required for custom)
 *
 * Optional dimension filters:
 *   branchCode, syncSourceCode, locationCode, locationId,
 *   userName, productCode, productName, payMethod, invoiceType
 *
 * Pagination / sort (detail endpoints):
 *   page, pageSize, sortBy, sortOrder
 */

const express = require('express');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const {
  getSalesSummary,
  getSalesInvoices,
  getSalesProducts,
  getSalesUsers,
  getSalesPayments,
  getSalesProfitLatestCost,
} = require('../controllers/salesReporting.controller');
const { listBusinessLocations } = require('../controllers/business-operations/locations.controller');
const { resetImportedData, wipeAllData } = require('../controllers/business-operations/adminReset.controller');
const suppliersRoutes = require('./business-operations/suppliers.routes');
const expensesRoutes = require('./business-operations/expenses.routes');
const employeesRoutes = require('./business-operations/employees.routes');
const payrollRoutes = require('./business-operations/payroll.routes');
const importsRoutes = require('./business-operations/imports.routes');
const exportRoutes = require('./business-operations/export.routes');
const goodsIntakeRoutes = require('./business-operations/goodsIntake.routes');

const router = express.Router();

// Apply authentication + admin guard to every route in this group
router.use(verifyTokenMiddleware, verifyAdmin);

// Reporting endpoints
router.get('/locations', listBusinessLocations);
router.get('/reports/sales/summary', getSalesSummary);
router.get('/reports/sales/invoices', getSalesInvoices);
router.get('/reports/sales/products', getSalesProducts);
router.get('/reports/sales/users', getSalesUsers);
router.get('/reports/sales/payments', getSalesPayments);
router.get('/reports/sales/profit-latest-cost', getSalesProfitLatestCost);

// Admin safety endpoint for workbook-import cleanup.
router.post('/admin/reset-imported-data', resetImportedData);
router.post('/admin/wipe-all-data', wipeAllData);

// Import-first foundation endpoints
router.use('/suppliers', suppliersRoutes);
router.use('/expenses', expensesRoutes);
router.use('/employees', employeesRoutes);
router.use('/payroll', payrollRoutes);
router.use('/imports', importsRoutes);
router.use('/export', exportRoutes);
router.use('/goods-intake', goodsIntakeRoutes);

module.exports = router;
