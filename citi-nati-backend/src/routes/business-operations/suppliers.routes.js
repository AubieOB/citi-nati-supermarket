'use strict';

const express = require('express');
const {
  createSupplier,
  updateSupplier,
  getSupplierById,
  listSuppliers,
  deleteSupplier,
  createSupplierTransaction,
  updateSupplierTransaction,
  listSupplierTransactions,
  deleteSupplierTransaction,
  getSupplierBalance,
  importSuppliers,
} = require('../../controllers/business-operations/suppliers.controller');

const router = express.Router();

router.post('/import', importSuppliers);

router.post('/transactions', createSupplierTransaction);
router.put('/transactions/:id', updateSupplierTransaction);
router.delete('/transactions/:id', deleteSupplierTransaction);
router.get('/transactions/list', listSupplierTransactions);

router.post('/', createSupplier);
router.put('/:id', updateSupplier);
router.delete('/:id', deleteSupplier);
router.get('/:id', getSupplierById);
router.get('/', listSuppliers);

router.get('/:id/balance', getSupplierBalance);

module.exports = router;
