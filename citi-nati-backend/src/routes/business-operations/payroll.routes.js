'use strict';

const express = require('express');
const {
  createPayrollPeriod,
  updatePayrollPeriod,
  listPayrollPeriods,
  getPayrollPeriodById,
  createPayrollEntry,
  updatePayrollEntry,
  listPayrollEntries,
  getPayrollEntryById,
  createEmployeeLoan,
  updateEmployeeLoan,
  listEmployeeLoans,
  getEmployeeLoanById,
  createLoanTransaction,
  updateLoanTransaction,
  listLoanTransactions,
  createTermination,
  updateTermination,
  listTerminations,
  createReengagement,
  updateReengagement,
  listReengagements,
  createTaxBracket,
  updateTaxBracket,
  listTaxBrackets,
  createIncrementPolicy,
  updateIncrementPolicy,
  listIncrementPolicies,
  importPayrollPeriods,
  importPayrollEntries,
  importLoans,
  importTerminations,
  importReengagements,
} = require('../../controllers/business-operations/payroll.controller');

const router = express.Router();

router.post('/import/periods', importPayrollPeriods);
router.post('/import/entries', importPayrollEntries);
router.post('/import/loans', importLoans);
router.post('/import/terminations', importTerminations);
router.post('/import/reengagements', importReengagements);

router.post('/periods', createPayrollPeriod);
router.put('/periods/:id', updatePayrollPeriod);
router.get('/periods/:id', getPayrollPeriodById);
router.get('/periods', listPayrollPeriods);

router.post('/entries', createPayrollEntry);
router.put('/entries/:id', updatePayrollEntry);
router.get('/entries/:id', getPayrollEntryById);
router.get('/entries', listPayrollEntries);

router.post('/loans', createEmployeeLoan);
router.put('/loans/:id', updateEmployeeLoan);
router.get('/loans/:id', getEmployeeLoanById);
router.get('/loans', listEmployeeLoans);

router.post('/loan-transactions', createLoanTransaction);
router.put('/loan-transactions/:id', updateLoanTransaction);
router.get('/loan-transactions', listLoanTransactions);

router.post('/terminations', createTermination);
router.put('/terminations/:id', updateTermination);
router.get('/terminations', listTerminations);

router.post('/reengagements', createReengagement);
router.put('/reengagements/:id', updateReengagement);
router.get('/reengagements', listReengagements);

router.post('/tax-brackets', createTaxBracket);
router.put('/tax-brackets/:id', updateTaxBracket);
router.get('/tax-brackets', listTaxBrackets);

router.post('/increment-policies', createIncrementPolicy);
router.put('/increment-policies/:id', updateIncrementPolicy);
router.get('/increment-policies', listIncrementPolicies);

module.exports = router;
