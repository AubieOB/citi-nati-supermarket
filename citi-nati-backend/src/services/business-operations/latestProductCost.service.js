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

function buildLatestCostScope(filters = {}) {
  const where = {
    status: 'finalized',
  };

  const andConditions = [];
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

function buildMatchedCodes(item, requestedCodes) {
  const matches = new Set();
  const sourceCode = normalizeProductCode(item?.product?.sourceCode);
  const barcode = normalizeProductCode(item?.barcode);

  if (sourceCode && requestedCodes.has(sourceCode)) {
    matches.add(sourceCode);
  }

  if (barcode && requestedCodes.has(barcode)) {
    matches.add(barcode);
  }

  return Array.from(matches.values());
}

function shapeLatestCostRecord(item, productCode) {
  const unitCost = roundMoney(item?.unitCost, 4);
  const goodsIntake = item?.goodsIntake || {};
  const reference = normalizeProductCode(goodsIntake.receiptReference) || normalizeProductCode(goodsIntake.intakeRef);

  return {
    productCode,
    productId: item?.productId || item?.product?.id || null,
    matchedBy: normalizeProductCode(item?.product?.sourceCode) === productCode ? 'productCode' : 'barcode',
    latestUnitCost: unitCost,
    hasValidCost: unitCost > 0,
    latestStockAdditionDate: goodsIntake.purchaseDate || null,
    latestRecordedAt: goodsIntake.finalizedAt || goodsIntake.updatedAt || item?.updatedAt || item?.createdAt || null,
    latestGrnReference: reference,
    intakeRef: normalizeProductCode(goodsIntake.intakeRef),
    receiptReference: normalizeProductCode(goodsIntake.receiptReference),
    goodsIntakeId: goodsIntake.id || null,
    goodsIntakeStatus: goodsIntake.status || null,
    productNameAtCostBasis: normalizeProductCode(item?.productName),
    barcode: normalizeProductCode(item?.barcode),
    lineNo: item?.lineNo || null,
    locationId: goodsIntake.locationId || null,
    locationCode: normalizeProductCode(goodsIntake.locationCode),
  };
}

async function resolveLatestProductCosts({ productCodes = [], filters = {} } = {}) {
  const normalizedCodes = Array.from(new Set(
    (Array.isArray(productCodes) ? productCodes : [])
      .map((code) => normalizeProductCode(code))
      .filter(Boolean),
  ));

  if (normalizedCodes.length === 0) {
    return new Map();
  }

  const requestedCodes = new Set(normalizedCodes);
  const items = await prisma.goodsIntakeItem.findMany({
    where: {
      goodsIntake: buildLatestCostScope(filters),
      OR: [
        { barcode: { in: normalizedCodes } },
        { product: { sourceCode: { in: normalizedCodes } } },
      ],
    },
    select: {
      id: true,
      lineNo: true,
      barcode: true,
      productId: true,
      productName: true,
      unitCost: true,
      createdAt: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          sourceCode: true,
        },
      },
      goodsIntake: {
        select: {
          id: true,
          intakeRef: true,
          receiptReference: true,
          purchaseDate: true,
          finalizedAt: true,
          updatedAt: true,
          status: true,
          locationId: true,
          locationCode: true,
        },
      },
    },
    orderBy: [
      { goodsIntake: { purchaseDate: 'desc' } },
      { goodsIntake: { finalizedAt: 'desc' } },
      { goodsIntake: { updatedAt: 'desc' } },
      { updatedAt: 'desc' },
      { id: 'desc' },
    ],
  });

  const costMap = new Map();
  for (const item of items) {
    const matches = buildMatchedCodes(item, requestedCodes);
    if (matches.length === 0) continue;

    for (const productCode of matches) {
      if (!costMap.has(productCode)) {
        costMap.set(productCode, shapeLatestCostRecord(item, productCode));
      }
    }

    if (costMap.size >= requestedCodes.size) {
      break;
    }
  }

  return costMap;
}

module.exports = {
  normalizeProductCode,
  buildLatestCostScope,
  resolveLatestProductCosts,
};