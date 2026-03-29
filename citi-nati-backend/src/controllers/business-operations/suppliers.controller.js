'use strict';

const suppliersService = require('../../services/business-operations/suppliers.service');
const importsService = require('../../services/business-operations/imports.service');
const {
  parsePagination,
  parseSort,
  requiredString,
  toInt,
  toNumber,
  toDate,
  listResponse,
} = require('../../utils/business-operations/common');
const {
  SUPPLIER_TRANSACTION_TYPES,
  SUPPLIER_PAYMENT_METHODS,
} = require('../../utils/business-operations/constants');

const SUPPLIER_SORT_FIELDS = new Set(['id', 'name', 'supplierCode', 'status', 'createdAt', 'updatedAt']);
const SUPPLIER_TX_SORT_FIELDS = new Set(['id', 'transactionDate', 'amount', 'transactionType', 'createdAt']);

async function createSupplier(req, res) {
  try {
    const err = requiredString(req.body.name, 'name');
    if (err) return res.status(400).json({ success: false, error: err });

    const supplier = await suppliersService.createSupplier({
      supplierCode: req.body.supplierCode,
      name: req.body.name.trim(),
      contactPerson: req.body.contactPerson,
      phone: req.body.phone,
      email: req.body.email,
      address: req.body.address,
      openingBalance: toNumber(req.body.openingBalance, 0),
      status: req.body.status,
      notes: req.body.notes,
    });

    return res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    console.error('[BO][SUPPLIERS] createSupplier error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create supplier' });
  }
}

async function updateSupplier(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid supplier id' });

    const supplier = await suppliersService.updateSupplier(id, {
      supplierCode: req.body.supplierCode,
      name: req.body.name,
      contactPerson: req.body.contactPerson,
      phone: req.body.phone,
      email: req.body.email,
      address: req.body.address,
      openingBalance: req.body.openingBalance !== undefined ? toNumber(req.body.openingBalance, 0) : undefined,
      status: req.body.status,
      notes: req.body.notes,
    });

    return res.json({ success: true, data: supplier });
  } catch (err) {
    console.error('[BO][SUPPLIERS] updateSupplier error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update supplier' });
  }
}

async function getSupplierById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid supplier id' });

    const supplier = await suppliersService.getSupplierById(id);
    if (!supplier) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    return res.json({ success: true, data: supplier });
  } catch (err) {
    console.error('[BO][SUPPLIERS] getSupplierById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch supplier' });
  }
}

async function listSuppliers(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, SUPPLIER_SORT_FIELDS, 'createdAt', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const search = req.query.search ? String(req.query.search).trim() : null;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

    const { data, total } = await suppliersService.listSuppliers({
      search,
      status,
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
      filters: { search, status },
    }));
  } catch (err) {
    console.error('[BO][SUPPLIERS] listSuppliers error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list suppliers' });
  }
}

async function createSupplierTransaction(req, res) {
  try {
    const supplierId = toInt(req.body.supplierId);
    const amount = toNumber(req.body.amount);
    const transactionDate = toDate(req.body.transactionDate);
    const transactionType = req.body.transactionType ? String(req.body.transactionType).toLowerCase() : null;
    const paymentMethod = req.body.paymentMethod ? String(req.body.paymentMethod).toLowerCase() : null;

    if (!supplierId) return res.status(400).json({ success: false, error: 'supplierId is required' });
    if (!transactionDate) return res.status(400).json({ success: false, error: 'transactionDate is required and must be valid' });
    if (!Number.isFinite(amount)) return res.status(400).json({ success: false, error: 'amount is required and must be numeric' });
    if (!SUPPLIER_TRANSACTION_TYPES.has(transactionType)) {
      return res.status(400).json({ success: false, error: 'transactionType must be one of: debt, payment, adjustment' });
    }
    if (paymentMethod && !SUPPLIER_PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({ success: false, error: 'paymentMethod must be one of: cash, bank, mobile_money, capital_injection, other' });
    }

    const tx = await suppliersService.createSupplierTransaction({
      supplierId,
      reportingPeriodId: toInt(req.body.reportingPeriodId),
      transactionDate,
      transactionType,
      paymentMethod,
      amount,
      description: req.body.description,
      referenceNo: req.body.referenceNo,
      enteredBy: req.body.enteredBy || req.user?.email || null,
    });

    return res.status(201).json({ success: true, data: tx });
  } catch (err) {
    console.error('[BO][SUPPLIERS] createSupplierTransaction error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create supplier transaction' });
  }
}

