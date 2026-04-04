'use strict';

const expensesService = require('../../services/business-operations/expenses.service');
const importsService = require('../../services/business-operations/imports.service');
const {
  parsePagination,
  parseSort,
  requiredString,
  toInt,
  toNumber,
  toDate,
  toBool,
  listResponse,
} = require('../../utils/business-operations/common');

const CATEGORY_SORT_FIELDS = new Set(['id', 'code', 'name', 'isActive', 'createdAt', 'updatedAt']);
const EXPENSE_SORT_FIELDS = new Set(['id', 'expenseDate', 'amount', 'createdAt', 'updatedAt']);

async function createExpenseCategory(req, res) {
  try {
    const codeErr = requiredString(req.body.code, 'code');
    const nameErr = requiredString(req.body.name, 'name');
    if (codeErr || nameErr) {
      return res.status(400).json({ success: false, error: codeErr || nameErr });
    }

    const category = await expensesService.createExpenseCategory({
      code: String(req.body.code).trim().toUpperCase(),
      name: String(req.body.name).trim(),
      description: req.body.description,
      isActive: req.body.isActive !== undefined ? !!req.body.isActive : true,
    });

    return res.status(201).json({ success: true, data: category });
  } catch (err) {
    console.error('[BO][EXPENSES] createExpenseCategory error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create expense category' });
  }
}

async function updateExpenseCategory(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid category id' });

    const category = await expensesService.updateExpenseCategory(id, {
      code: req.body.code ? String(req.body.code).trim().toUpperCase() : undefined,
      name: req.body.name,
      description: req.body.description,
      isActive: req.body.isActive !== undefined ? !!req.body.isActive : undefined,
    });

    return res.json({ success: true, data: category });
  } catch (err) {
    console.error('[BO][EXPENSES] updateExpenseCategory error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update expense category' });
  }
}

async function listExpenseCategories(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, CATEGORY_SORT_FIELDS, 'name', 'asc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const search = req.query.search ? String(req.query.search).trim() : null;
    const isActive = req.query.isActive !== undefined ? toBool(req.query.isActive, null) : null;

    const { data, total } = await expensesService.listExpenseCategories({
      search,
      isActive,
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
      filters: { search, isActive },
    }));
  } catch (err) {
    console.error('[BO][EXPENSES] listExpenseCategories error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list expense categories' });
  }
}

async function createExpense(req, res) {
  try {
    const expenseCategoryId = toInt(req.body.expenseCategoryId);
    const locationId = toInt(req.body.locationId);
    const expenseDate = toDate(req.body.expenseDate);
    const amount = toNumber(req.body.amount);

    if (!expenseCategoryId) return res.status(400).json({ success: false, error: 'expenseCategoryId is required' });
    if (!locationId) return res.status(400).json({ success: false, error: 'locationId is required' });
    if (!expenseDate) return res.status(400).json({ success: false, error: 'expenseDate is required and must be valid' });
    if (!Number.isFinite(amount)) return res.status(400).json({ success: false, error: 'amount is required and must be numeric' });

    const expense = await expensesService.createExpense({
      reportingPeriodId: toInt(req.body.reportingPeriodId),
      expenseCategoryId,
      locationId,
      expenseDate,
      amount,
      description: req.body.description,
      paymentMethod: req.body.paymentMethod,
      referenceNo: req.body.referenceNo,
      enteredBy: req.body.enteredBy || req.user?.email || null,
    });

    return res.status(201).json({ success: true, data: expense });
  } catch (err) {
    console.error('[BO][EXPENSES] createExpense error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create expense' });
  }
}

