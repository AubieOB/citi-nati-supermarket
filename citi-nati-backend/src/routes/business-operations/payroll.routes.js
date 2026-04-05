'use strict';

const express = require('express');
const multer = require('multer');
const uploadWorkbook = require('../../middlewares/uploadWorkbook');
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
  purgeAllPayrollData,
  deletePayrollPeriod,
  deletePayrollEntry,
  deleteEmployeeLoan,
  deleteLoanTransaction,
  deleteTermination,
  deleteReengagement,
  deleteTaxBracket,
  deleteIncrementPolicy,
  exportPayrollSnapshot,
  importPayrollSnapshot,
  exportFullBackupZip,
  exportFullWorkbook,
  importFullWorkbook,
} = require('../../controllers/business-operations/payroll.controller');

const router = express.Router();

function buildUploadErrorResponse({ message, details = {}, fileMeta = null }) {
  return {
    success: false,
    stage: 'upload',
    error: message,
    details,
    fileMeta,
  };
}

function uploadSingleWorkbook(req, res, next) {
  const middleware = uploadWorkbook.single('workbook');
  middleware(req, res, (err) => {
    if (!err) return next();

    const fileMeta = req.file
      ? {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        }
      : null;

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json(buildUploadErrorResponse({
          message: `Workbook file too large. Max size is ${Math.round(uploadWorkbook.MAX_WORKBOOK_FILE_SIZE_BYTES / (1024 * 1024))}MB`,
          details: { multerCode: err.code },
          fileMeta,
        }));
      }

      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json(buildUploadErrorResponse({
          message: 'Unexpected upload field name. Use form-data field "workbook"',
          details: {
            multerCode: err.code,
            expectedFieldName: 'workbook',
            receivedFieldName: err.field || null,
          },
          fileMeta,
        }));
      }

      return res.status(400).json(buildUploadErrorResponse({
        message: err.message,
        details: { multerCode: err.code },
        fileMeta,
      }));
    }

    return res.status(400).json(buildUploadErrorResponse({
      message: err.message || 'Invalid upload request',
      details: { expectedFieldName: 'workbook' },
      fileMeta,
    }));
  });
}

router.post('/import/periods', importPayrollPeriods);
router.post('/import/entries', importPayrollEntries);
router.post('/import/loans', importLoans);
router.post('/import/terminations', importTerminations);
router.post('/import/reengagements', importReengagements);

router.post('/periods', createPayrollPeriod);
router.put('/periods/:id', updatePayrollPeriod);
router.delete('/periods/:id', deletePayrollPeriod);
router.get('/periods/:id', getPayrollPeriodById);
router.get('/periods', listPayrollPeriods);

router.post('/entries', createPayrollEntry);
router.put('/entries/:id', updatePayrollEntry);
router.delete('/entries/:id', deletePayrollEntry);
router.get('/entries/:id', getPayrollEntryById);
router.get('/entries', listPayrollEntries);

router.post('/loans', createEmployeeLoan);
router.put('/loans/:id', updateEmployeeLoan);
router.delete('/loans/:id', deleteEmployeeLoan);
router.get('/loans/:id', getEmployeeLoanById);
router.get('/loans', listEmployeeLoans);

router.post('/loan-transactions', createLoanTransaction);
router.put('/loan-transactions/:id', updateLoanTransaction);
router.delete('/loan-transactions/:id', deleteLoanTransaction);
router.get('/loan-transactions', listLoanTransactions);

router.post('/terminations', createTermination);
router.put('/terminations/:id', updateTermination);
router.delete('/terminations/:id', deleteTermination);
router.get('/terminations', listTerminations);

router.post('/reengagements', createReengagement);
router.put('/reengagements/:id', updateReengagement);
router.delete('/reengagements/:id', deleteReengagement);
router.get('/reengagements', listReengagements);

router.post('/tax-brackets', createTaxBracket);
router.put('/tax-brackets/:id', updateTaxBracket);
router.delete('/tax-brackets/:id', deleteTaxBracket);
router.get('/tax-brackets', listTaxBrackets);

router.post('/increment-policies', createIncrementPolicy);
router.put('/increment-policies/:id', updateIncrementPolicy);
router.delete('/increment-policies/:id', deleteIncrementPolicy);
router.get('/increment-policies', listIncrementPolicies);

router.delete('/purge', purgeAllPayrollData);

// Export/Import endpoints
router.get('/export/snapshot', exportPayrollSnapshot);
router.post('/import/snapshot', importPayrollSnapshot);
router.get('/export/backup-zip', exportFullBackupZip);
router.get('/export/full-workbook', exportFullWorkbook);
router.post('/import/full-workbook', uploadSingleWorkbook, importFullWorkbook);

module.exports = router;
