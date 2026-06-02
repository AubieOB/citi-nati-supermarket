const { ingestReportingBatch, ingestLatestProductCosts, ingestPosStockIntakes } = require('../services/reportingSyncIngest.service');
const { recordPosSyncEvent } = require('../services/posSyncMonitor.service');
const logger = require('../utils/logger');

function deriveAgentLocationCode(branchCode, payloadLocationCode) {
  const normalizedBranchCode = String(branchCode || '').trim().toUpperCase();
  const normalizedPayloadLocationCode = String(payloadLocationCode || '').trim().toUpperCase();

  if (normalizedPayloadLocationCode) {
    return normalizedPayloadLocationCode;
  }

  if (normalizedBranchCode === 'ZOMBA') {
    return 'SH';
  }

  if (normalizedBranchCode === 'BLANTYRE') {
    return 'BT';
  }

  return null;
}

async function recordReportingMonitorEvent(payload = {}) {
  try {
    await recordPosSyncEvent(payload);
  } catch (eventErr) {
    logger.warnLog('[REPORTING SYNC] monitor event record failed:', { message: eventErr.message });
  }
}

function isAuthorizedAgent(req) {
  const provided = req.headers['x-pos-secret'];
  const expected = process.env.POS_SECRET;
  return !!provided && !!expected && provided === expected;
}

function isFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

function validateInvoice(invoice, index) {
  const errors = [];

  if (!invoice || typeof invoice !== 'object') {
    return [`invoices[${index}] must be an object`];
  }

  if (!Number.isInteger(Number(invoice.invoiceNo)) || Number(invoice.invoiceNo) <= 0) {
    errors.push(`invoices[${index}].invoiceNo must be a positive integer`);
  }

  if (!Array.isArray(invoice.details)) {
    errors.push(`invoices[${index}].details must be an array`);
  } else {
    invoice.details.forEach((detail, detailIndex) => {
      if (!Number.isInteger(Number(detail.invDetailId)) || Number(detail.invDetailId) <= 0) {
        errors.push(`invoices[${index}].details[${detailIndex}].invDetailId must be a positive integer`);
      }

      ['qty', 'unitPrice', 'amount', 'taxAmount', 'discountAmount', 'costPrice'].forEach((field) => {
        if (detail[field] !== undefined && detail[field] !== null && !isFiniteNumber(detail[field])) {
          errors.push(`invoices[${index}].details[${detailIndex}].${field} must be numeric`);
        }
      });
    });
  }

  ['grossSale', 'vat', 'discount', 'netSale', 'tenAmt1', 'tenAmt2', 'levyAmount', 'discountAmount'].forEach((field) => {
    if (invoice[field] !== undefined && invoice[field] !== null && !isFiniteNumber(invoice[field])) {
      errors.push(`invoices[${index}].${field} must be numeric`);
    }
  });

  return errors;
}

function validateReportingPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return ['Payload must be a JSON object'];
  }

  if (!payload.branchCode || typeof payload.branchCode !== 'string') {
    errors.push('branchCode is required');
  }

  if (!payload.branchName || typeof payload.branchName !== 'string') {
    errors.push('branchName is required');
  }

  if (!payload.syncSourceCode || typeof payload.syncSourceCode !== 'string') {
    errors.push('syncSourceCode is required');
  }

  if (!Array.isArray(payload.invoices)) {
    errors.push('invoices must be an array');
  } else {
    payload.invoices.forEach((invoice, index) => {
      errors.push(...validateInvoice(invoice, index));
    });
  }

  return errors;
}

function validateLatestProductCostsPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return ['Payload must be a JSON object'];
  }

  if (!payload.branchCode || typeof payload.branchCode !== 'string') {
    errors.push('branchCode is required');
  }

  if (!payload.branchName || typeof payload.branchName !== 'string') {
    errors.push('branchName is required');
  }

  if (!payload.syncSourceCode || typeof payload.syncSourceCode !== 'string') {
    errors.push('syncSourceCode is required');
  }

  if (!Array.isArray(payload.latestProductCosts)) {
    errors.push('latestProductCosts must be an array');
  } else {
    payload.latestProductCosts.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`latestProductCosts[${index}] must be an object`);
        return;
      }

      if (!item.productCode || typeof item.productCode !== 'string') {
        errors.push(`latestProductCosts[${index}].productCode is required`);
      }

      if (item.latestUnitCost !== undefined && item.latestUnitCost !== null && !isFiniteNumber(item.latestUnitCost)) {
        errors.push(`latestProductCosts[${index}].latestUnitCost must be numeric`);
      }
    });
  }

  return errors;
}

function validatePosStockIntakesPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return ['Payload must be a JSON object'];
  }

  if (!payload.branchCode || typeof payload.branchCode !== 'string') {
    errors.push('branchCode is required');
  }

  if (!payload.branchName || typeof payload.branchName !== 'string') {
    errors.push('branchName is required');
  }

  if (!payload.syncSourceCode || typeof payload.syncSourceCode !== 'string') {
    errors.push('syncSourceCode is required');
  }

  if (!Array.isArray(payload.posStockIntakes)) {
    errors.push('posStockIntakes must be an array');
  } else {
    payload.posStockIntakes.forEach((grn, grnIndex) => {
      if (!grn || typeof grn !== 'object') {
        errors.push(`posStockIntakes[${grnIndex}] must be an object`);
        return;
      }

      if (!grn.grnNo || typeof grn.grnNo !== 'string') {
        errors.push(`posStockIntakes[${grnIndex}].grnNo is required`);
      }

      if (!Array.isArray(grn.items)) {
        errors.push(`posStockIntakes[${grnIndex}].items must be an array`);
      } else if (grn.items.length === 0) {
        errors.push(`posStockIntakes[${grnIndex}].items cannot be empty`);
      } else {
        grn.items.forEach((item, itemIndex) => {
          if (!item || typeof item !== 'object') {
            errors.push(`posStockIntakes[${grnIndex}].items[${itemIndex}] must be an object`);
            return;
          }

          if (!item.productCode || typeof item.productCode !== 'string') {
            errors.push(`posStockIntakes[${grnIndex}].items[${itemIndex}].productCode is required`);
          }

          if (!isFiniteNumber(item.quantity) || item.quantity <= 0) {
            errors.push(`posStockIntakes[${grnIndex}].items[${itemIndex}].quantity must be a positive number`);
          }

          if (item.unitCost !== undefined && item.unitCost !== null && !isFiniteNumber(item.unitCost)) {
            errors.push(`posStockIntakes[${grnIndex}].items[${itemIndex}].unitCost must be numeric`);
          }
        });
      }
    });
  }

  return errors;
}

async function receiveReportingInvoices(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const payload = req.body || {};
    const validationErrors = validateReportingPayload(payload);

    if (validationErrors.length > 0) {
      logger.warnLog('[REPORTING SYNC] Validation failed:', {
        syncSourceCode: payload.syncSourceCode,
        branchCode: payload.branchCode,
        errors: validationErrors,
      });
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors,
      });
    }

    const totalDetails = payload.invoices.reduce((sum, invoice) => {
      const details = Array.isArray(invoice.details) ? invoice.details.length : 0;
      return sum + details;
    }, 0);

    logger.debugLog('[REPORTING SYNC] Received reporting batch', {
      branchCode: payload.branchCode,
      branchName: payload.branchName,
      syncSourceCode: payload.syncSourceCode,
      invoices: payload.invoices.length,
      details: totalDetails,
    });

    const result = await ingestReportingBatch(payload);

    await recordReportingMonitorEvent({
      eventType: 'agent-reporting-invoices',
      source: 'pos-sync-agent',
      status: 'success',
      level: 'info',
      title: 'Reporting invoices synced',
      message: `POS agent synced ${result.receivedInvoices} reporting invoice(s) with ${result.storedDetails + result.updatedDetails} detail row(s).`,
      suggestion: 'No action required.',
      metadata: {
        branchCode: String(payload.branchCode || '').trim().toUpperCase() || null,
        branchName: payload.branchName || null,
        locationCode: deriveAgentLocationCode(payload.branchCode, payload.locationCode),
        syncSourceCode: payload.syncSourceCode || null,
        receivedInvoices: result.receivedInvoices,
        storedInvoices: result.storedInvoices + result.updatedInvoices,
        storedDetails: result.storedDetails + result.updatedDetails,
      },
    });

    logger.debugLog('[REPORTING SYNC] Batch persisted', {
      branchCode: payload.branchCode,
      syncSourceCode: payload.syncSourceCode,
      receivedInvoices: result.receivedInvoices,
      storedInvoices: result.storedInvoices,
      updatedInvoices: result.updatedInvoices,
      storedDetails: result.storedDetails,
      updatedDetails: result.updatedDetails,
    });

    return res.status(200).json({
      success: true,
      receivedInvoices: result.receivedInvoices,
      storedInvoices: result.storedInvoices + result.updatedInvoices,
      insertedInvoices: result.storedInvoices,
      updatedInvoices: result.updatedInvoices,
      storedDetails: result.storedDetails + result.updatedDetails,
      insertedDetails: result.storedDetails,
      updatedDetails: result.updatedDetails,
      syncSourceCode: result.syncSourceCode,
    });
  } catch (error) {
    logger.errorLog('[REPORTING SYNC] Processing failed:', {
      message: error && error.message ? error.message : String(error),
      code: error && error.code ? error.code : null,
      statusCode: error && error.statusCode ? error.statusCode : null,
      meta: error && error.meta ? error.meta : null,
      stack: error && error.stack ? error.stack : null,
      branchCode: req.body && req.body.branchCode ? req.body.branchCode : null,
      invoiceCount: (req.body && Array.isArray(req.body.invoices) ? req.body.invoices.length : 0),
    });
    await recordReportingMonitorEvent({
      eventType: 'agent-reporting-invoices',
      source: 'pos-sync-agent',
      status: 'failed',
      level: 'error',
      title: 'Reporting invoice sync failed',
      message: 'The backend failed to process a reporting invoice batch from POS agent.',
      reason: error && error.message ? error.message : String(error),
      suggestion: 'Inspect reporting sync payload shape and backend ingest constraints.',
      metadata: {
        branchCode: req.body && req.body.branchCode ? String(req.body.branchCode).trim().toUpperCase() : null,
        branchName: req.body && req.body.branchName ? req.body.branchName : null,
        locationCode: deriveAgentLocationCode(req.body && req.body.branchCode, req.body && req.body.locationCode),
        syncSourceCode: req.body && req.body.syncSourceCode ? req.body.syncSourceCode : null,
        invoiceCount: req.body && Array.isArray(req.body.invoices) ? req.body.invoices.length : 0,
      },
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to process reporting sync batch',
      details: error && error.message ? error.message : String(error),
    });
  }
}