async function updateExpense(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid expense id' });

    if (req.body.locationId !== undefined && !toInt(req.body.locationId)) {
      return res.status(400).json({ success: false, error: 'locationId must be a valid integer' });
    }

    const expense = await expensesService.updateExpense(id, {
      reportingPeriodId: req.body.reportingPeriodId !== undefined ? toInt(req.body.reportingPeriodId) : undefined,
      expenseCategoryId: req.body.expenseCategoryId !== undefined ? toInt(req.body.expenseCategoryId) : undefined,
      locationId: req.body.locationId !== undefined ? toInt(req.body.locationId) : undefined,
      expenseDate: req.body.expenseDate ? toDate(req.body.expenseDate) : undefined,
      amount: req.body.amount !== undefined ? toNumber(req.body.amount) : undefined,
      description: req.body.description,
      paymentMethod: req.body.paymentMethod,
      referenceNo: req.body.referenceNo,
      enteredBy: req.body.enteredBy,
    });

    return res.json({ success: true, data: expense });
  } catch (err) {
    console.error('[BO][EXPENSES] updateExpense error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update expense' });
  }
}

async function getExpenseById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid expense id' });

    const expense = await expensesService.getExpenseById(id);
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });

    return res.json({ success: true, data: expense });
  } catch (err) {
    console.error('[BO][EXPENSES] getExpenseById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch expense' });
  }
}

async function listExpenses(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, EXPENSE_SORT_FIELDS, 'expenseDate', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      search: req.query.search ? String(req.query.search).trim() : null,
      expenseCategoryId: toInt(req.query.expenseCategoryId),
      locationId: toInt(req.query.locationId),
      reportingPeriodId: toInt(req.query.reportingPeriodId),
      startDate: req.query.startDate ? toDate(req.query.startDate) : null,
      endDate: req.query.endDate ? toDate(req.query.endDate) : null,
    };

    const { data, total } = await expensesService.listExpenses({
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
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      },
    }));
  } catch (err) {
    console.error('[BO][EXPENSES] listExpenses error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list expenses' });
  }
}

async function getExpenseSummary(req, res) {
  try {
    const filters = {
      search: req.query.search ? String(req.query.search).trim() : null,
      expenseCategoryId: toInt(req.query.expenseCategoryId),
      locationId: toInt(req.query.locationId),
      reportingPeriodId: toInt(req.query.reportingPeriodId),
      startDate: req.query.startDate ? toDate(req.query.startDate) : null,
      endDate: req.query.endDate ? toDate(req.query.endDate) : null,
    };

    const data = await expensesService.getExpenseSummary(filters);

    return res.json({
      success: true,
      filters: {
        ...filters,
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
      },
      data,
    });
  } catch (err) {
    console.error('[BO][EXPENSES] getExpenseSummary error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load expense summary' });
  }
}

async function seedDefaultCategories(req, res) {
  try {
    const result = await expensesService.seedDefaultExpenseCategories();
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[BO][EXPENSES] seedDefaultCategories error:', err);
    return res.status(500).json({ success: false, error: 'Failed to seed default categories' });
  }
}

async function importExpenseCategories(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const result = await importsService.importExpenseCategories(records);
    return res.json({ success: true, data: result, importedCount: result.inserted + result.updated });
  } catch (err) {
    console.error('[BO][EXPENSES] importExpenseCategories error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import expense categories' });
  }
}

async function importExpenses(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const result = await importsService.importExpenses(records);
    return res.json({ success: true, data: result, importedCount: result.inserted });
  } catch (err) {
    console.error('[BO][EXPENSES] importExpenses error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import expenses' });
  }
}

async function deleteExpense(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid expense id' });
    await expensesService.deleteExpense(id);
    return res.json({ success: true });
  } catch (err) {
    console.error('[BO][EXPENSES] deleteExpense error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete expense' });
  }
}

async function deleteExpenseCategory(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid category id' });
    await expensesService.deleteExpenseCategory(id);
    return res.json({ success: true });
  } catch (err) {
    console.error('[BO][EXPENSES] deleteExpenseCategory error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete expense category' });
  }
}

module.exports = {
  createExpenseCategory,
  updateExpenseCategory,
  listExpenseCategories,
  deleteExpenseCategory,
  createExpense,
  updateExpense,
  getExpenseById,
  listExpenses,
  deleteExpense,
  getExpenseSummary,
  seedDefaultCategories,
  importExpenseCategories,
  importExpenses,
};
