'use strict';

const multer = require('multer');
const path = require('path');

const allowedMimes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

const allowedExtensions = new Set(['.xlsx', '.xls']);

const uploadWorkbook = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
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

module.exports = uploadWorkbook;
