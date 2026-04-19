const express = require('express');
const {
  getPendingEmergencySalesForPosSync,
  ackEmergencySaleSynced,
  ackEmergencySaleSyncFailed,
} = require('../controllers/emergencySales.controller');
const { receiveReportingInvoices, receiveLatestProductCosts } = require('../controllers/reportingSync.controller');
const { requireTrustedAgent } = require('../middleware/agentAuth.middleware');

const router = express.Router();

router.use(requireTrustedAgent);

router.get('/pending-emergency-sales', getPendingEmergencySalesForPosSync);
router.post('/ack-emergency-sale-synced', ackEmergencySaleSynced);
router.post('/ack-emergency-sale-failed', ackEmergencySaleSyncFailed);
router.post('/reporting/invoices', receiveReportingInvoices);
router.post('/reporting/latest-product-costs', receiveLatestProductCosts);

module.exports = router;
