'use strict';

const {
  getInventoryActivityLedgerData,
} = require('../../services/business-operations/inventoryActivity.service');

const logger = require('../../utils/logger');

function normalizeQueryValue(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'undefined' || normalized.toLowerCase() === 'null') return null;
  return normalized;
}

async function getInventoryActivityLedger(req, res) {
  try {
    const filters = {
      periodType: normalizeQueryValue(req.query.periodType) || 'day',
      date: normalizeQueryValue(req.query.date) || null,
      month: req.query.month ? parseInt(req.query.month, 10) : null,
      year: req.query.year ? parseInt(req.query.year, 10) : null,
      startDate: normalizeQueryValue(req.query.startDate) || null,
      endDate: normalizeQueryValue(req.query.endDate) || null,
      // Handle location filters - only set if explicitly provided
      locationId:
        req.query.locationId && String(req.query.locationId).trim().toLowerCase() !== 'undefined'
          ? Number(req.query.locationId)
          : null,
      locationCode: normalizeQueryValue(req.query.locationCode),
      branchCode: normalizeQueryValue(req.query.branchCode),
      productCode: normalizeQueryValue(req.query.productCode),
      productName: normalizeQueryValue(req.query.productName),
      movementType: normalizeQueryValue(req.query.movementType),
    };

    logger.debugLog('[INVENTORY ACTIVITY] getInventoryActivityLedger filters:', { filters });

    const data = await getInventoryActivityLedgerData({
      filters,
    });

    // Add diagnostic logging for historical backfill visibility
    logger.debugLog('[INVENTORY_HISTORY_SALES_TRACE]', {
      selectedBranchCode: filters.branchCode,
      selectedLocationCode: filters.locationCode,
      periodStart: filters.startDate || filters.date,
      periodEnd: filters.endDate || filters.date,
      matchedSalesMovements: data?.success ? (data.matchedSalesMovements || 0) : 0,
      matchedIntakeMovements: data?.success ? (data.matchedIntakeMovements || 0) : 0,
      legacyLocationIdIgnored: data?.success ? Boolean(data.legacyLocationIdIgnored) : false,
      sampleInvoiceNo: data?.success ? (data.sampleInvoiceNo || null) : null,
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
