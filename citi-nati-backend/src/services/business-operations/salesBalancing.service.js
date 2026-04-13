'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function startOfDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function roundMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

function normalizeAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, roundMoney(parsed));
}

function classifyDifference(difference) {
  const rounded = roundMoney(difference);
  if (Math.abs(rounded) < 0.005) return 'balanced';
  if (rounded < 0) return 'shortage';
  return 'overage';
}

function computeTotals(payload = {}) {
  const cashAmount = normalizeAmount(payload.cashAmount);
  const airtelMoneyAmount = normalizeAmount(payload.airtelMoneyAmount);
  const tnmMpambaAmount = normalizeAmount(payload.tnmMpambaAmount);
  const posCardAmount = normalizeAmount(payload.posCardAmount);
  const bankTransferAmount = normalizeAmount(payload.bankTransferAmount);
  const emergencyExpensesAmount = normalizeAmount(payload.emergencyExpensesAmount);
  const otherAmount = normalizeAmount(payload.otherAmount);

  const totalActualAmount = roundMoney(
    cashAmount
    + airtelMoneyAmount
    + tnmMpambaAmount
    + posCardAmount
    + bankTransferAmount
    + emergencyExpensesAmount
    + otherAmount,
  );

  return {
    cashAmount,
    airtelMoneyAmount,
    tnmMpambaAmount,
    posCardAmount,
    bankTransferAmount,
    emergencyExpensesAmount,
    otherAmount,
    totalActualAmount,
  };
}

async function getExpectedSystemSales({ balancingDate, locationId, locationCode }) {
  const start = startOfDay(balancingDate);
  const end = endOfDay(balancingDate);

  const where = {
    invoiceDate: {
      gte: start,
      lte: end,
    },
  };

  if (locationId) {
    where.locationId = Number(locationId);
  } else if (locationCode) {
    where.locationCode = { equals: String(locationCode).trim(), mode: 'insensitive' };
  }

  const aggregate = await prisma.salesInvoice.aggregate({
    where,
    _sum: {
      netSale: true,
    },
  });

  return roundMoney(aggregate?._sum?.netSale || 0);
}

async function ensureNoFinalizedDuplicate({ balancingDate, locationId, excludeId = null }) {
  const start = startOfDay(balancingDate);
  const end = endOfDay(balancingDate);

  const duplicate = await prisma.salesBalancingRecord.findFirst({
    where: {
      locationId: Number(locationId),
      status: 'finalized',
      balancingDate: {
        gte: start,
        lte: end,
      },
      ...(excludeId ? { id: { not: Number(excludeId) } } : {}),
    },
    select: { id: true, balancingDate: true, locationName: true },
  });

  return duplicate;
}

async function createSalesBalancingRecord(payload) {
  const totals = computeTotals(payload);
  const expectedSystemSales = payload.expectedSystemSales != null
    ? normalizeAmount(payload.expectedSystemSales)
    : await getExpectedSystemSales({
        balancingDate: payload.balancingDate,
        locationId: payload.locationId,
        locationCode: payload.locationCode,
      });

  const differenceAmount = roundMoney(totals.totalActualAmount - expectedSystemSales);
  const status = String(payload.status || 'draft').toLowerCase() === 'finalized' ? 'finalized' : 'draft';
  const resultStatus = classifyDifference(differenceAmount);

  if (status === 'finalized') {
    const duplicate = await ensureNoFinalizedDuplicate({
      balancingDate: payload.balancingDate,
      locationId: payload.locationId,
    });
    if (duplicate) {
      const err = new Error('A finalized balancing record already exists for this location and date.');
      err.code = 'DUPLICATE_FINALIZED';
      throw err;
    }
  }

  return prisma.salesBalancingRecord.create({
    data: {
      balancingDate: startOfDay(payload.balancingDate),
      locationId: Number(payload.locationId),
      locationCode: payload.locationCode || null,
      locationName: payload.locationName || null,
      referenceTitle: payload.referenceTitle || null,
      cashierReference: payload.cashierReference || null,
      shiftReference: payload.shiftReference || null,
      preparedBy: payload.preparedBy || null,
      notes: payload.notes || null,
      expectedSystemSales,
      ...totals,
      differenceAmount,
      resultStatus,
      status,
      finalizedAt: status === 'finalized' ? new Date() : null,
    },
  });
}

