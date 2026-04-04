'use strict';

const payrollService = require('../../services/business-operations/payroll.service');
const importsService = require('../../services/business-operations/imports.service');
const {
  parsePagination,
  parseSort,
  toInt,
  toDate,
  toNumber,
  listResponse,
} = require('../../utils/business-operations/common');
const { PAYROLL_MODES } = require('../../utils/business-operations/constants');

const PERIOD_SORT_FIELDS = new Set(['id', 'payrollMode', 'status', 'createdAt', 'updatedAt']);
const ENTRY_SORT_FIELDS = new Set(['id', 'grossPay', 'netPay', 'basicSalary', 'createdAt', 'updatedAt']);
const LOAN_SORT_FIELDS = new Set(['id', 'principalAmount', 'balanceAmount', 'status', 'createdAt', 'updatedAt']);
const LOAN_TX_SORT_FIELDS = new Set(['id', 'amount', 'createdAt']);
const TERMINATION_SORT_FIELDS = new Set(['id', 'terminationDate', 'settlementAmount', 'createdAt']);
const REENGAGEMENT_SORT_FIELDS = new Set(['id', 'effectiveDate', 'createdAt']);

function isPayrollEntryUniqueError(err) {
  return (
    err &&
    err.code === 'P2002' &&
    Array.isArray(err.meta?.target) &&
    err.meta.target.includes('payroll_period_id') &&
    err.meta.target.includes('employee_id')
  );
}

function parsePayrollEntryPayload(body) {
  return {
    payrollPeriodId: toInt(body.payrollPeriodId),
    employeeId: toInt(body.employeeId),
    basicSalary: toNumber(body.basicSalary, 0),
    incrementAmount: toNumber(body.incrementAmount, 0),
    grossPay: toNumber(body.grossPay, 0),
    totalDeductions: toNumber(body.totalDeductions, 0),
    netPay: toNumber(body.netPay, 0),
    daysWorked: body.daysWorked !== undefined ? toNumber(body.daysWorked) : undefined,
    daysAbsent: body.daysAbsent !== undefined ? toNumber(body.daysAbsent) : undefined,
    overtimeHours: body.overtimeHours !== undefined ? toNumber(body.overtimeHours) : undefined,
    overtimeNormalHours: body.overtimeNormalHours !== undefined ? toNumber(body.overtimeNormalHours) : undefined,
    overtimeDoubleHours: body.overtimeDoubleHours !== undefined ? toNumber(body.overtimeDoubleHours) : undefined,
    overtimeAmount: body.overtimeAmount !== undefined ? toNumber(body.overtimeAmount) : undefined,
    overtimeNormalAmount: body.overtimeNormalAmount !== undefined ? toNumber(body.overtimeNormalAmount) : undefined,
    overtimeDoubleAmount: body.overtimeDoubleAmount !== undefined ? toNumber(body.overtimeDoubleAmount) : undefined,
    loanDeductionAmount: body.loanDeductionAmount !== undefined ? toNumber(body.loanDeductionAmount) : undefined,
    absenceDeductionAmount: body.absenceDeductionAmount !== undefined ? toNumber(body.absenceDeductionAmount) : undefined,
    otherDeductionAmount: body.otherDeductionAmount !== undefined ? toNumber(body.otherDeductionAmount) : undefined,
    bonusAmount: body.bonusAmount !== undefined ? toNumber(body.bonusAmount) : undefined,
    giftAmount: body.giftAmount !== undefined ? toNumber(body.giftAmount) : undefined,
    leavePayAmount: body.leavePayAmount !== undefined ? toNumber(body.leavePayAmount) : undefined,
    payeAmount: body.payeAmount !== undefined ? toNumber(body.payeAmount) : undefined,
    loanBalanceAtPayroll: body.loanBalanceAtPayroll !== undefined ? toNumber(body.loanBalanceAtPayroll) : undefined,
    accruedInterestAtPayroll: body.accruedInterestAtPayroll !== undefined ? toNumber(body.accruedInterestAtPayroll) : undefined,
    netPayMidPortion: body.netPayMidPortion !== undefined ? toNumber(body.netPayMidPortion) : undefined,
    netPayEndPortion: body.netPayEndPortion !== undefined ? toNumber(body.netPayEndPortion) : undefined,
    notes: body.notes,
  };
}

