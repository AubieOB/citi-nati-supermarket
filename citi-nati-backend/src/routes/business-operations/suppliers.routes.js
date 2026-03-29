'use strict';

const express = require('express');
const {
  createSupplier,
  updateSupplier,
  getSupplierById,
  listSuppliers,
  createSupplierTransaction,
  updateSupplierTransaction,
  listSupplierTransactions,
  getSupplierBalance,
  importSuppliers,
} = require('../../controllers/business-operations/suppliers.controller');

const router = express.Router();

router.post('/import', importSuppliers);

router.post('/transactions', createSupplierTransaction);
router.put('/transactions/:id', updateSupplierTransaction);
router.get('/transactions/list', listSupplierTransactions);

router.post('/', createSupplier);
router.put('/:id', updateSupplier);
router.get('/:id', getSupplierById);
router.get('/', listSuppliers);

router.get('/:id/balance', getSupplierBalance);

module.exports = router;
