'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function createPayrollPeriod(payload) {
  return prisma.payrollPeriod.create({
    data: {
      reportingPeriodId: payload.reportingPeriodId || null,
      payrollMode: payload.payrollMode,
      description: payload.description || null,
      status: payload.status || 'draft',
      createdBy: payload.createdBy || null,
    },
  });
}

async function updatePayrollPeriod(id, payload) {
  return prisma.payrollPeriod.update({
    where: { id },
    data: {
      reportingPeriodId: payload.reportingPeriodId,
      payrollMode: payload.payrollMode,
      description: payload.description,
      status: payload.status,
      createdBy: payload.createdBy,
    },
  });
}

async function listPayrollPeriods({ search, status, payrollMode, reportingPeriodId, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (status) where.status = status;
  if (payrollMode) where.payrollMode = payrollMode;
  if (reportingPeriodId) where.reportingPeriodId = reportingPeriodId;
  if (search) {
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { createdBy: { contains: search, mode: 'insensitive' } },
      { payrollMode: { contains: search, mode: 'insensitive' } },
      { status: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [periods, total] = await Promise.all([
    prisma.payrollPeriod.findMany({ where, skip, take, orderBy: { [sortBy]: sortOrder } }),
    prisma.payrollPeriod.count({ where }),
  ]);

  const ids = periods.map((p) => p.id);
  if (!ids.length) {
    return { data: periods, total, where };
  }

  const grouped = await prisma.payrollEntry.groupBy({
    by: ['payrollPeriodId'],
    where: { payrollPeriodId: { in: ids } },
    _count: { id: true },
    _sum: {
      grossPay: true,
      totalDeductions: true,
      netPay: true,
      overtimeAmount: true,
      loanDeductionAmount: true,
    },
  });

  const groupedMap = new Map(grouped.map((g) => [g.payrollPeriodId, g]));
  const data = periods.map((period) => {
    const g = groupedMap.get(period.id);
    return {
      ...period,
      entryCount: g?._count?.id || 0,
      totalGrossPay: g?._sum?.grossPay || 0,
      totalDeductions: g?._sum?.totalDeductions || 0,
      totalNetPay: g?._sum?.netPay || 0,
      totalOvertimeAmount: g?._sum?.overtimeAmount || 0,
      totalLoanDeductionAmount: g?._sum?.loanDeductionAmount || 0,
    };
  });

  return { data, total, where };
}

async function getPayrollPeriodById(id) {
  return prisma.payrollPeriod.findUnique({ where: { id } });
}

async function createPayrollEntry(payload) {
  return prisma.payrollEntry.create({
    data: payload,
    include: {
      employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
      payrollPeriod: true,
    },
  });
}

async function updatePayrollEntry(id, payload) {
  return prisma.payrollEntry.update({
    where: { id },
    data: payload,
    include: {
      employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
      payrollPeriod: true,
    },
  });
}

async function getPayrollEntryById(id) {
  return prisma.payrollEntry.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
      payrollPeriod: true,
    },
  });
}

async function listPayrollEntries({ payrollPeriodId, employeeId, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (payrollPeriodId) where.payrollPeriodId = payrollPeriodId;
  if (employeeId) where.employeeId = employeeId;

  const [data, total] = await Promise.all([
    prisma.payrollEntry.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
        payrollPeriod: true,
      },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.payrollEntry.count({ where }),
  ]);

  return { data, total, where };
}

async function createEmployeeLoan(payload) {
  return prisma.employeeLoan.create({
    data: payload,
    include: { employee: true },
  });
}

async function updateEmployeeLoan(id, payload) {
  return prisma.employeeLoan.update({
    where: { id },
    data: payload,
    include: { employee: true },
  });
}

async function getEmployeeLoanById(id) {
  return prisma.employeeLoan.findUnique({
    where: { id },
    include: { employee: true },
  });
}