async function createPayrollPeriod(req, res) {
  try {
    const payrollMode = req.body.payrollMode ? String(req.body.payrollMode).toLowerCase() : null;
    if (!payrollMode || !PAYROLL_MODES.has(payrollMode)) {
      return res.status(400).json({ success: false, error: 'payrollMode must be one of: mid_month, full_month' });
    }

    const locationId = toInt(req.body.locationId);
    if (!locationId) {
      return res.status(400).json({ success: false, error: 'locationId is required' });
    }

    const period = await payrollService.createPayrollPeriod({
      reportingPeriodId: toInt(req.body.reportingPeriodId),
      payrollMode,
      payrollMonth: toInt(req.body.payrollMonth),
      payrollYear: toInt(req.body.payrollYear),
      payrollPositionInMonth: toInt(req.body.payrollPositionInMonth),
      description: req.body.description,
      status: req.body.status,
      locationId,
      runStartedAt: req.body.runStartedAt ? toDate(req.body.runStartedAt) : null,
      finalizedAt: req.body.finalizedAt ? toDate(req.body.finalizedAt) : null,
      createdBy: req.body.createdBy || req.user?.email || null,
    });

    return res.status(201).json({ success: true, data: period });
  } catch (err) {
    console.error('[BO][PAYROLL] createPayrollPeriod error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create payroll period' });
  }
}

async function updatePayrollPeriod(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid payroll period id' });

    if (req.body.locationId !== undefined && !toInt(req.body.locationId)) {
      return res.status(400).json({ success: false, error: 'locationId must be a valid integer' });
    }

    const payload = {
      reportingPeriodId: req.body.reportingPeriodId !== undefined ? toInt(req.body.reportingPeriodId) : undefined,
      payrollMode: req.body.payrollMode ? String(req.body.payrollMode).toLowerCase() : undefined,
      payrollMonth: req.body.payrollMonth !== undefined ? toInt(req.body.payrollMonth) : undefined,
      payrollYear: req.body.payrollYear !== undefined ? toInt(req.body.payrollYear) : undefined,
      payrollPositionInMonth: req.body.payrollPositionInMonth !== undefined ? toInt(req.body.payrollPositionInMonth) : undefined,
      description: req.body.description,
      status: req.body.status,
      locationId: req.body.locationId !== undefined ? toInt(req.body.locationId) : undefined,
      runStartedAt: req.body.runStartedAt ? toDate(req.body.runStartedAt) : undefined,
      finalizedAt: req.body.finalizedAt ? toDate(req.body.finalizedAt) : undefined,
      createdBy: req.body.createdBy,
    };

    if (payload.payrollMode && !PAYROLL_MODES.has(payload.payrollMode)) {
      return res.status(400).json({ success: false, error: 'payrollMode must be one of: mid_month, full_month' });
    }

    const period = await payrollService.updatePayrollPeriod(id, payload);
    return res.json({ success: true, data: period });
  } catch (err) {
    console.error('[BO][PAYROLL] updatePayrollPeriod error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update payroll period' });
  }
}

async function listPayrollPeriods(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, PERIOD_SORT_FIELDS, 'createdAt', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      search: req.query.search ? String(req.query.search).trim() : null,
      status: req.query.status ? String(req.query.status).trim() : null,
      payrollMode: req.query.payrollMode ? String(req.query.payrollMode).toLowerCase() : null,
      payrollMonth: toInt(req.query.payrollMonth),
      payrollYear: toInt(req.query.payrollYear),
      reportingPeriodId: toInt(req.query.reportingPeriodId),
      locationId: toInt(req.query.locationId),
    };

    const { data, total } = await payrollService.listPayrollPeriods({
      ...filters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    });

    return res.json(listResponse({ data, total, page: pagination.page, pageSize: pagination.pageSize, filters }));
  } catch (err) {
    console.error('[BO][PAYROLL] listPayrollPeriods error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list payroll periods' });
  }
}

async function getPayrollPeriodById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid payroll period id' });

    const data = await payrollService.getPayrollPeriodById(id);
    if (!data) return res.status(404).json({ success: false, error: 'Payroll period not found' });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] getPayrollPeriodById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch payroll period' });
  }
}

async function createPayrollEntry(req, res) {
  try {
    const payload = parsePayrollEntryPayload(req.body);
    if (!payload.payrollPeriodId || !payload.employeeId) {
      return res.status(400).json({ success: false, error: 'payrollPeriodId and employeeId are required' });
    }

    const data = await payrollService.createPayrollEntry(payload);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    if (err?.statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message || 'Invalid payroll entry payload' });
    }
    if (isPayrollEntryUniqueError(err)) {
      return res.status(409).json({
        success: false,
        error: 'A payroll entry already exists for this employee in the selected payroll period.',
      });
    }
    console.error('[BO][PAYROLL] createPayrollEntry error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create payroll entry' });
  }
}

