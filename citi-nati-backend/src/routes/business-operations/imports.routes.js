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

function buildUploadErrorResponse({ message, details = {}, fileMeta = null }) {
  return {
    success: false,
    stage: 'upload',
    message,
    details,
    detectedSheets: [],
    workbookTypeReceived: null,
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
          message: 'Workbook file too large. Max size is 20MB',
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

router.post('/payroll-workbook', uploadSingleWorkbook, uploadPayrollWorkbook);
router.post('/business-workbook', uploadSingleWorkbook, uploadBusinessWorkbook);
router.post('/parse-only', uploadSingleWorkbook, parseOnlyWorkbook);
router.get('/templates-or-status', getImportStatus);

module.exports = router;