async function receiveLatestProductCosts(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const payload = req.body || {};
    const validationErrors = validateLatestProductCostsPayload(payload);

    if (validationErrors.length > 0) {
      logger.warnLog('[REPORTING SYNC][LATEST COSTS] Validation failed:', {
        syncSourceCode: payload.syncSourceCode,
        branchCode: payload.branchCode,
        errors: validationErrors,
      });
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors,
      });
    }

    logger.debugLog('[REPORTING SYNC][LATEST COSTS] Received latest product costs batch', {
      branchCode: payload.branchCode,
      branchName: payload.branchName,
      syncSourceCode: payload.syncSourceCode,
      products: payload.latestProductCosts.length,
    });

    const result = await ingestLatestProductCosts(payload);

    await recordReportingMonitorEvent({
      eventType: 'agent-reporting-latest-costs',
      source: 'pos-sync-agent',
      status: 'success',
      level: 'info',
      title: 'Latest product costs synced',
      message: `POS agent synced ${result.receivedProducts} latest product cost record(s).`,
      suggestion: 'No action required.',
      metadata: {
        branchCode: String(payload.branchCode || '').trim().toUpperCase() || null,
        branchName: payload.branchName || null,
        locationCode: deriveAgentLocationCode(payload.branchCode, payload.locationCode),
        syncSourceCode: payload.syncSourceCode || null,
        receivedProducts: result.receivedProducts,
        storedProducts: result.storedProducts + result.updatedProducts,
      },
    });

    return res.status(200).json({
      success: true,
      receivedProducts: result.receivedProducts,
      storedProducts: result.storedProducts + result.updatedProducts,
      insertedProducts: result.storedProducts,
      updatedProducts: result.updatedProducts,
      syncSourceCode: result.syncSourceCode,
    });
  } catch (error) {
    logger.errorLog('[REPORTING SYNC][LATEST COSTS] Processing failed:', { message: error.message });

    await recordReportingMonitorEvent({
      eventType: 'agent-reporting-latest-costs',
      source: 'pos-sync-agent',
      status: 'failed',
      level: 'error',
      title: 'Latest product costs sync failed',
      message: 'The backend failed to process latest product cost payload from POS agent.',
      reason: error.message,
      suggestion: 'Review SQL permissions/columns and agent-side latest cost query compatibility.',
      metadata: {
        branchCode: req.body && req.body.branchCode ? String(req.body.branchCode).trim().toUpperCase() : null,
        branchName: req.body && req.body.branchName ? req.body.branchName : null,
        locationCode: deriveAgentLocationCode(req.body && req.body.branchCode, req.body && req.body.locationCode),
        syncSourceCode: req.body && req.body.syncSourceCode ? req.body.syncSourceCode : null,
        productCount: req.body && Array.isArray(req.body.latestProductCosts) ? req.body.latestProductCosts.length : 0,
      },
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to process latest product cost sync batch',
      details: error.message,
    });
  }
}

