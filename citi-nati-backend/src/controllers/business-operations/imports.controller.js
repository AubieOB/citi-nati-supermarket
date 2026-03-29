'use strict';

const { processWorkbookUpload } = require('../../services/business-operations/workbookImport.service');

function buildFileMeta(file) {
  if (!file) return null;
  return {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  };
}

function createErrorResponse({
  stage,
  message,
  details = {},
  detectedSheets = [],
  workbookTypeReceived = null,
  fileMeta = null,
}) {
  return {
    success: false,
    stage,
    message,
    details,
    detectedSheets,
    workbookTypeReceived,
    fileMeta,
  };
}

function normalizeWorkbookType(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).toLowerCase();
}

function logImportRequestStart(routeName, workbookTypeReceived, fileMeta) {
  console.info('[BO][IMPORTS] route hit', {
    route: routeName,
    workbookType: workbookTypeReceived,
    fileOriginalName: fileMeta?.originalname || null,
    fileMimeType: fileMeta?.mimetype || null,
    fileSize: fileMeta?.size || null,
  });
}

function logProcessingResult(routeName, response) {
  console.info('[BO][IMPORTS] processing completed', {
    route: routeName,
    workbookType: response?.workbookType || null,
    detectedSheets: response?.detectedSheets || [],
    selectedParser: response?.workbookType === 'payroll' ? 'parsePayrollWorkbook' : response?.workbookType === 'business' ? 'parseBusinessWorkbook' : null,
    parseOnly: Boolean(response?.parseOnly),
    warningsCount: Array.isArray(response?.warnings) ? response.warnings.length : 0,
    errorsCount: Array.isArray(response?.errors) ? response.errors.length : 0,
  });
}

function logStageFailure(routeName, err, workbookTypeReceived, fileMeta) {
  const stage = err?.stage || 'import-orchestration';
  console.error('[BO][IMPORTS] stage failure', {
    route: routeName,
    stage,
    workbookType: workbookTypeReceived,
    fileOriginalName: fileMeta?.originalname || null,
    fileMimeType: fileMeta?.mimetype || null,
    fileSize: fileMeta?.size || null,
    detectedSheets: err?.detectedSheets || [],
    selectedParser: workbookTypeReceived === 'payroll' ? 'parsePayrollWorkbook' : workbookTypeReceived === 'business' ? 'parseBusinessWorkbook' : null,
    details: err?.details || {},
    message: err?.message,
    stack: err?.stack,
  });
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function getSections(req) {
  if (Array.isArray(req.body.sections)) return req.body.sections;
  if (typeof req.body.sections === 'string') {
    try {
      const parsed = JSON.parse(req.body.sections);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      // Fall back to comma-delimited parsing in service.
    }
    return req.body.sections;
  }
  if (typeof req.query.sections === 'string') return req.query.sections;
  return null;
}

async function handleWorkbookImport(req, res, workbookType) {
  const routeName = workbookType === 'payroll' ? 'uploadPayrollWorkbook' : 'uploadBusinessWorkbook';
  const fileMeta = buildFileMeta(req.file);
  logImportRequestStart(routeName, workbookType, fileMeta);

  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json(createErrorResponse({
        stage: 'upload',
        message: 'No workbook file received',
        details: {
          expectedFieldName: 'workbook',
          receivedFieldName: req.file?.fieldname || null,
          hint: 'Send multipart/form-data with file field name "workbook"',
        },
        workbookTypeReceived: workbookType,
        fileMeta,
      }));
    }

    const parseOnly = parseBoolean(req.body.parseOnly ?? req.query.parseOnly, false);
    const sections = getSections(req);

    const response = await processWorkbookUpload({
      fileBuffer: req.file.buffer,
      workbookType,
      parseOnly,
      sections,
    });

    logProcessingResult(routeName, response);

    const statusCode = response.errors && response.errors.length ? 207 : 200;
    return res.status(statusCode).json(response);
  } catch (err) {
    logStageFailure(routeName, err, workbookType, fileMeta);

    const stage = err.stage || 'import-orchestration';
    const statusCode = stage === 'workbook-type-validation' || stage === 'upload' ? 400 : 500;

    return res.status(statusCode).json(createErrorResponse({
      stage,
      message: err.clientMessage || err.message || 'Workbook import failed',
      details: err.details || {},
      detectedSheets: err.detectedSheets || [],
      workbookTypeReceived: workbookType,
      fileMeta,
    }));
  }
}

async function uploadPayrollWorkbook(req, res) {
  return handleWorkbookImport(req, res, 'payroll');
}

async function uploadBusinessWorkbook(req, res) {
  return handleWorkbookImport(req, res, 'business');
}

async function parseOnlyWorkbook(req, res) {
  const routeName = 'parseOnlyWorkbook';
  const workbookTypeReceived = normalizeWorkbookType(req.body.workbookType || req.query.workbookType);
  const fileMeta = buildFileMeta(req.file);
  logImportRequestStart(routeName, workbookTypeReceived, fileMeta);

  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json(createErrorResponse({
        stage: 'upload',
        message: 'No workbook file received',
        details: {
          expectedFieldName: 'workbook',
          receivedFieldName: req.file?.fieldname || null,
          hint: 'Send multipart/form-data with file field name "workbook"',
        },
        workbookTypeReceived,
        fileMeta,
      }));
    }

    if (!workbookTypeReceived || !['payroll', 'business'].includes(workbookTypeReceived)) {
      return res.status(400).json(createErrorResponse({
        stage: 'workbook-type-validation',
        message: "workbookType is required and must be 'payroll' or 'business'",
        details: {
          allowedWorkbookTypes: ['payroll', 'business'],
        },
        workbookTypeReceived,
        fileMeta,
      }));
    }

    const response = await processWorkbookUpload({
      fileBuffer: req.file.buffer,
      workbookType: workbookTypeReceived,
      parseOnly: true,
      sections: getSections(req),
    });

    logProcessingResult(routeName, response);

    const statusCode = response.errors && response.errors.length ? 207 : 200;
    return res.status(statusCode).json(response);
  } catch (err) {
    logStageFailure(routeName, err, workbookTypeReceived, fileMeta);

    const stage = err.stage || 'parsing';
    const statusCode = stage === 'upload' || stage === 'workbook-type-validation' ? 400 : 500;

    return res.status(statusCode).json(createErrorResponse({
      stage,
      message: err.clientMessage || err.message || 'Workbook parse failed',
      details: err.details || {},
      detectedSheets: err.detectedSheets || [],
      workbookTypeReceived,
      fileMeta,
    }));
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
