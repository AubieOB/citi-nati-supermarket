const { ingestReportingBatch, ingestLatestProductCosts } = require('../services/reportingSyncIngest.service');

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

async function receiveReportingInvoices(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const payload = req.body || {};
    const validationErrors = validateReportingPayload(payload);

    if (validationErrors.length > 0) {
      console.error('[REPORTING SYNC] Validation failed:', {
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

    console.log('[REPORTING SYNC] Received reporting batch', {
      branchCode: payload.branchCode,
      branchName: payload.branchName,
      syncSourceCode: payload.syncSourceCode,
      invoices: payload.invoices.length,
      details: totalDetails,
    });

    const result = await ingestReportingBatch(payload);

    console.log('[REPORTING SYNC] Batch persisted', {
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
    console.error('[REPORTING SYNC] Processing failed:', {
      message: error && error.message ? error.message : String(error),
      code: error && error.code ? error.code : null,
      statusCode: error && error.statusCode ? error.statusCode : null,
      meta: error && error.meta ? error.meta : null,
      stack: error && error.stack ? error.stack : null,
      branchCode: req.body && req.body.branchCode ? req.body.branchCode : null,
      invoiceCount: (req.body && Array.isArray(req.body.invoices) ? req.body.invoices.length : 0),
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
      console.error('[REPORTING SYNC][LATEST COSTS] Validation failed:', {
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

    console.log('[REPORTING SYNC][LATEST COSTS] Received latest product costs batch', {
      branchCode: payload.branchCode,
      branchName: payload.branchName,
      syncSourceCode: payload.syncSourceCode,
      products: payload.latestProductCosts.length,
    });

    const result = await ingestLatestProductCosts(payload);

    return res.status(200).json({
      success: true,
      receivedProducts: result.receivedProducts,
      storedProducts: result.storedProducts + result.updatedProducts,
      insertedProducts: result.storedProducts,
      updatedProducts: result.updatedProducts,
      syncSourceCode: result.syncSourceCode,
    });
  } catch (error) {
    console.error('[REPORTING SYNC][LATEST COSTS] Processing failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to process latest product cost sync batch',
      details: error.message,
    });
  }
}

module.exports = {
  receiveReportingInvoices,
  receiveLatestProductCosts,
};
