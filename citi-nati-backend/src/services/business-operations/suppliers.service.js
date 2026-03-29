'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeSupplierStatus(status) {
  if (!status) return 'active';
  return String(status).toLowerCase();
}

async function createSupplier(payload) {
  return prisma.supplier.create({
    data: {
      supplierCode: payload.supplierCode || null,
      name: payload.name,
      contactPerson: payload.contactPerson || null,
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      openingBalance: payload.openingBalance || 0,
      status: normalizeSupplierStatus(payload.status),
      notes: payload.notes || null,
    },
  });
}

async function updateSupplier(id, payload) {
  return prisma.supplier.update({
    where: { id },
    data: {
      supplierCode: payload.supplierCode,
      name: payload.name,
      contactPerson: payload.contactPerson,
      phone: payload.phone,
      email: payload.email,
      address: payload.address,
      openingBalance: payload.openingBalance,
      status: payload.status ? normalizeSupplierStatus(payload.status) : undefined,
      notes: payload.notes,
    },
  });
}

async function getSupplierById(id) {
  return prisma.supplier.findUnique({
    where: { id },
  });
}

async function listSuppliers({ search, status, skip, take, sortBy, sortOrder }) {
  const where = {};

  if (status) {
    where.status = String(status).toLowerCase();
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { supplierCode: { contains: search, mode: 'insensitive' } },
      { contactPerson: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.supplier.findMany({ where, skip, take, orderBy: { [sortBy]: sortOrder } }),
    prisma.supplier.count({ where }),
  ]);

  return { data, total, where };
}

async function createSupplierTransaction(payload) {
  return prisma.supplierTransaction.create({
    data: {
      supplierId: payload.supplierId,
      reportingPeriodId: payload.reportingPeriodId || null,
      transactionDate: payload.transactionDate,
      transactionType: payload.transactionType,
      paymentMethod: payload.paymentMethod || null,
      amount: payload.amount,
      description: payload.description || null,
      referenceNo: payload.referenceNo || null,
      enteredBy: payload.enteredBy || null,
    },
  });
}

async function updateSupplierTransaction(id, payload) {
  return prisma.supplierTransaction.update({
    where: { id },
    data: {
      reportingPeriodId: payload.reportingPeriodId,
      transactionDate: payload.transactionDate,
      transactionType: payload.transactionType,
      paymentMethod: payload.paymentMethod,
      amount: payload.amount,
      description: payload.description,
      referenceNo: payload.referenceNo,
      enteredBy: payload.enteredBy,
    },
  });
}

async function listSupplierTransactions({
  supplierId,
  reportingPeriodId,
  transactionType,
  paymentMethod,
  startDate,
  endDate,
  search,
  skip,
  take,
  sortBy,
  sortOrder,
}) {
  const where = {};

  if (supplierId) where.supplierId = supplierId;
  if (reportingPeriodId) where.reportingPeriodId = reportingPeriodId;
  if (transactionType) where.transactionType = transactionType;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) where.transactionDate.gte = startDate;
    if (endDate) where.transactionDate.lte = endDate;
  }

  if (search) {
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.supplierTransaction.findMany({
      where,
      include: { supplier: true },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.supplierTransaction.count({ where }),
  ]);

  return { data, total, where };
}

async function getSupplierBalanceSummary(supplierId) {
  const [supplier, txAgg] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: supplierId } }),
    prisma.supplierTransaction.groupBy({
      by: ['transactionType'],
      where: { supplierId },
      _sum: { amount: true },
    }),
  ]);

  if (!supplier) {
    return null;
  }

  let totalDebt = 0;
  let totalPaid = 0;
  let totalAdjustment = 0;

  txAgg.forEach((row) => {
    const amount = Number(row._sum.amount || 0);
    if (row.transactionType === 'debt') totalDebt += amount;
    if (row.transactionType === 'payment') totalPaid += amount;
    if (row.transactionType === 'adjustment') totalAdjustment += amount;
  });

  const openingBalance = Number(supplier.openingBalance || 0);
  const outstandingBalance = openingBalance + totalDebt - totalPaid + totalAdjustment;

  return {
    supplier,
    summary: {
      openingBalance,
      totalDebt,
      totalPaid,
      totalAdjustment,
      outstandingBalance,
    },
  };
}

async function bulkUpsertSuppliers(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const name = row.name ? String(row.name).trim() : '';
    if (!name) {
      result.skipped += 1;
      continue;
    }

    const supplierCode = row.supplierCode ? String(row.supplierCode).trim() : null;
    const openingBalance = Number(row.openingBalance || 0);

    if (supplierCode) {
      const existing = await prisma.supplier.findUnique({ where: { supplierCode } });
      if (existing) {
        await prisma.supplier.update({
          where: { id: existing.id },
          data: {
            name,
            contactPerson: row.contactPerson || null,
            phone: row.phone || null,
            email: row.email || null,
            address: row.address || null,
            openingBalance,
            status: normalizeSupplierStatus(row.status),
            notes: row.notes || null,
          },
        });
        result.updated += 1;
      } else {
        await prisma.supplier.create({
          data: {
            supplierCode,
            name,
            contactPerson: row.contactPerson || null,
            phone: row.phone || null,
            email: row.email || null,
            address: row.address || null,
            openingBalance,
            status: normalizeSupplierStatus(row.status),
            notes: row.notes || null,
          },
        });
        result.inserted += 1;
      }
      continue;
    }

    const existingByName = await prisma.supplier.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });

    if (existingByName) {
      await prisma.supplier.update({
        where: { id: existingByName.id },
        data: {
          contactPerson: row.contactPerson || existingByName.contactPerson,
          phone: row.phone || existingByName.phone,
          email: row.email || existingByName.email,
          address: row.address || existingByName.address,
          openingBalance,
          status: normalizeSupplierStatus(row.status),
          notes: row.notes || existingByName.notes,
        },
      });
      result.updated += 1;
    } else {
      await prisma.supplier.create({
        data: {
          supplierCode: null,
          name,
          contactPerson: row.contactPerson || null,
          phone: row.phone || null,
          email: row.email || null,
          address: row.address || null,
          openingBalance,
          status: normalizeSupplierStatus(row.status),
          notes: row.notes || null,
        },
      });
      result.inserted += 1;
    }
  }

  return result;
}

module.exports = {
  createSupplier,
  updateSupplier,
  getSupplierById,
  listSuppliers,
  createSupplierTransaction,
  updateSupplierTransaction,
  listSupplierTransactions,
  getSupplierBalanceSummary,
  bulkUpsertSuppliers,
};
