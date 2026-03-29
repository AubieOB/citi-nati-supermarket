const express = require('express');
const {
  getPendingEmergencySalesForPosSync,
  ackEmergencySaleSynced,
  ackEmergencySaleSyncFailed,
} = require('../controllers/emergencySales.controller');
const { receiveReportingInvoices } = require('../controllers/reportingSync.controller');

const router = express.Router();

router.get('/pending-emergency-sales', getPendingEmergencySalesForPosSync);
router.post('/ack-emergency-sale-synced', ackEmergencySaleSynced);
router.post('/ack-emergency-sale-failed', ackEmergencySaleSyncFailed);
router.post('/reporting/invoices', receiveReportingInvoices);

module.exports = router;