async function listEmployeeLoans({ employeeId, status, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.employeeLoan.findMany({
      where,
      include: { employee: true },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.employeeLoan.count({ where }),
  ]);

  return { data, total, where };
}

async function createLoanTransaction(payload) {
  return prisma.employeeLoanTransaction.create({
    data: payload,
    include: { employeeLoan: true, payrollPeriod: true },
  });
}

async function updateLoanTransaction(id, payload) {
  return prisma.employeeLoanTransaction.update({
    where: { id },
    data: payload,
    include: { employeeLoan: true, payrollPeriod: true },
  });
}

async function listLoanTransactions({ employeeLoanId, payrollPeriodId, transactionType, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (employeeLoanId) where.employeeLoanId = employeeLoanId;
  if (payrollPeriodId) where.payrollPeriodId = payrollPeriodId;
  if (transactionType) where.transactionType = transactionType;

  const [data, total] = await Promise.all([
    prisma.employeeLoanTransaction.findMany({
      where,
      include: { employeeLoan: true, payrollPeriod: true },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.employeeLoanTransaction.count({ where }),
  ]);

  return { data, total, where };
}

async function createTermination(payload) {
  return prisma.employeeTermination.create({
    data: payload,
    include: { employee: true },
  });
}

async function updateTermination(id, payload) {
  return prisma.employeeTermination.update({
    where: { id },
    data: payload,
    include: { employee: true },
  });
}

async function listTerminations({ employeeId, startDate, endDate, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (startDate || endDate) {
    where.terminationDate = {};
    if (startDate) where.terminationDate.gte = startDate;
    if (endDate) where.terminationDate.lte = endDate;
  }

  const [data, total] = await Promise.all([
    prisma.employeeTermination.findMany({ where, include: { employee: true }, skip, take, orderBy: { [sortBy]: sortOrder } }),
    prisma.employeeTermination.count({ where }),
  ]);

  return { data, total, where };
}

async function createReengagement(payload) {
  return prisma.employeeReengagement.create({
    data: payload,
    include: { employee: true },
  });
}

async function updateReengagement(id, payload) {
  return prisma.employeeReengagement.update({
    where: { id },
    data: payload,
    include: { employee: true },
  });
}

async function listReengagements({ employeeId, startDate, endDate, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (startDate || endDate) {
    where.effectiveDate = {};
    if (startDate) where.effectiveDate.gte = startDate;
    if (endDate) where.effectiveDate.lte = endDate;
  }

  const [data, total] = await Promise.all([
    prisma.employeeReengagement.findMany({ where, include: { employee: true }, skip, take, orderBy: { [sortBy]: sortOrder } }),
    prisma.employeeReengagement.count({ where }),
  ]);

  return { data, total, where };
}

async function bulkImportPayrollPeriods(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    if (!row.payrollMode) {
      result.skipped += 1;
      continue;
    }

    const reportingPeriodId = row.reportingPeriodId || null;
    const payrollMode = row.payrollMode;
    const description = row.description || null;

    const existing = await prisma.payrollPeriod.findFirst({
      where: { reportingPeriodId, payrollMode, description },
    });

    if (existing) {
      await prisma.payrollPeriod.update({
        where: { id: existing.id },
        data: {
          status: row.status || existing.status,
          createdBy: row.createdBy || existing.createdBy,
        },
      });
      result.updated += 1;
    } else {
      await prisma.payrollPeriod.create({
        data: {
          reportingPeriodId,
          payrollMode,
          description,
          status: row.status || 'draft',
          createdBy: row.createdBy || null,
        },
      });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkImportPayrollEntries(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const payrollPeriodId = Number(row.payrollPeriodId);
    const employeeId = Number(row.employeeId);

    if (!Number.isInteger(payrollPeriodId) || !Number.isInteger(employeeId)) {
      result.skipped += 1;
      continue;
    }

    const data = {
      payrollPeriodId,
      employeeId,
      basicSalary: Number(row.basicSalary || 0),
      incrementAmount: Number(row.incrementAmount || 0),
      grossPay: Number(row.grossPay || 0),
      totalDeductions: Number(row.totalDeductions || 0),
      netPay: Number(row.netPay || 0),
      daysWorked: row.daysWorked !== undefined ? Number(row.daysWorked) : null,
      daysAbsent: row.daysAbsent !== undefined ? Number(row.daysAbsent) : null,
      overtimeHours: row.overtimeHours !== undefined ? Number(row.overtimeHours) : null,
      overtimeAmount: row.overtimeAmount !== undefined ? Number(row.overtimeAmount) : null,
      loanDeductionAmount: row.loanDeductionAmount !== undefined ? Number(row.loanDeductionAmount) : null,
      otherDeductionAmount: row.otherDeductionAmount !== undefined ? Number(row.otherDeductionAmount) : null,
      bonusAmount: row.bonusAmount !== undefined ? Number(row.bonusAmount) : null,
      giftAmount: row.giftAmount !== undefined ? Number(row.giftAmount) : null,
      leavePayAmount: row.leavePayAmount !== undefined ? Number(row.leavePayAmount) : null,
      payeAmount: row.payeAmount !== undefined ? Number(row.payeAmount) : null,
      notes: row.notes || null,
    };

    const existing = await prisma.payrollEntry.findUnique({
      where: {
        payrollPeriodId_employeeId: {
          payrollPeriodId,
          employeeId,
        },
      },
    });

    if (existing) {
      await prisma.payrollEntry.update({ where: { id: existing.id }, data });
      result.updated += 1;
    } else {
      await prisma.payrollEntry.create({ data });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkImportLoans(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const employeeId = Number(row.employeeId);
    if (!Number.isInteger(employeeId)) {
      result.skipped += 1;
      continue;
    }

    const loanReference = row.loanReference ? String(row.loanReference).trim() : null;
    const principalAmount = Number(row.principalAmount || 0);
    const balanceAmount = Number(row.balanceAmount || principalAmount);

    if (!Number.isFinite(principalAmount) || !Number.isFinite(balanceAmount)) {
      result.skipped += 1;
      continue;
    }

    let existing = null;

    if (loanReference) {
      existing = await prisma.employeeLoan.findUnique({ where: { loanReference } });
    }

    const data = {
      employeeId,
      loanReference,
      principalAmount,
      balanceAmount,
      monthlyDeductionAmount: row.monthlyDeductionAmount !== undefined ? Number(row.monthlyDeductionAmount) : null,
      startDate: parseDate(row.startDate),
      endDate: parseDate(row.endDate),
      status: row.status || 'active',
      notes: row.notes || null,
    };

    if (existing) {
      await prisma.employeeLoan.update({ where: { id: existing.id }, data });
      result.updated += 1;
    } else {
      await prisma.employeeLoan.create({ data });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkImportLoanTransactions(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const employeeLoanId = Number(row.employeeLoanId);
    const amount = Number(row.amount);
    const transactionType = row.transactionType ? String(row.transactionType).trim().toLowerCase() : null;

    if (!Number.isInteger(employeeLoanId) || !Number.isFinite(amount) || !transactionType) {
      result.skipped += 1;
      continue;
    }

    const payrollPeriodId = row.payrollPeriodId ? Number(row.payrollPeriodId) : null;

    const existing = await prisma.employeeLoanTransaction.findFirst({
      where: {
        employeeLoanId,
        payrollPeriodId: Number.isInteger(payrollPeriodId) ? payrollPeriodId : null,
        transactionType,
        amount,
        notes: row.notes || null,
      },
    });

    const payload = {
      employeeLoanId,
      payrollPeriodId: Number.isInteger(payrollPeriodId) ? payrollPeriodId : null,
      transactionType,
      amount,
      notes: row.notes || null,
    };

    if (existing) {
      await prisma.employeeLoanTransaction.update({ where: { id: existing.id }, data: payload });
      result.updated += 1;
    } else {
      await prisma.employeeLoanTransaction.create({ data: payload });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkImportTerminations(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const employeeId = Number(row.employeeId);
    const terminationDate = parseDate(row.terminationDate);

    if (!Number.isInteger(employeeId) || !terminationDate) {
      result.skipped += 1;
      continue;
    }

    const existing = await prisma.employeeTermination.findFirst({
      where: { employeeId, terminationDate },
    });

    const data = {
      employeeId,
      terminationDate,
      reason: row.reason || null,
      daysWorkedInFinalMonth: row.daysWorkedInFinalMonth !== undefined ? Number(row.daysWorkedInFinalMonth) : null,
      halfPayReceived: row.halfPayReceived !== undefined ? Number(row.halfPayReceived) : null,
      settlementAmount: row.settlementAmount !== undefined ? Number(row.settlementAmount) : null,
      notes: row.notes || null,
    };

    if (existing) {
      await prisma.employeeTermination.update({ where: { id: existing.id }, data });
      result.updated += 1;
    } else {
      await prisma.employeeTermination.create({ data });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkImportReengagements(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const employeeId = Number(row.employeeId);
    const effectiveDate = parseDate(row.effectiveDate);

    if (!Number.isInteger(employeeId) || !effectiveDate) {
      result.skipped += 1;
      continue;
    }

    const existing = await prisma.employeeReengagement.findFirst({
      where: { employeeId, effectiveDate },
    });

    const data = {
      employeeId,
      previousWage: row.previousWage !== undefined ? Number(row.previousWage) : null,
      reengagementWage: row.reengagementWage !== undefined ? Number(row.reengagementWage) : null,
      occupation: row.occupation || null,
      effectiveDate,
      contractExpiryDate: parseDate(row.contractExpiryDate),
      notes: row.notes || null,
    };

    if (existing) {
      await prisma.employeeReengagement.update({ where: { id: existing.id }, data });
      result.updated += 1;
    } else {
      await prisma.employeeReengagement.create({ data });
      result.inserted += 1;
    }
  }

  return result;
}

module.exports = {
  createPayrollPeriod,
  updatePayrollPeriod,
  listPayrollPeriods,
  getPayrollPeriodById,
  createPayrollEntry,
  updatePayrollEntry,
  getPayrollEntryById,
  listPayrollEntries,
  createEmployeeLoan,
  updateEmployeeLoan,
  getEmployeeLoanById,
  listEmployeeLoans,
  createLoanTransaction,
  updateLoanTransaction,
  listLoanTransactions,
  createTermination,
  updateTermination,
  listTerminations,
  createReengagement,
  updateReengagement,
  listReengagements,
  bulkImportPayrollPeriods,
  bulkImportPayrollEntries,
  bulkImportLoans,
  bulkImportLoanTransactions,
  bulkImportTerminations,
  bulkImportReengagements,
};
