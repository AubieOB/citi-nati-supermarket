'use strict';

const salesBalancingService = require('../../services/business-operations/salesBalancing.service');
const locationsService = require('../../services/business-operations/locations.service');
const {
  parsePagination,
  parseSort,
  toInt,
  toDate,
  toNumber,
  listResponse,
} = require('../../utils/business-operations/common');

const SORT_FIELDS = new Set(['id', 'balancingDate', 'expectedSystemSales', 'totalActualAmount', 'differenceAmount', 'status', 'createdAt', 'updatedAt']);

const PAYMENT_FIELDS = [
  'cashAmount',
  'airtelMoneyAmount',
  'tnmMpambaAmount',
  'posCardAmount',
  'bankTransferAmount',
  'emergencyExpensesAmount',
  'otherAmount',
];

function validatePaymentFields(payload = {}) {
  for (const field of PAYMENT_FIELDS) {
    if (payload[field] === undefined) continue;
    const amount = toNumber(payload[field], null);
    if (amount === null || amount < 0) {
      return `${field} must be numeric and non-negative`;
    }
  }
  return null;
}

async function resolveLocationMeta(locationId) {
  const locations = await locationsService.getBusinessLocations();
  const target = locations.find((row) => Number(row.id) === Number(locationId));
  if (!target) {
    return { locationCode: null, locationName: null };
  }

  return {
    locationCode: target.code || null,
    locationName: target.name || null,
  };
}

function parseBalancingDate(value) {
  const parsed = toDate(value);
  if (!parsed) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
}

async function getExpectedSales(req, res) {
  try {
    const locationId = toInt(req.query.locationId);
    const balancingDate = parseBalancingDate(req.query.balancingDate || req.query.date);

    if (!locationId) {
      return res.status(400).json({ success: false, error: 'locationId is required' });
    }
    if (!balancingDate) {
      return res.status(400).json({ success: false, error: 'balancingDate is required and must be valid' });
    }

    const { locationCode, locationName } = await resolveLocationMeta(locationId);
    const expectedSystemSales = await salesBalancingService.getExpectedSystemSales({
      balancingDate,
      locationId,
      locationCode,
    });

    return res.json({
      success: true,
      data: {
        balancingDate,
        locationId,
        locationCode,
        locationName,
        expectedSystemSales,
      },
    });
  } catch (err) {
    console.error('[BO][SALES_BALANCING] getExpectedSales error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load expected sales' });
  }
}

