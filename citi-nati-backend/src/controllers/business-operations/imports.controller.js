'use strict';

const { processWorkbookUpload } = require('../../services/business-operations/workbookImport.service');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function getSections(req) {
  if (Array.isArray(req.body.sections)) return req.body.sections;
  if (typeof req.body.sections === 'string') return req.body.sections;
  if (typeof req.query.sections === 'string') return req.query.sections;
  return null;
}

async function handleWorkbookImport(req, res, workbookType) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Workbook file is required (form-data field: workbook)' });
    }

    const parseOnly = parseBoolean(req.body.parseOnly ?? req.query.parseOnly, false);
    const sections = getSections(req);

    const response = await processWorkbookUpload({
      fileBuffer: req.file.buffer,
      workbookType,
      parseOnly,
      sections,
    });

    const statusCode = response.errors && response.errors.length ? 207 : 200;
    return res.status(statusCode).json(response);
  } catch (err) {
    console.error('[BO][IMPORTS] handleWorkbookImport error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Workbook import failed' });
  }
}

async function uploadPayrollWorkbook(req, res) {
  return handleWorkbookImport(req, res, 'payroll');
}

async function uploadBusinessWorkbook(req, res) {
  return handleWorkbookImport(req, res, 'business');
}

async function parseOnlyWorkbook(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Workbook file is required (form-data field: workbook)' });
    }

    const workbookType = req.body.workbookType || req.query.workbookType;
    if (!workbookType || !['payroll', 'business'].includes(String(workbookType).toLowerCase())) {
      return res.status(400).json({ success: false, error: "workbookType is required and must be 'payroll' or 'business'" });
    }

    const response = await processWorkbookUpload({
      fileBuffer: req.file.buffer,
      workbookType: String(workbookType).toLowerCase(),
      parseOnly: true,
      sections: getSections(req),
    });

    const statusCode = response.errors && response.errors.length ? 207 : 200;
    return res.status(statusCode).json(response);
  } catch (err) {
    console.error('[BO][IMPORTS] parseOnlyWorkbook error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Workbook parse failed' });
  }
}

function getImportStatus(req, res) {
  return res.json({
    success: true,
    data: {
      supportedWorkbookTypes: ['payroll', 'business'],
      supportedExtensions: ['.xlsx', '.xls'],
      uploadFieldName: 'workbook',
      endpoints: {
        payrollWorkbook: '/api/business-operations/imports/payroll-workbook',
        businessWorkbook: '/api/business-operations/imports/business-workbook',
        parseOnly: '/api/business-operations/imports/parse-only',
      },
      payrollRecognizedSheets: [
        'Biodata',
        'Pay Sheet',
        'Final',
        'Terminations',
        'Wages',
        'LoanSchedule',
        'Combined Pay',
        'Res-Workers',
        'Shop-Workers',
        'Reengagement Wages',
      ],
      businessRecognizedSheets: [
        'Sales Input',
        'Consolidated Sales',
        'Expenses Report',
        'Suppliers Report',
        'Summary',
      ],
      notes: [
        'Use parseOnly=true for preview mode on payroll/business upload endpoints',
        'Use sections query/body to run staged imports by entity',
      ],
    },
  });
}

module.exports = {
  uploadPayrollWorkbook,
  uploadBusinessWorkbook,
  parseOnlyWorkbook,
  getImportStatus,
};