async function updatePayrollEntry(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid payroll entry id' });

    const payload = parsePayrollEntryPayload(req.body);
    const data = await payrollService.updatePayrollEntry(id, payload);
    return res.json({ success: true, data });
  } catch (err) {
    if (err?.statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message || 'Invalid payroll entry payload' });
    }
    if (isPayrollEntryUniqueError(err)) {
      return res.status(409).json({
        success: false,
        error: 'A payroll entry already exists for this employee in the selected payroll period.',
      });
    }
    console.error('[BO][PAYROLL] updatePayrollEntry error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update payroll entry' });
  }
}

async function listPayrollEntries(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, ENTRY_SORT_FIELDS, 'createdAt', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      payrollPeriodId: toInt(req.query.payrollPeriodId),
      employeeId: toInt(req.query.employeeId),
      locationId: toInt(req.query.locationId),
    };

    const { data, total } = await payrollService.listPayrollEntries({
      ...filters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    });

    return res.json(listResponse({ data, total, page: pagination.page, pageSize: pagination.pageSize, filters }));
  } catch (err) {
    console.error('[BO][PAYROLL] listPayrollEntries error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list payroll entries' });
  }
}

async function getPayrollEntryById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid payroll entry id' });

    const data = await payrollService.getPayrollEntryById(id);
    if (!data) return res.status(404).json({ success: false, error: 'Payroll entry not found' });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] getPayrollEntryById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch payroll entry' });
  }
}

async function createEmployeeLoan(req, res) {
  try {
    const employeeId = toInt(req.body.employeeId);
    const principalAmount = toNumber(req.body.principalAmount);
    const balanceAmount = req.body.balanceAmount !== undefined ? toNumber(req.body.balanceAmount) : principalAmount;

    if (!employeeId) return res.status(400).json({ success: false, error: 'employeeId is required' });
    if (!Number.isFinite(principalAmount)) return res.status(400).json({ success: false, error: 'principalAmount is required and must be numeric' });

    const data = await payrollService.createEmployeeLoan({
      employeeId,
      loanReference: req.body.loanReference,
      principalAmount,
      balanceAmount,
      interestRate: req.body.interestRate !== undefined ? toNumber(req.body.interestRate) : null,
      accruedInterest: req.body.accruedInterest !== undefined ? toNumber(req.body.accruedInterest) : null,
      loanGrantedMonth: req.body.loanGrantedMonth !== undefined ? toInt(req.body.loanGrantedMonth) : null,
      loanGrantedYear: req.body.loanGrantedYear !== undefined ? toInt(req.body.loanGrantedYear) : null,
      monthlyDeductionAmount: req.body.monthlyDeductionAmount !== undefined ? toNumber(req.body.monthlyDeductionAmount) : null,
      repaymentEndMonth: req.body.repaymentEndMonth !== undefined ? toInt(req.body.repaymentEndMonth) : null,
      repaymentEndYear: req.body.repaymentEndYear !== undefined ? toInt(req.body.repaymentEndYear) : null,
      reason: req.body.reason,
      startDate: req.body.startDate ? toDate(req.body.startDate) : null,
      endDate: req.body.endDate ? toDate(req.body.endDate) : null,
      status: req.body.status || 'active',
      notes: req.body.notes,
    });

    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] createEmployeeLoan error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create employee loan' });
  }
}

