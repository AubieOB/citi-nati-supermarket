'use strict';

const { resolvePeriod, formatDateRange } = require('../../utils/reportingPeriod');
const {
  getInventoryActivityLedgerData,
} = require('../../services/business-operations/inventoryActivity.service');

async function getInventoryActivityLedger(req, res) {
  try {
    const {
      periodType,
      date,
      month,
      year,
      quarter,
      startDate,
      endDate,
    } = req.query;

    const period = resolvePeriod({
      periodType,
      date,
      month,
      year,
      quarter,
      startDate,
      endDate,
    });

    if (period.error) {
      return res.status(400).json({
        success: false,
        error: period.error,
      });
    }

    const filters = {
      locationId: req.query.locationId ? Number(req.query.locationId) : null,
      locationCode: req.query.locationCode || null,
      branchCode: req.query.branchCode || null,
      syncSourceCode: req.query.syncSourceCode || null,
      productCode: req.query.productCode || null,
      productName: req.query.productName || null,
      movementType: req.query.movementType || null,
    };

    const data = await getInventoryActivityLedgerData({
      period,
      filters,
    });

    return res.json({
      success: true,
      dateRange: formatDateRange(period.startDate, period.endDate),
      filters,
      data,
    });
  } catch (err) {
    console.error('[INVENTORY ACTIVITY] getInventoryActivityLedger error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load inventory activity ledger.',
    });
  }
}

module.exports = {
  getInventoryActivityLedger,
};