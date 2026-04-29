'use strict';

const {
  getInventoryActivityLedgerData,
} = require('../../services/business-operations/inventoryActivity.service');

async function getInventoryActivityLedger(req, res) {
  try {
    const filters = {
      periodType: req.query.periodType || 'day',
      date: req.query.date || null,
      month: req.query.month ? parseInt(req.query.month) : null,
      year: req.query.year ? parseInt(req.query.year) : null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      locationId: req.query.locationId ? Number(req.query.locationId) : null,
      locationCode: req.query.locationCode || null,
      productCode: req.query.productCode || null,
      productName: req.query.productName || null,
      movementType: req.query.movementType || null,
    };

    const data = await getInventoryActivityLedgerData({
      filters,
    });

    return res.json({
      success: data.success,
      data: data.success ? data : null,
      error: data.success ? null : data.error,
    });
  } catch (err) {
    console.error('[INVENTORY ACTIVITY] getInventoryActivityLedger error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load inventory activity data.',
    });
  }
}

module.exports = {
  getInventoryActivityLedger,
};