async function updateEmployeeLoan(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid loan id' });

    const data = await payrollService.updateEmployeeLoan(id, {
      employeeId: req.body.employeeId !== undefined ? toInt(req.body.employeeId) : undefined,
      loanReference: req.body.loanReference,
      principalAmount: req.body.principalAmount !== undefined ? toNumber(req.body.principalAmount) : undefined,
      balanceAmount: req.body.balanceAmount !== undefined ? toNumber(req.body.balanceAmount) : undefined,
      interestRate: req.body.interestRate !== undefined ? toNumber(req.body.interestRate) : undefined,
      accruedInterest: req.body.accruedInterest !== undefined ? toNumber(req.body.accruedInterest) : undefined,
      loanGrantedMonth: req.body.loanGrantedMonth !== undefined ? toInt(req.body.loanGrantedMonth) : undefined,
      loanGrantedYear: req.body.loanGrantedYear !== undefined ? toInt(req.body.loanGrantedYear) : undefined,
      monthlyDeductionAmount: req.body.monthlyDeductionAmount !== undefined ? toNumber(req.body.monthlyDeductionAmount) : undefined,
      repaymentEndMonth: req.body.repaymentEndMonth !== undefined ? toInt(req.body.repaymentEndMonth) : undefined,
      repaymentEndYear: req.body.repaymentEndYear !== undefined ? toInt(req.body.repaymentEndYear) : undefined,
      reason: req.body.reason,
      startDate: req.body.startDate ? toDate(req.body.startDate) : undefined,
      endDate: req.body.endDate ? toDate(req.body.endDate) : undefined,
      status: req.body.status,
      notes: req.body.notes,
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] updateEmployeeLoan error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update employee loan' });
  }
}

async function listEmployeeLoans(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, LOAN_SORT_FIELDS, 'createdAt', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      employeeId: toInt(req.query.employeeId),
      status: req.query.status ? String(req.query.status).trim() : null,
    };

    const { data, total } = await payrollService.listEmployeeLoans({
      ...filters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    });

    return res.json(listResponse({ data, total, page: pagination.page, pageSize: pagination.pageSize, filters }));
  } catch (err) {
    console.error('[BO][PAYROLL] listEmployeeLoans error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list employee loans' });
  }
}

async function getEmployeeLoanById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid loan id' });

    const data = await payrollService.getEmployeeLoanById(id);
    if (!data) return res.status(404).json({ success: false, error: 'Employee loan not found' });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] getEmployeeLoanById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch employee loan' });
  }
}

async function createLoanTransaction(req, res) {
  try {
    const employeeLoanId = toInt(req.body.employeeLoanId);
    const amount = toNumber(req.body.amount);

    if (!employeeLoanId) return res.status(400).json({ success: false, error: 'employeeLoanId is required' });
    if (!Number.isFinite(amount)) return res.status(400).json({ success: false, error: 'amount is required and must be numeric' });

    const data = await payrollService.createLoanTransaction({
      employeeLoanId,
      payrollPeriodId: toInt(req.body.payrollPeriodId),
      transactionType: req.body.transactionType || 'repayment',
      amount,
      principalComponent: req.body.principalComponent !== undefined ? toNumber(req.body.principalComponent) : null,
      interestComponent: req.body.interestComponent !== undefined ? toNumber(req.body.interestComponent) : null,
      notes: req.body.notes,
    });

    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] createLoanTransaction error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create loan transaction' });
  }
}

async function updateLoanTransaction(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid loan transaction id' });

    const data = await payrollService.updateLoanTransaction(id, {
      employeeLoanId: req.body.employeeLoanId !== undefined ? toInt(req.body.employeeLoanId) : undefined,
      payrollPeriodId: req.body.payrollPeriodId !== undefined ? toInt(req.body.payrollPeriodId) : undefined,
      transactionType: req.body.transactionType,
      amount: req.body.amount !== undefined ? toNumber(req.body.amount) : undefined,
      principalComponent: req.body.principalComponent !== undefined ? toNumber(req.body.principalComponent) : undefined,
      interestComponent: req.body.interestComponent !== undefined ? toNumber(req.body.interestComponent) : undefined,
      notes: req.body.notes,
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] updateLoanTransaction error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update loan transaction' });
  }
}

async function listLoanTransactions(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, LOAN_TX_SORT_FIELDS, 'createdAt', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      employeeLoanId: toInt(req.query.employeeLoanId),
      payrollPeriodId: toInt(req.query.payrollPeriodId),
      transactionType: req.query.transactionType ? String(req.query.transactionType).trim() : null,
    };

    const { data, total } = await payrollService.listLoanTransactions({
      ...filters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    });

    return res.json(listResponse({ data, total, page: pagination.page, pageSize: pagination.pageSize, filters }));
  } catch (err) {
    console.error('[BO][PAYROLL] listLoanTransactions error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list loan transactions' });
  }
}

