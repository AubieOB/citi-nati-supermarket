'use strict';

const express = require('express');
const router = express.Router();

const {
  getInventoryActivityLedger,
} = require('../../controllers/business-operations/inventoryActivity.controller');

// Main ledger endpoint
router.get('/ledger', getInventoryActivityLedger);

module.exports = router;