async function updateSupplierTransaction(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid transaction id' });

    const payload = {
      reportingPeriodId: req.body.reportingPeriodId !== undefined ? toInt(req.body.reportingPeriodId) : undefined,
      transactionDate: req.body.transactionDate ? toDate(req.body.transactionDate) : undefined,
      transactionType: req.body.transactionType ? String(req.body.transactionType).toLowerCase() : undefined,
      paymentMethod: req.body.paymentMethod ? String(req.body.paymentMethod).toLowerCase() : undefined,
      amount: req.body.amount !== undefined ? toNumber(req.body.amount) : undefined,
      description: req.body.description,
      referenceNo: req.body.referenceNo,
      enteredBy: req.body.enteredBy,
    };

    if (payload.transactionType && !SUPPLIER_TRANSACTION_TYPES.has(payload.transactionType)) {
      return res.status(400).json({ success: false, error: 'transactionType must be one of: debt, payment, adjustment' });
    }

    if (payload.paymentMethod && !SUPPLIER_PAYMENT_METHODS.has(payload.paymentMethod)) {
      return res.status(400).json({ success: false, error: 'paymentMethod must be one of: cash, bank, mobile_money, capital_injection, other' });
    }

    const tx = await suppliersService.updateSupplierTransaction(id, payload);
    return res.json({ success: true, data: tx });
  } catch (err) {
    console.error('[BO][SUPPLIERS] updateSupplierTransaction error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update supplier transaction' });
  }
}

async function listSupplierTransactions(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, SUPPLIER_TX_SORT_FIELDS, 'transactionDate', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const supplierId = toInt(req.query.supplierId);
    const reportingPeriodId = toInt(req.query.reportingPeriodId);
    const transactionType = req.query.transactionType ? String(req.query.transactionType).toLowerCase() : null;
    const paymentMethod = req.query.paymentMethod ? String(req.query.paymentMethod).toLowerCase() : null;
    const startDate = req.query.startDate ? toDate(req.query.startDate) : null;
    const endDate = req.query.endDate ? toDate(req.query.endDate) : null;
    const search = req.query.search ? String(req.query.search).trim() : null;

    const { data, total } = await suppliersService.listSupplierTransactions({
      supplierId,
      reportingPeriodId,
      transactionType,
      paymentMethod,
      startDate,
      endDate,
      search,
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
      filters: { supplierId, reportingPeriodId, transactionType, paymentMethod, startDate: req.query.startDate, endDate: req.query.endDate, search },
    }));
  } catch (err) {
    console.error('[BO][SUPPLIERS] listSupplierTransactions error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list supplier transactions' });
  }
}

async function getSupplierBalance(req, res) {
  try {
    const supplierId = toInt(req.params.id);
    if (!supplierId) return res.status(400).json({ success: false, error: 'Invalid supplier id' });

    const data = await suppliersService.getSupplierBalanceSummary(supplierId);
    if (!data) return res.status(404).json({ success: false, error: 'Supplier not found' });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][SUPPLIERS] getSupplierBalance error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch supplier balance' });
  }
}

async function importSuppliers(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) {
      return res.status(400).json({ success: false, error: 'records array is required' });
    }

    const result = await importsService.importSuppliers(records);

    return res.json({
      success: true,
      message: 'Supplier import completed',
      data: result,
      importedCount: result.inserted + result.updated,
    });
  } catch (err) {
    console.error('[BO][SUPPLIERS] importSuppliers error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import suppliers' });
  }
}

module.exports = {
  createSupplier,
  updateSupplier,
  getSupplierById,
  listSuppliers,
  createSupplierTransaction,
  updateSupplierTransaction,
  listSupplierTransactions,
  getSupplierBalance,
  importSuppliers,
};