async function createTermination(req, res) {
  try {
    const employeeId = toInt(req.body.employeeId);
    const terminationDate = toDate(req.body.terminationDate);
    if (!employeeId) return res.status(400).json({ success: false, error: 'employeeId is required' });
    if (!terminationDate) return res.status(400).json({ success: false, error: 'terminationDate is required and must be valid' });

    const data = await payrollService.createTermination({
      employeeId,
      terminationDate,
      terminationType: req.body.terminationType,
      reason: req.body.reason,
      daysWorkedInFinalMonth: req.body.daysWorkedInFinalMonth !== undefined ? toNumber(req.body.daysWorkedInFinalMonth) : null,
      halfPayReceived: req.body.halfPayReceived !== undefined ? toNumber(req.body.halfPayReceived) : null,
      halfPayDueInTerminationMonth: req.body.halfPayDueInTerminationMonth !== undefined ? toNumber(req.body.halfPayDueInTerminationMonth) : null,
      amountPaidInTerminationMonth: req.body.amountPaidInTerminationMonth !== undefined ? toNumber(req.body.amountPaidInTerminationMonth) : null,
      leavePayAccruedDays: req.body.leavePayAccruedDays !== undefined ? toNumber(req.body.leavePayAccruedDays) : null,
      leavePayAmount: req.body.leavePayAmount !== undefined ? toNumber(req.body.leavePayAmount) : null,
      outstandingLoanObligations: req.body.outstandingLoanObligations !== undefined ? toNumber(req.body.outstandingLoanObligations) : null,
      grossSettlementAmount: req.body.grossSettlementAmount !== undefined ? toNumber(req.body.grossSettlementAmount) : null,
      netSettlementAmount: req.body.netSettlementAmount !== undefined ? toNumber(req.body.netSettlementAmount) : null,
      settlementAmount: req.body.settlementAmount !== undefined ? toNumber(req.body.settlementAmount) : null,
      notes: req.body.notes,
    });

    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] createTermination error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create termination record' });
  }
}

async function updateTermination(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid termination id' });

    const data = await payrollService.updateTermination(id, {
      employeeId: req.body.employeeId !== undefined ? toInt(req.body.employeeId) : undefined,
      terminationDate: req.body.terminationDate ? toDate(req.body.terminationDate) : undefined,
      terminationType: req.body.terminationType,
      reason: req.body.reason,
      daysWorkedInFinalMonth: req.body.daysWorkedInFinalMonth !== undefined ? toNumber(req.body.daysWorkedInFinalMonth) : undefined,
      halfPayReceived: req.body.halfPayReceived !== undefined ? toNumber(req.body.halfPayReceived) : undefined,
      halfPayDueInTerminationMonth: req.body.halfPayDueInTerminationMonth !== undefined ? toNumber(req.body.halfPayDueInTerminationMonth) : undefined,
      amountPaidInTerminationMonth: req.body.amountPaidInTerminationMonth !== undefined ? toNumber(req.body.amountPaidInTerminationMonth) : undefined,
      leavePayAccruedDays: req.body.leavePayAccruedDays !== undefined ? toNumber(req.body.leavePayAccruedDays) : undefined,
      leavePayAmount: req.body.leavePayAmount !== undefined ? toNumber(req.body.leavePayAmount) : undefined,
      outstandingLoanObligations: req.body.outstandingLoanObligations !== undefined ? toNumber(req.body.outstandingLoanObligations) : undefined,
      grossSettlementAmount: req.body.grossSettlementAmount !== undefined ? toNumber(req.body.grossSettlementAmount) : undefined,
      netSettlementAmount: req.body.netSettlementAmount !== undefined ? toNumber(req.body.netSettlementAmount) : undefined,
      settlementAmount: req.body.settlementAmount !== undefined ? toNumber(req.body.settlementAmount) : undefined,
      notes: req.body.notes,
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] updateTermination error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update termination record' });
  }
}

async function listTerminations(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, TERMINATION_SORT_FIELDS, 'terminationDate', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      employeeId: toInt(req.query.employeeId),
      startDate: req.query.startDate ? toDate(req.query.startDate) : null,
      endDate: req.query.endDate ? toDate(req.query.endDate) : null,
    };

    const { data, total } = await payrollService.listTerminations({
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
        employeeId: filters.employeeId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      },
    }));
  } catch (err) {
    console.error('[BO][PAYROLL] listTerminations error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list terminations' });
  }
}

