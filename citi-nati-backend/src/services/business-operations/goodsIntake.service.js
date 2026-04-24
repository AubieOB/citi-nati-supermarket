'use strict';

const { PrismaClient } = require('@prisma/client');
const {
  normalizeScopeCode,
  expandLocationScopeCodes,
  deriveBranchCodeFromLocationCode,
} = require('../../utils/operationalScope');

const prisma = new PrismaClient();

function roundMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function buildLineItem(line, index) {
  const quantity = Math.max(0, Number(line.quantity || 0));
  const unitCost = Math.max(0, Number(line.unitCost || 0));
  const totalCost = roundMoney(quantity * unitCost);
  const sellingPrice = line.sellingPrice === null || line.sellingPrice === undefined || line.sellingPrice === ''
    ? null
    : Math.max(0, Number(line.sellingPrice));
  const estimatedProfit = sellingPrice == null ? 0 : roundMoney((sellingPrice - unitCost) * quantity);
  const marginPercent = (sellingPrice == null || sellingPrice <= 0)
    ? null
    : roundMoney(((sellingPrice - unitCost) / sellingPrice) * 100);

  return {
    lineNo: index + 1,
    barcode: line.barcode ? String(line.barcode).trim() : null,
    productId: line.productId || null,
    productName: String(line.productName || '').trim(),
    quantity,
    unitCost: roundMoney(unitCost),
    totalCost,
    sellingPrice: sellingPrice == null ? null : roundMoney(sellingPrice),
    estimatedProfit,
    marginPercent,
    expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
    batchRef: line.batchRef ? String(line.batchRef).trim() : null,
    lineNotes: line.lineNotes ? String(line.lineNotes).trim() : null,
  };
}