async function createSalesBalancingRecord(req, res) {
  try {
    const locationId = toInt(req.body.locationId);
    const balancingDate = parseBalancingDate(req.body.balancingDate);

    if (!locationId) {
      return res.status(400).json({ success: false, error: 'locationId is required' });
    }
    if (!balancingDate) {
      return res.status(400).json({ success: false, error: 'balancingDate is required and must be valid' });
    }

    const paymentError = validatePaymentFields(req.body);
    if (paymentError) {
      return res.status(400).json({ success: false, error: paymentError });
    }

    const { locationCode, locationName } = await resolveLocationMeta(locationId);

    const data = await salesBalancingService.createSalesBalancingRecord({
      balancingDate,
      locationId,
      locationCode: req.body.locationCode || locationCode,
      locationName: req.body.locationName || locationName,
      referenceTitle: req.body.referenceTitle,
      cashierReference: req.body.cashierReference,
      shiftReference: req.body.shiftReference,
      preparedBy: req.body.preparedBy || req.user?.name || req.user?.email || null,
      notes: req.body.notes,
      expectedSystemSales: req.body.expectedSystemSales,
      cashAmount: req.body.cashAmount,
      airtelMoneyAmount: req.body.airtelMoneyAmount,
      tnmMpambaAmount: req.body.tnmMpambaAmount,
      posCardAmount: req.body.posCardAmount,
      bankTransferAmount: req.body.bankTransferAmount,
      emergencyExpensesAmount: req.body.emergencyExpensesAmount,
      otherAmount: req.body.otherAmount,
      status: req.body.status,
    });

    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[BO][SALES_BALANCING] createSalesBalancingRecord error:', err);
    if (err.code === 'DUPLICATE_FINALIZED') {
      return res.status(409).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to create sales balancing record' });
  }
}

async function updateSalesBalancingRecord(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid balancing record id' });
    }

    const locationId = req.body.locationId !== undefined ? toInt(req.body.locationId) : undefined;
    if (req.body.locationId !== undefined && !locationId) {
      return res.status(400).json({ success: false, error: 'locationId must be a valid integer' });
    }

    const balancingDate = req.body.balancingDate !== undefined ? parseBalancingDate(req.body.balancingDate) : undefined;
    if (req.body.balancingDate !== undefined && !balancingDate) {
      return res.status(400).json({ success: false, error: 'balancingDate must be valid' });
    }

    const paymentError = validatePaymentFields(req.body);
    if (paymentError) {
      return res.status(400).json({ success: false, error: paymentError });
    }

    const locationMeta = locationId ? await resolveLocationMeta(locationId) : { locationCode: undefined, locationName: undefined };

    const data = await salesBalancingService.updateSalesBalancingRecord(id, {
      balancingDate,
      locationId,
      locationCode: req.body.locationCode !== undefined ? req.body.locationCode : locationMeta.locationCode,
      locationName: req.body.locationName !== undefined ? req.body.locationName : locationMeta.locationName,
      referenceTitle: req.body.referenceTitle,
      cashierReference: req.body.cashierReference,
      shiftReference: req.body.shiftReference,
      preparedBy: req.body.preparedBy,
      notes: req.body.notes,
      expectedSystemSales: req.body.expectedSystemSales,
      cashAmount: req.body.cashAmount,
      airtelMoneyAmount: req.body.airtelMoneyAmount,
      tnmMpambaAmount: req.body.tnmMpambaAmount,
      posCardAmount: req.body.posCardAmount,
      bankTransferAmount: req.body.bankTransferAmount,
      emergencyExpensesAmount: req.body.emergencyExpensesAmount,
      otherAmount: req.body.otherAmount,
      status: req.body.status,
    });

    if (!data) {
      return res.status(404).json({ success: false, error: 'Sales balancing record not found' });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][SALES_BALANCING] updateSalesBalancingRecord error:', err);
    if (err.code === 'DUPLICATE_FINALIZED') {
      return res.status(409).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to update sales balancing record' });
  }
}

async function getSalesBalancingRecordById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid balancing record id' });
    }

    const data = await salesBalancingService.getSalesBalancingRecordById(id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Sales balancing record not found' });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][SALES_BALANCING] getSalesBalancingRecordById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch sales balancing record' });
  }
}

async function listSalesBalancingRecords(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, SORT_FIELDS, 'balancingDate', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      locationId: toInt(req.query.locationId),
      status: req.query.status ? String(req.query.status).trim().toLowerCase() : null,
      startDate: req.query.startDate ? parseBalancingDate(req.query.startDate) : null,
      endDate: req.query.endDate ? parseBalancingDate(req.query.endDate) : null,
      search: req.query.search ? String(req.query.search).trim() : null,
    };

    const { data, total } = await salesBalancingService.listSalesBalancingRecords({
      ...filters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    });

    return res.json(listResponse({
      data,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      filters: {
        ...filters,
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
      },
    }));
  } catch (err) {
    console.error('[BO][SALES_BALANCING] listSalesBalancingRecords error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list sales balancing records' });
  }
}

async function finalizeSalesBalancingRecord(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid balancing record id' });
    }

    const data = await salesBalancingService.finalizeSalesBalancingRecord(
      id,
      req.body?.preparedBy || req.user?.name || req.user?.email || null,
    );

    if (!data) {
      return res.status(404).json({ success: false, error: 'Sales balancing record not found' });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][SALES_BALANCING] finalizeSalesBalancingRecord error:', err);
    if (err.code === 'DUPLICATE_FINALIZED') {
      return res.status(409).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'Failed to finalize sales balancing record' });
  }
}

async function deleteSalesBalancingRecord(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid balancing record id' });
    }

    const data = await salesBalancingService.deleteSalesBalancingRecord(id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Sales balancing record not found' });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][SALES_BALANCING] deleteSalesBalancingRecord error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete sales balancing record' });
  }
}

module.exports = {
  getExpectedSales,
  createSalesBalancingRecord,
  updateSalesBalancingRecord,
  getSalesBalancingRecordById,
  listSalesBalancingRecords,
  finalizeSalesBalancingRecord,
  deleteSalesBalancingRecord,
};
