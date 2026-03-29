'use strict';

const { PrismaClient } = require('@prisma/client');
const { DEFAULT_EXPENSE_CATEGORIES } = require('../../utils/business-operations/constants');

const prisma = new PrismaClient();

async function createExpenseCategory(payload) {
  return prisma.expenseCategory.create({
    data: {
      code: payload.code,
      name: payload.name,
      description: payload.description || null,
      isActive: payload.isActive !== undefined ? payload.isActive : true,
    },
  });
}

async function updateExpenseCategory(id, payload) {
  return prisma.expenseCategory.update({
    where: { id },
    data: {
      code: payload.code,
      name: payload.name,
      description: payload.description,
      isActive: payload.isActive,
    },
  });
}

async function listExpenseCategories({ search, isActive, skip, take, sortBy, sortOrder }) {
  const where = {};

  if (isActive !== null && isActive !== undefined) {
    where.isActive = isActive;
  }

  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.expenseCategory.findMany({ where, skip, take, orderBy: { [sortBy]: sortOrder } }),
    prisma.expenseCategory.count({ where }),
  ]);

  return { data, total, where };
}

async function createExpense(payload) {
  return prisma.expense.create({
    data: {
      reportingPeriodId: payload.reportingPeriodId || null,
      expenseCategoryId: payload.expenseCategoryId,
      locationId: payload.locationId || null,
      expenseDate: payload.expenseDate,
      amount: payload.amount,
      description: payload.description || null,
      paymentMethod: payload.paymentMethod || null,
      referenceNo: payload.referenceNo || null,
      enteredBy: payload.enteredBy || null,
    },
    include: { expenseCategory: true },
  });
}

async function updateExpense(id, payload) {
  return prisma.expense.update({
    where: { id },
    data: {
      reportingPeriodId: payload.reportingPeriodId,
      expenseCategoryId: payload.expenseCategoryId,
      locationId: payload.locationId,
      expenseDate: payload.expenseDate,
      amount: payload.amount,
      description: payload.description,
      paymentMethod: payload.paymentMethod,
      referenceNo: payload.referenceNo,
      enteredBy: payload.enteredBy,
    },
    include: { expenseCategory: true },
  });
}

async function getExpenseById(id) {
  return prisma.expense.findUnique({
    where: { id },
    include: { expenseCategory: true },
  });
}

async function listExpenses({
  search,
  expenseCategoryId,
  locationId,
  reportingPeriodId,
  startDate,
  endDate,
  skip,
  take,
  sortBy,
  sortOrder,
}) {
  const where = {};

  if (expenseCategoryId) where.expenseCategoryId = expenseCategoryId;
  if (locationId) where.locationId = locationId;
  if (reportingPeriodId) where.reportingPeriodId = reportingPeriodId;

  if (startDate || endDate) {
    where.expenseDate = {};
    if (startDate) where.expenseDate.gte = startDate;
    if (endDate) where.expenseDate.lte = endDate;
  }

  if (search) {
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { paymentMethod: { contains: search, mode: 'insensitive' } },
      { expenseCategory: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { expenseCategory: true },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.expense.count({ where }),
  ]);

  return { data, total, where };
}

async function seedDefaultExpenseCategories() {
  const result = { inserted: 0, updated: 0 };

  for (const item of DEFAULT_EXPENSE_CATEGORIES) {
    const existing = await prisma.expenseCategory.findUnique({ where: { code: item.code } });
    if (existing) {
      await prisma.expenseCategory.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          description: item.description,
          isActive: true,
        },
      });
      result.updated += 1;
    } else {
      await prisma.expenseCategory.create({ data: item });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkUpsertExpenseCategories(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const code = row.code ? String(row.code).trim().toUpperCase() : null;
    const name = row.name ? String(row.name).trim() : null;

    if (!code || !name) {
      result.skipped += 1;
      continue;
    }

    const existing = await prisma.expenseCategory.findUnique({ where: { code } });

    if (existing) {
      await prisma.expenseCategory.update({
        where: { id: existing.id },
        data: {
          name,
          description: row.description || null,
          isActive: row.isActive !== undefined ? !!row.isActive : true,
        },
      });
      result.updated += 1;
    } else {
      await prisma.expenseCategory.create({
        data: {
          code,
          name,
          description: row.description || null,
          isActive: row.isActive !== undefined ? !!row.isActive : true,
        },
      });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkImportExpenses(records = []) {
  const result = { inserted: 0, skipped: 0 };

  for (const row of records) {
    const categoryCode = row.categoryCode ? String(row.categoryCode).trim().toUpperCase() : null;
    const amount = Number(row.amount);
    const expenseDate = new Date(row.expenseDate);

    if (!categoryCode || !Number.isFinite(amount) || isNaN(expenseDate.getTime())) {
      result.skipped += 1;
      continue;
    }

    const category = await prisma.expenseCategory.findUnique({ where: { code: categoryCode } });
    if (!category) {
      result.skipped += 1;
      continue;
    }

    await prisma.expense.create({
      data: {
        reportingPeriodId: row.reportingPeriodId || null,
        expenseCategoryId: category.id,
        locationId: row.locationId || null,
        expenseDate,
        amount,
        description: row.description || null,
        paymentMethod: row.paymentMethod || null,
        referenceNo: row.referenceNo || null,
        enteredBy: row.enteredBy || null,
      },
    });
    result.inserted += 1;
  }

  return result;
}

module.exports = {
  createExpenseCategory,
  updateExpenseCategory,
  listExpenseCategories,
  createExpense,
  updateExpense,
  getExpenseById,
  listExpenses,
  seedDefaultExpenseCategories,
  bulkUpsertExpenseCategories,
  bulkImportExpenses,
};