function computeTotals(items) {
  const totalItems = items.length;
  const totalQuantity = roundMoney(items.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
  const totalCost = roundMoney(items.reduce((sum, item) => sum + Number(item.totalCost || 0), 0));
  const totalEstimatedProfit = roundMoney(items.reduce((sum, item) => sum + Number(item.estimatedProfit || 0), 0));
  return {
    totalItems,
    totalQuantity,
    totalCost,
    totalEstimatedProfit,
  };
}

function normalizeStatus(status) {
  const normalized = String(status || 'draft').trim().toLowerCase();
  return normalized === 'finalized' ? 'finalized' : 'draft';
}

function generateIntakeRef() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GI-${yyyy}${mm}${dd}-${hh}${min}${sec}-${suffix}`;
}

function toWhereFilters(filters = {}) {
  const where = {};

  if (filters.status) where.status = normalizeStatus(filters.status);
  if (filters.locationId) where.locationId = filters.locationId;
  if (filters.supplierId) where.supplierId = filters.supplierId;

  if (filters.search) {
    where.OR = [
      { intakeRef: { contains: filters.search, mode: 'insensitive' } },
      { receiptReference: { contains: filters.search, mode: 'insensitive' } },
      { supplierStoreRef: { contains: filters.search, mode: 'insensitive' } },
      { manualSupplierName: { contains: filters.search, mode: 'insensitive' } },
      { supplier: { name: { contains: filters.search, mode: 'insensitive' } } },
      { items: { some: { productName: { contains: filters.search, mode: 'insensitive' } } } },
      { items: { some: { barcode: { contains: filters.search, mode: 'insensitive' } } } },
    ];
  }

  if (filters.startDate || filters.endDate) {
    where.purchaseDate = {};
    if (filters.startDate) where.purchaseDate.gte = filters.startDate;
    if (filters.endDate) where.purchaseDate.lte = filters.endDate;
  }

  return where;
}

function shapeHeader(payload) {
  const status = normalizeStatus(payload.status);
  return {
    supplierId: payload.supplierId || null,
    manualSupplierName: payload.manualSupplierName || null,
    supplierStoreRef: payload.supplierStoreRef || null,
    purchaseDate: payload.purchaseDate,
    receiptReference: payload.receiptReference || null,
    locationId: payload.locationId || null,
    locationCode: payload.locationCode || null,
    locationName: payload.locationName || null,
    status,
    overallNotes: payload.overallNotes || null,
    receiptTotalAmount: payload.receiptTotalAmount == null ? null : roundMoney(payload.receiptTotalAmount),
    enteredBy: payload.enteredBy || null,
    finalizedAt: status === 'finalized' ? new Date() : null,
  };
}

function includeShape() {
  return {
    supplier: {
      select: {
        id: true,
        name: true,
        supplierCode: true,
      },
    },
    items: {
      orderBy: { lineNo: 'asc' },
    },
  };
}

async function attachTransferCommandMetadata(records) {
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) return list;

  const intakeIds = list
    .map((record) => Number(record?.id))
    .filter((value) => Number.isFinite(value))
    .map((value) => String(value));

  if (intakeIds.length === 0) return list;

  const commands = await prisma.posWriteCommand.findMany({
    where: {
      commandType: 'CREATE_PENDING_STOCK_INTAKE',
      relatedEntityType: 'GoodsIntake',
      relatedEntityId: { in: intakeIds },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      relatedEntityId: true,
      status: true,
      errorMessage: true,
      resultSummary: true,
      createdAt: true,
      processedAt: true,
      updatedAt: true,
      retryCount: true,
      maxRetries: true,
      agentId: true,
    },
  });

  const latestByIntakeId = new Map();
  for (const command of commands) {
    const key = String(command.relatedEntityId || '');
    if (!key || latestByIntakeId.has(key)) continue;
    latestByIntakeId.set(key, command);
  }

  return list.map((record) => {
    const key = String(record.id || '');
    const command = latestByIntakeId.get(key) || null;
    return {
      ...record,
      posTransferCommand: command
        ? {
            id: command.id,
            status: command.status,
            errorMessage: command.errorMessage,
            resultSummary: command.resultSummary,
            createdAt: command.createdAt,
            processedAt: command.processedAt,
            updatedAt: command.updatedAt,
            retryCount: command.retryCount,
            maxRetries: command.maxRetries,
            agentId: command.agentId,
          }
        : null,
    };
  });
}

async function lookupGoodsIntakeProducts({ query, locationCode, take = 20 }) {
  const normalizedQuery = String(query || '').trim();
  const normalizedLocationCode = normalizeScopeCode(locationCode);
  if (!normalizedQuery || !normalizedLocationCode) {
    return [];
  }

  const scopeCodes = expandLocationScopeCodes(normalizedLocationCode);
  const branchCode = deriveBranchCodeFromLocationCode(normalizedLocationCode);
  const isConcreteZombaScope = branchCode === 'ZOMBA' && normalizedLocationCode !== 'ZA';

  const scopeWhere = isConcreteZombaScope
    ? {
        branchCode: 'ZOMBA',
        locationCode: { equals: normalizedLocationCode, mode: 'insensitive' },
      }
    : {
        OR: [
          ...scopeCodes.map((code) => ({
            locationCode: { equals: code, mode: 'insensitive' },
          })),
          ...(scopeCodes.includes('BT') ? [{ branchCode: 'BLANTYRE' }] : []),
        ],
      };

  const products = await prisma.product.findMany({
    where: {
      ...scopeWhere,
      OR: [
        { barcode: { equals: normalizedQuery, mode: 'insensitive' } },
        { sourceCode: { equals: normalizedQuery, mode: 'insensitive' } },
        { name: { contains: normalizedQuery, mode: 'insensitive' } },
        { barcode: { contains: normalizedQuery, mode: 'insensitive' } },
        { sourceCode: { contains: normalizedQuery, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      sourceCode: true,
      barcode: true,
      price: true,
      category: true,
      branchCode: true,
      locationCode: true,
      isActive: true,
      enabled: true,
    },
    take: Math.max(1, Math.min(Number(take) || 20, 30)),
    orderBy: [
      { name: 'asc' },
    ],
  });

  const loweredQuery = normalizedQuery.toLowerCase();

  return products
    .map((product) => ({
      ...product,
      productCode: product.sourceCode,
      product_code: product.sourceCode,
      unitPrice: Number(product.price || 0),
      unit_price: Number(product.price || 0),
    }))
    .sort((a, b) => {
      const aExact = String(a.barcode || '').toLowerCase() === loweredQuery
        || String(a.sourceCode || '').toLowerCase() === loweredQuery;
      const bExact = String(b.barcode || '').toLowerCase() === loweredQuery
        || String(b.sourceCode || '').toLowerCase() === loweredQuery;

      if (aExact === bExact) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      }

      return aExact ? -1 : 1;
    });
}

async function createGoodsIntake(payload) {
  const items = payload.items.map(buildLineItem).filter((line) => line.productName);
  const totals = computeTotals(items);

  return prisma.$transaction(async (tx) => {
    let intakeRef = generateIntakeRef();
    for (let i = 0; i < 6; i += 1) {
      const existing = await tx.goodsIntake.findUnique({ where: { intakeRef } });
      if (!existing) break;
      intakeRef = generateIntakeRef();
    }

    return tx.goodsIntake.create({
      data: {
        intakeRef,
        ...shapeHeader(payload),
        ...totals,
        items: {
          create: items,
        },
      },
      include: includeShape(),
    });
  });
}

async function updateGoodsIntake(id, payload) {
  const items = payload.items.map(buildLineItem).filter((line) => line.productName);
  const totals = computeTotals(items);

  return prisma.$transaction(async (tx) => {
    await tx.goodsIntake.update({
      where: { id },
      data: {
        ...shapeHeader(payload),
        ...totals,
      },
    });

    await tx.goodsIntakeItem.deleteMany({ where: { goodsIntakeId: id } });

    if (items.length > 0) {
      await tx.goodsIntakeItem.createMany({
        data: items.map((line) => ({
          goodsIntakeId: id,
          ...line,
        })),
      });
    }

    return tx.goodsIntake.findUnique({
      where: { id },
      include: includeShape(),
    });
  });
}

async function deleteGoodsIntake(id) {
  return prisma.goodsIntake.delete({ where: { id } });
}

async function getGoodsIntakeById(id) {
  const record = await prisma.goodsIntake.findUnique({
    where: { id },
    include: includeShape(),
  });

  if (!record) return null;
  const [enriched] = await attachTransferCommandMetadata([record]);
  return enriched;
}

async function listGoodsIntakes({ filters, skip, take, sortBy, sortOrder }) {
  const where = toWhereFilters(filters);
  const [data, total] = await Promise.all([
    prisma.goodsIntake.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            supplierCode: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.goodsIntake.count({ where }),
  ]);

  const enrichedData = await attachTransferCommandMetadata(data);

  return { data: enrichedData, total, where };
}

module.exports = {
  createGoodsIntake,
  updateGoodsIntake,
  deleteGoodsIntake,
  getGoodsIntakeById,
  listGoodsIntakes,
  lookupGoodsIntakeProducts,
};
