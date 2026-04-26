'use strict';

const { ingestSuppliersFromPos } = require('../services/business-operations/supplierPosSync.service');

function isAuthorizedAgent(req) {
  const provided = req.headers['x-pos-secret'];
  const expected = process.env.POS_SECRET;
  return !!provided && !!expected && provided === expected;
}

async function receiveSuppliersFromPos(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const payload = req.body || {};
    if (!Array.isArray(payload.suppliers)) {
      return res.status(400).json({ success: false, error: 'suppliers array is required' });
    }

    const result = await ingestSuppliersFromPos(payload);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[POS SUPPLIER SYNC] receiveSuppliersFromPos failed:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to ingest POS suppliers',
    });
  }
}

module.exports = {
  receiveSuppliersFromPos,
};
