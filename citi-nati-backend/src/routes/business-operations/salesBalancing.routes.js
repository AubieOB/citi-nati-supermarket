'use strict';

const express = require('express');
const {
  getExpectedSales,
  createSalesBalancingRecord,
  updateSalesBalancingRecord,
  getSalesBalancingRecordById,
  listSalesBalancingRecords,
  finalizeSalesBalancingRecord,
} = require('../../controllers/business-operations/salesBalancing.controller');

const router = express.Router();

router.get('/expected', getExpectedSales);
router.get('/', listSalesBalancingRecords);
router.get('/:id', getSalesBalancingRecordById);
router.post('/', createSalesBalancingRecord);
router.put('/:id', updateSalesBalancingRecord);
router.post('/:id/finalize', finalizeSalesBalancingRecord);

module.exports = router;
