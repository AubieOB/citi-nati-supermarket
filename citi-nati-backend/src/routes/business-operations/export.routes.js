'use strict';

const express = require('express');
const { exportExcel, exportPdf } = require('../../controllers/business-operations/export.controller');

const router = express.Router();

router.post('/excel', exportExcel);
router.post('/pdf', exportPdf);

module.exports = router;
