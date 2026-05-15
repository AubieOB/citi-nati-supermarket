'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function roundMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function buildLineItem(line, index) {
  const quantity = Math.max(0, Number(line.quantity || 0));
  const unitCost = Math.max(0, Number(line.unitCost || 0));
  return {
    lineNo: index + 1,
    barcode: line.barcode ? String(line.barcode).trim() : null,
    productId: line.productId || null,
    productName: String(line.productName || '').trim(),
    quantity,
    unitCost: roundMoney(unitCost),
    totalCost: roundMoney(quantity * unitCost),
    expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
    batchRef: line.batchRef ? String(line.batchRef).trim() : null,
    notes: line.notes ? String(line.notes).trim() : null,
  };
}

function computeTotals(items) {
  const validItems = Array.isArray(items) ? items : [];
  return {
    totalItems: validItems.length,
    totalQuantity: roundMoney(validItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)),
    totalCost: roundMoney(validItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0)),
  };
}

function normalizeStatus(status) {
  const normalized = String(status || 'draft').trim().toLowerCase();
  if (['draft', 'submitted', 'approved', 'completed'].includes(normalized)) {
    return normalized;
  }
  return 'draft';
}

function generatePurchaseOrderRef() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-${yyyy}${mm}${dd}-${hh}${min}${sec}-${suffix}`;
}

function shapeHeader(payload) {
  return {
    purchaseOrderRef: payload.purchaseOrderRef ? String(payload.purchaseOrderRef).trim() : null,
    supplierId: payload.supplierId || null,
    supplierName: payload.supplierName ? String(payload.supplierName).trim() : null,
    purchaseDate: payload.purchaseDate || new Date(),
    expectedDeliveryDate: payload.expectedDeliveryDate || null,
    branchCode: payload.branchCode ? String(payload.branchCode).trim().toUpperCase() : null,
    locationCode: payload.locationCode ? String(payload.locationCode).trim().toUpperCase() : null,
    locationName: payload.locationName || null,
    status: normalizeStatus(payload.status),
    notes: payload.notes ? String(payload.notes).trim() : null,
    enteredBy: payload.enteredBy || null,
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

function toWhereFilters(filters = {}) {
  const where = {};

  if (filters.status) {
    where.status = normalizeStatus(filters.status);
  }

  if (filters.branchCode) {
    where.branchCode = { equals: String(filters.branchCode).trim().toUpperCase(), mode: 'insensitive' };
  }

  if (filters.locationCode) {
    where.locationCode = { equals: String(filters.locationCode).trim().toUpperCase(), mode: 'insensitive' };
  }

  if (!filters.branchCode && !filters.locationCode && filters.locationId) {
    where.locationId = filters.locationId;
  }

  if (filters.search) {
    const normalizedSearch = String(filters.search || '').trim();
    if (normalizedSearch) {
      where.OR = [
        { purchaseOrderRef: { contains: normalizedSearch, mode: 'insensitive' } },
        { supplierName: { contains: normalizedSearch, mode: 'insensitive' } },
        { supplier: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
        { items: { some: { productName: { contains: normalizedSearch, mode: 'insensitive' } } } },
        { items: { some: { barcode: { contains: normalizedSearch, mode: 'insensitive' } } } },
      ];
    }
  }

  if (filters.startDate || filters.endDate) {
    where.purchaseDate = {};
    if (filters.startDate) where.purchaseDate.gte = filters.startDate;
    if (filters.endDate) where.purchaseDate.lte = filters.endDate;
  }

  return where;
}

async function createPurchaseOrder(payload) {
  const items = Array.isArray(payload.items) ? payload.items.map(buildLineItem).filter((line) => line.productName) : [];
  const totals = computeTotals(items);
  const purchaseOrderRef = payload.purchaseOrderRef ? String(payload.purchaseOrderRef).trim() : generatePurchaseOrderRef();

  return prisma.$transaction(async (tx) => {
    let uniqueRef = purchaseOrderRef;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const existing = await tx.purchaseOrder.findUnique({ where: { purchaseOrderRef: uniqueRef } });
      if (!existing) break;
      uniqueRef = generatePurchaseOrderRef();
    }

    return tx.purchaseOrder.create({
      data: {
        purchaseOrderRef: uniqueRef,
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

async function updatePurchaseOrder(id, payload) {
  const items = Array.isArray(payload.items) ? payload.items.map(buildLineItem).filter((line) => line.productName) : [];
  const totals = computeTotals(items);

  return prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        ...shapeHeader(payload),
        ...totals,
      },
    });

    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });

    if (items.length > 0) {
      await tx.purchaseOrderItem.createMany({
        data: items.map((line) => ({
          purchaseOrderId: id,
          ...line,
        })),
      });
    }

    return tx.purchaseOrder.findUnique({
      where: { id },
      include: includeShape(),
    });
  });
}

async function deletePurchaseOrder(id) {
  return prisma.purchaseOrder.delete({ where: { id } });
}

async function getPurchaseOrderById(id) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: includeShape(),
  });
}

async function listPurchaseOrders({ filters = {}, skip = 0, take = 25, sortBy = 'createdAt', sortOrder = 'desc' }) {
  const where = toWhereFilters(filters);

  const [data, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: includeShape(),
      orderBy: { [sortBy]: sortOrder },
      skip,
      take,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return { data, total };
}

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrderById,
  listPurchaseOrders,
};
