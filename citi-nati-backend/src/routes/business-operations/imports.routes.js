'use strict';

const express = require('express');
const multer = require('multer');
const uploadWorkbook = require('../../middlewares/uploadWorkbook');
const {
  uploadPayrollWorkbook,
  uploadBusinessWorkbook,
  parseOnlyWorkbook,
  getImportStatus,
} = require('../../controllers/business-operations/imports.controller');

const router = express.Router();

function uploadSingleWorkbook(req, res, next) {
  const middleware = uploadWorkbook.single('workbook');
  middleware(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Workbook file too large. Max size is 20MB' });
      }
      return res.status(400).json({ success: false, error: err.message });
    }

    return res.status(400).json({ success: false, error: err.message || 'Invalid upload request' });
  });
}

router.post('/payroll-workbook', uploadSingleWorkbook, uploadPayrollWorkbook);
router.post('/business-workbook', uploadSingleWorkbook, uploadBusinessWorkbook);
router.post('/parse-only', uploadSingleWorkbook, parseOnlyWorkbook);
router.get('/templates-or-status', getImportStatus);

module.exports = router;