async function receivePosStockIntakes(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const payload = req.body || {};
    const validationErrors = validatePosStockIntakesPayload(payload);

    if (validationErrors.length > 0) {
      logger.warnLog('[REPORTING SYNC][POS GRNS] Validation failed:', {
        syncSourceCode: payload.syncSourceCode,
        branchCode: payload.branchCode,
        errors: validationErrors,
      });
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors,
      });
    }

    const totalItems = payload.posStockIntakes.reduce((sum, grn) => {
      const items = Array.isArray(grn.items) ? grn.items.length : 0;
      return sum + items;
    }, 0);

    logger.debugLog('[REPORTING SYNC][POS GRNS] Received POS stock intakes batch', {
      branchCode: payload.branchCode,
      branchName: payload.branchName,
      syncSourceCode: payload.syncSourceCode,
      grns: payload.posStockIntakes.length,
      items: totalItems,
    });

    const result = await ingestPosStockIntakes(payload);

    await recordReportingMonitorEvent({
      eventType: 'agent-reporting-pos-grns',
      source: 'pos-sync-agent',
      status: 'success',
      level: 'info',
      title: 'POS stock intakes synced',
      message: `POS agent synced ${result.receivedGrns} GRN(s) with ${result.storedItems + result.updatedItems} item row(s).`,
      suggestion: 'No action required.',
      metadata: {
        branchCode: String(payload.branchCode || '').trim().toUpperCase() || null,
        branchName: payload.branchName || null,
        locationCode: deriveAgentLocationCode(payload.branchCode, payload.locationCode),
        syncSourceCode: payload.syncSourceCode || null,
        receivedGrns: result.receivedGrns,
        storedGrns: result.storedGrns + result.updatedGrns,
        storedItems: result.storedItems + result.updatedItems,
      },
    });

    logger.debugLog('[REPORTING SYNC][POS GRNS] Batch persisted', {
      branchCode: payload.branchCode,
      syncSourceCode: payload.syncSourceCode,
      receivedGrns: result.receivedGrns,
      storedGrns: result.storedGrns,
      updatedGrns: result.updatedGrns,
      storedItems: result.storedItems,
      updatedItems: result.updatedItems,
    });

    return res.status(200).json({
      success: true,
      receivedGrns: result.receivedGrns,
      storedGrns: result.storedGrns + result.updatedGrns,
      insertedGrns: result.storedGrns,
      updatedGrns: result.updatedGrns,
      storedItems: result.storedItems + result.updatedItems,
      insertedItems: result.storedItems,
      updatedItems: result.updatedItems,
      syncSourceCode: result.syncSourceCode,
    });
  } catch (error) {
    logger.errorLog('[REPORTING SYNC][POS GRNS] Processing failed:', { message: error.message });

    await recordReportingMonitorEvent({
      eventType: 'agent-reporting-pos-grns',
      source: 'pos-sync-agent',
      status: 'failed',
      level: 'error',
      title: 'POS stock intakes sync failed',
      message: 'The backend failed to process POS GRN payload from POS agent.',
      reason: error.message,
      suggestion: 'Review POS GRN payload structure and backend ingest constraints.',
      metadata: {
        branchCode: req.body && req.body.branchCode ? String(req.body.branchCode).trim().toUpperCase() : null,
        branchName: req.body && req.body.branchName ? req.body.branchName : null,
        locationCode: deriveAgentLocationCode(req.body && req.body.branchCode, req.body && req.body.locationCode),
        syncSourceCode: req.body && req.body.syncSourceCode ? req.body.syncSourceCode : null,
        grnCount: req.body && Array.isArray(req.body.posStockIntakes) ? req.body.posStockIntakes.length : 0,
      },
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to process POS stock intakes sync batch',
      details: error.message,
    });
  }
}

module.exports = {
  receiveReportingInvoices,
  receiveLatestProductCosts,
  receivePosStockIntakes,
};
