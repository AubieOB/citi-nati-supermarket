'use strict';

const multer = require('multer');
const path = require('path');

const MAX_WORKBOOK_FILE_SIZE_BYTES = Math.max(
  1 * 1024 * 1024,
  Number(process.env.WORKBOOK_UPLOAD_MAX_BYTES || 20 * 1024 * 1024)
);

const allowedMimes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

const allowedExtensions = new Set(['.xlsx', '.xls']);

const uploadWorkbook = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_WORKBOOK_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeOk = allowedMimes.has(file.mimetype);
    const extOk = allowedExtensions.has(ext);

    if (!extOk) {
      return cb(new Error('Unsupported file extension. Allowed: .xlsx, .xls'), false);
    }

    if (!mimeOk && file.mimetype) {
      return cb(new Error('Unsupported file type for workbook upload'), false);
    }

    return cb(null, true);
  },
});

uploadWorkbook.MAX_WORKBOOK_FILE_SIZE_BYTES = MAX_WORKBOOK_FILE_SIZE_BYTES;

module.exports = uploadWorkbook;