async function updateSalesBalancingRecord(id, payload) {
  const existing = await prisma.salesBalancingRecord.findUnique({ where: { id: Number(id) } });
  if (!existing) return null;

  const nextBalancingDate = payload.balancingDate ? startOfDay(payload.balancingDate) : existing.balancingDate;
  const nextLocationId = payload.locationId != null ? Number(payload.locationId) : existing.locationId;
  const nextLocationCode = payload.locationCode != null ? payload.locationCode : existing.locationCode;

  const totals = computeTotals({
    cashAmount: payload.cashAmount != null ? payload.cashAmount : existing.cashAmount,
    airtelMoneyAmount: payload.airtelMoneyAmount != null ? payload.airtelMoneyAmount : existing.airtelMoneyAmount,
    tnmMpambaAmount: payload.tnmMpambaAmount != null ? payload.tnmMpambaAmount : existing.tnmMpambaAmount,
    posCardAmount: payload.posCardAmount != null ? payload.posCardAmount : existing.posCardAmount,
    bankTransferAmount: payload.bankTransferAmount != null ? payload.bankTransferAmount : existing.bankTransferAmount,
    emergencyExpensesAmount: payload.emergencyExpensesAmount != null
      ? payload.emergencyExpensesAmount
      : (existing.emergencyExpensesAmount || 0),
    otherAmount: payload.otherAmount != null ? payload.otherAmount : existing.otherAmount,
  });

  const expectedSystemSales = payload.expectedSystemSales != null
    ? normalizeAmount(payload.expectedSystemSales)
    : await getExpectedSystemSales({
        balancingDate: nextBalancingDate,
        locationId: nextLocationId,
        locationCode: nextLocationCode,
      });

  const differenceAmount = roundMoney(totals.totalActualAmount - expectedSystemSales);
  const nextStatus = payload.status
    ? (String(payload.status).toLowerCase() === 'finalized' ? 'finalized' : 'draft')
    : existing.status;

  if (nextStatus === 'finalized') {
    const duplicate = await ensureNoFinalizedDuplicate({
      balancingDate: nextBalancingDate,
      locationId: nextLocationId,
      excludeId: id,
    });
    if (duplicate) {
      const err = new Error('A finalized balancing record already exists for this location and date.');
      err.code = 'DUPLICATE_FINALIZED';
      throw err;
    }
  }

  return prisma.salesBalancingRecord.update({
    where: { id: Number(id) },
    data: {
      balancingDate: nextBalancingDate,
      locationId: nextLocationId,
      locationCode: payload.locationCode !== undefined ? payload.locationCode || null : existing.locationCode,
      locationName: payload.locationName !== undefined ? payload.locationName || null : existing.locationName,
      referenceTitle: payload.referenceTitle !== undefined ? payload.referenceTitle || null : existing.referenceTitle,
      cashierReference: payload.cashierReference !== undefined ? payload.cashierReference || null : existing.cashierReference,
      shiftReference: payload.shiftReference !== undefined ? payload.shiftReference || null : existing.shiftReference,
      preparedBy: payload.preparedBy !== undefined ? payload.preparedBy || null : existing.preparedBy,
      notes: payload.notes !== undefined ? payload.notes || null : existing.notes,
      expectedSystemSales,
      ...totals,
      differenceAmount,
      resultStatus: classifyDifference(differenceAmount),
      status: nextStatus,
      finalizedAt: nextStatus === 'finalized' ? (existing.finalizedAt || new Date()) : null,
    },
  });
}

async function getSalesBalancingRecordById(id) {
  return prisma.salesBalancingRecord.findUnique({
    where: { id: Number(id) },
  });
}

async function listSalesBalancingRecords({
  locationId,
  status,
  startDate,
  endDate,
  search,
  skip,
  take,
  sortBy,
  sortOrder,
}) {
  const where = {};

  if (locationId) {
    where.locationId = Number(locationId);
  }

  if (status) {
    where.status = String(status).toLowerCase();
  }

  if (startDate || endDate) {
    where.balancingDate = {};
    if (startDate) where.balancingDate.gte = startOfDay(startDate);
    if (endDate) where.balancingDate.lte = endOfDay(endDate);
  }

  if (search) {
    where.OR = [
      { locationName: { contains: String(search), mode: 'insensitive' } },
      { locationCode: { contains: String(search), mode: 'insensitive' } },
      { referenceTitle: { contains: String(search), mode: 'insensitive' } },
      { preparedBy: { contains: String(search), mode: 'insensitive' } },
      { notes: { contains: String(search), mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.salesBalancingRecord.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.salesBalancingRecord.count({ where }),
  ]);

  return { data, total, where };
}

async function finalizeSalesBalancingRecord(id, preparedBy = null) {
  const existing = await prisma.salesBalancingRecord.findUnique({ where: { id: Number(id) } });
  if (!existing) return null;

  const duplicate = await ensureNoFinalizedDuplicate({
    balancingDate: existing.balancingDate,
    locationId: existing.locationId,
    excludeId: id,
  });
  if (duplicate) {
    const err = new Error('A finalized balancing record already exists for this location and date.');
    err.code = 'DUPLICATE_FINALIZED';
    throw err;
  }

  return prisma.salesBalancingRecord.update({
    where: { id: Number(id) },
    data: {
      status: 'finalized',
      finalizedAt: existing.finalizedAt || new Date(),
      preparedBy: preparedBy || existing.preparedBy,
    },
  });
}

async function deleteSalesBalancingRecord(id) {
  const existing = await prisma.salesBalancingRecord.findUnique({ where: { id: Number(id) } });
  if (!existing) return null;
  return prisma.salesBalancingRecord.delete({ where: { id: Number(id) } });
}

module.exports = {
  getExpectedSystemSales,
  createSalesBalancingRecord,
  updateSalesBalancingRecord,
  getSalesBalancingRecordById,
  listSalesBalancingRecords,
  finalizeSalesBalancingRecord,
  deleteSalesBalancingRecord,
};