async function createReengagement(req, res) {
  try {
    const employeeId = toInt(req.body.employeeId);
    const effectiveDate = toDate(req.body.effectiveDate);
    if (!employeeId) return res.status(400).json({ success: false, error: 'employeeId is required' });
    if (!effectiveDate) return res.status(400).json({ success: false, error: 'effectiveDate is required and must be valid' });

    const data = await payrollService.createReengagement({
      employeeId,
      linkedTerminationId: req.body.linkedTerminationId !== undefined ? toInt(req.body.linkedTerminationId) : null,
      wageAtRetrenchment: req.body.wageAtRetrenchment !== undefined ? toNumber(req.body.wageAtRetrenchment) : null,
      previousWage: req.body.previousWage !== undefined ? toNumber(req.body.previousWage) : null,
      reengagementWage: req.body.reengagementWage !== undefined ? toNumber(req.body.reengagementWage) : null,
      occupation: req.body.occupation,
      effectiveDate,
      contractExpiryDate: req.body.contractExpiryDate ? toDate(req.body.contractExpiryDate) : null,
      notes: req.body.notes,
    });

    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] createReengagement error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create reengagement record' });
  }
}

async function updateReengagement(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid reengagement id' });

    const data = await payrollService.updateReengagement(id, {
      employeeId: req.body.employeeId !== undefined ? toInt(req.body.employeeId) : undefined,
      linkedTerminationId: req.body.linkedTerminationId !== undefined ? toInt(req.body.linkedTerminationId) : undefined,
      wageAtRetrenchment: req.body.wageAtRetrenchment !== undefined ? toNumber(req.body.wageAtRetrenchment) : undefined,
      previousWage: req.body.previousWage !== undefined ? toNumber(req.body.previousWage) : undefined,
      reengagementWage: req.body.reengagementWage !== undefined ? toNumber(req.body.reengagementWage) : undefined,
      occupation: req.body.occupation,
      effectiveDate: req.body.effectiveDate ? toDate(req.body.effectiveDate) : undefined,
      contractExpiryDate: req.body.contractExpiryDate ? toDate(req.body.contractExpiryDate) : undefined,
      notes: req.body.notes,
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][PAYROLL] updateReengagement error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update reengagement record' });
  }
}

async function listReengagements(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, REENGAGEMENT_SORT_FIELDS, 'effectiveDate', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      employeeId: toInt(req.query.employeeId),
      startDate: req.query.startDate ? toDate(req.query.startDate) : null,
      endDate: req.query.endDate ? toDate(req.query.endDate) : null,
    };

    const { data, total } = await payrollService.listReengagements({
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
        employeeId: filters.employeeId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      },
    }));
  } catch (err) {
    console.error('[BO][PAYROLL] listReengagements error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list reengagements' });
  }
}

async function importPayrollPeriods(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const data = await importsService.importPayrollPeriods(records);
    return res.json({ success: true, data, importedCount: data.inserted + data.updated });
  } catch (err) {
    console.error('[BO][PAYROLL] importPayrollPeriods error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import payroll periods' });
  }
}

async function importPayrollEntries(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const data = await importsService.importPayrollEntries(records);
    return res.json({ success: true, data, importedCount: data.inserted + data.updated });
  } catch (err) {
    console.error('[BO][PAYROLL] importPayrollEntries error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import payroll entries' });
  }
}

async function importLoans(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const data = await importsService.importLoans(records);
    return res.json({ success: true, data, importedCount: data.inserted + data.updated });
  } catch (err) {
    console.error('[BO][PAYROLL] importLoans error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import loans' });
  }
}

async function importTerminations(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const data = await importsService.importTerminations(records);
    return res.json({ success: true, data, importedCount: data.inserted + data.updated });
  } catch (err) {
    console.error('[BO][PAYROLL] importTerminations error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import terminations' });
  }
}

async function importReengagements(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const data = await importsService.importReengagements(records);
    return res.json({ success: true, data, importedCount: data.inserted + data.updated });
  } catch (err) {
    console.error('[BO][PAYROLL] importReengagements error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import reengagements' });
  }
}

module.exports = {
  createPayrollPeriod,
  updatePayrollPeriod,
  listPayrollPeriods,
  getPayrollPeriodById,
  createPayrollEntry,
  updatePayrollEntry,
  listPayrollEntries,
  getPayrollEntryById,
  createEmployeeLoan,
  updateEmployeeLoan,
  listEmployeeLoans,
  getEmployeeLoanById,
  createLoanTransaction,
  updateLoanTransaction,
  listLoanTransactions,
  createTermination,
  updateTermination,
  listTerminations,
  createReengagement,
  updateReengagement,
  listReengagements,
  importPayrollPeriods,
  importPayrollEntries,
  importLoans,
  importTerminations,
  importReengagements,
};
