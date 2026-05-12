const express = require('express');
const {
  getPendingEmergencySalesForPosSync,
  ackEmergencySaleSynced,
  ackEmergencySaleSyncFailed,
} = require('../controllers/emergencySales.controller');
const { receiveReportingInvoices, receiveLatestProductCosts, receivePosStockIntakes } = require('../controllers/reportingSync.controller');
const { receiveSuppliersFromPos } = require('../controllers/supplierPosSync.controller');
const { requireTrustedAgent } = require('../middleware/agentAuth.middleware');

const router = express.Router();
const { backfillSales } = require('../controllers/posAgentBackfill.controller');

router.use(requireTrustedAgent);

router.get('/pending-emergency-sales', getPendingEmergencySalesForPosSync);
router.post('/ack-emergency-sale-synced', ackEmergencySaleSynced);
router.post('/ack-emergency-sale-failed', ackEmergencySaleSyncFailed);
router.post('/reporting/invoices', receiveReportingInvoices);
router.post('/reporting/latest-product-costs', receiveLatestProductCosts);
router.post('/reporting/pos-grns', receivePosStockIntakes);
router.post('/suppliers/pull', receiveSuppliersFromPos);
router.post('/sales/backfill', backfillSales);

module.exports = router;
