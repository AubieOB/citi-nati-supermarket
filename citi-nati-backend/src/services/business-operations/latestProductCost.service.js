'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeProductCode(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function roundMoney(value, decimals = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(decimals));
}

const ZOMBA_LOCATION_CODES = ['ZA', 'SH', 'BAR', 'WH'];

// Mirrors the same function in reportingFilters.js — kept local to avoid
// coupling unrelated modules. Must stay in sync with that version.
function deriveBranchCodeFromLocationCode(locationCode) {
  const code = String(locationCode || '').trim().toUpperCase();
  if (!code) return null;
  if (code === 'BT') return 'BLANTYRE';
  if (ZOMBA_LOCATION_CODES.includes(code)) return 'ZOMBA';
  return null;
}

function buildLatestCostScope(filters = {}) {
  const where = {};

  const andConditions = [];

  // Derive an authoritative branchCode from the location selection.
  // This is the same logic used in buildInvoiceWhere: branchCode is the
  // reliable discriminator because it comes from the agent BRANCH_CODE env.
  const effectiveBranchCode = filters.branchCode || deriveBranchCodeFromLocationCode(filters.locationCode);
  if (effectiveBranchCode) {
    where.branchCode = effectiveBranchCode;
  }

  const locationCode = normalizeProductCode(filters.locationCode || filters.branchCode);
  const locationId = Number.isInteger(filters.locationId) ? filters.locationId : Number(filters.locationId);
  const hasLocationId = Number.isInteger(locationId) && locationId > 0;

  if (locationCode && hasLocationId) {
    andConditions.push({
      OR: [
        { locationCode },
        { locationId },
      ],
    });
  } else if (locationCode) {
    where.locationCode = locationCode;
  } else if (hasLocationId) {
    where.locationId = locationId;
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

function buildLookupKey(syncSourceCode, productCode) {
  const normalizedSource = normalizeProductCode(syncSourceCode);
  const normalizedProduct = normalizeProductCode(productCode);
  if (!normalizedSource || !normalizedProduct) return null;
  return `${normalizedSource}::${normalizedProduct}`;
}

function shapeLatestCostRecord(record) {
  const unitCost = record?.latestUnitCost == null ? null : roundMoney(record.latestUnitCost, 4);
  const reference = normalizeProductCode(record?.latestGrnReference) || normalizeProductCode(record?.latestGrnNo);

  return {
    productCode: normalizeProductCode(record?.productCode),
    syncSourceCode: normalizeProductCode(record?.syncSourceCode),
    branchCode: normalizeProductCode(record?.branchCode),
    branchName: normalizeProductCode(record?.branchName),
    latestUnitCost: unitCost,
    hasValidCost: unitCost != null && unitCost > 0,
    latestStockAdditionDate: record?.latestGrnDate || null,
    latestRecordedAt: record?.sourceUpdatedAt || record?.sourceSyncedAt || record?.lastReceivedAt || record?.updatedAt || null,
    latestGrnReference: reference,
    latestGrnNo: normalizeProductCode(record?.latestGrnNo),
    sourceUpdatedAt: record?.sourceUpdatedAt || null,
    productNameAtCostBasis: normalizeProductCode(record?.productName),
    stockDetailId: normalizeProductCode(record?.stockDetailId),
    locationId: record?.locationId || null,
    locationCode: normalizeProductCode(record?.locationCode),
  };
}

async function resolveLatestProductCosts({ productKeys = [], filters = {} } = {}) {
  const normalizedKeys = Array.from(new Set(
    (Array.isArray(productKeys) ? productKeys : [])
      .map((row) => ({
        syncSourceCode: normalizeProductCode(row?.syncSourceCode),
        productCode: normalizeProductCode(row?.productCode),
      }))
      .filter((row) => row.syncSourceCode && row.productCode)
      .map((row) => buildLookupKey(row.syncSourceCode, row.productCode)),
  ));

  if (normalizedKeys.length === 0) {
    return new Map();
  }

  const pairs = normalizedKeys.map((key) => {
    const [syncSourceCode, productCode] = key.split('::');
    return { syncSourceCode, productCode };
  });

  const snapshots = await prisma.posLatestProductCost.findMany({
    where: {
      ...buildLatestCostScope(filters),
      OR: pairs.map((row) => ({
        syncSourceCode: row.syncSourceCode,
        productCode: row.productCode,
      })),
    },
    select: {
      branchCode: true,
      branchName: true,
      syncSourceCode: true,
      productCode: true,
      productName: true,
      latestUnitCost: true,
      latestGrnNo: true,
      latestGrnReference: true,
      latestGrnDate: true,
      stockDetailId: true,
      sourceUpdatedAt: true,
      sourceSyncedAt: true,
      lastReceivedAt: true,
      updatedAt: true,
      locationId: true,
      locationCode: true,
    },
  });

  const costMap = new Map();
  for (const snapshot of snapshots) {
    const key = buildLookupKey(snapshot.syncSourceCode, snapshot.productCode);
    if (!key) continue;
    costMap.set(key, shapeLatestCostRecord(snapshot));
  }

  return costMap;
}

module.exports = {
  normalizeProductCode,
  buildLookupKey,
  buildLatestCostScope,
  resolveLatestProductCosts,
};