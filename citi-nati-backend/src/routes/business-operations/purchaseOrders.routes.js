'use strict';

const express = require('express');
const {
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrderById,
  listPurchaseOrders,
} = require('../../controllers/business-operations/purchaseOrders.controller');

const router = express.Router();

router.get('/', listPurchaseOrders);
router.get('/:id', getPurchaseOrderById);
router.post('/', createPurchaseOrder);
router.put('/:id', updatePurchaseOrder);
router.delete('/:id', deletePurchaseOrder);

module.exports = router;
