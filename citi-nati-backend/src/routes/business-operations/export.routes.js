'use strict';

const express = require('express');
const { exportExcel, exportPdf } = require('../../controllers/business-operations/export.controller');
const { exportFullWorkbook } = require('../../controllers/business-operations/payroll.controller');

const router = express.Router();

router.post('/excel', exportExcel);
router.post('/pdf', exportPdf);
router.get('/full-workbook', exportFullWorkbook);

module.exports = router;
