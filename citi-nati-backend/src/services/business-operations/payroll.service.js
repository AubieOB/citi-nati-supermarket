'use strict';

const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

function modelHasField(modelName, fieldName) {
  try {
    const model = prisma?._runtimeDataModel?.models?.[modelName];
    return Array.isArray(model?.fields) && model.fields.some((field) => field.name === fieldName);
  } catch (_error) {
    return false;
  }
}

const payrollPeriodHasLocation = modelHasField('PayrollPeriod', 'locationId');

async function validatePayrollEntryLocationAlignment(payload, existingEntryId = null) {
  const payrollPeriodId = payload?.payrollPeriodId;
  const employeeId = payload?.employeeId;
  if (!payrollPeriodId || !employeeId || !payrollPeriodHasLocation) return;

  const [period, employee] = await Promise.all([
    prisma.payrollPeriod.findUnique({ where: { id: payrollPeriodId }, select: { id: true, locationId: true } }),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, locationId: true } }),
  ]);

  if (!period) {
    const error = new Error('Payroll period not found.');
    error.statusCode = 400;
    throw error;
  }

  if (!employee) {
    const error = new Error('Employee not found.');
    error.statusCode = 400;
    throw error;
  }

  if (!period.locationId) return;

  if (!employee.locationId || Number(employee.locationId) !== Number(period.locationId)) {
    const error = new Error('Selected employee location does not match the payroll period location.');
    error.statusCode = 400;
    error.details = { existingEntryId, payrollPeriodId: period.id, employeeId: employee.id };
    throw error;
  }
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function isMissingColumnError(err, columnName = null) {
  const missing = err?.code === 'P2022';
  if (!missing) return false;
  if (!columnName) return true;
  return String(err?.meta?.column || '').toLowerCase().includes(String(columnName).toLowerCase());
}

function isMissingPayrollPeriodsColumnError(err) {
  return isMissingColumnError(err) && String(err?.meta?.column || '').toLowerCase().startsWith('payroll_periods.');
}

function isMissingTableError(err, tableName = null) {
  const missing = err?.code === 'P2021';
  if (!missing) return false;
  if (!tableName) return true;
  return String(err?.meta?.table || '').toLowerCase().includes(String(tableName).toLowerCase());
}

function mapLegacyPeriodRow(row) {
  return {
    id: Number(row.id),
    reportingPeriodId: row.reporting_period_id === null ? null : Number(row.reporting_period_id),
    payrollMode: row.payroll_mode,
    locationId: null,
    payrollMonth: null,
    payrollYear: null,
    payrollPositionInMonth: null,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    runStartedAt: null,
    finalizedAt: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listPayrollPeriodsLegacy({ search, status, payrollMode, reportingPeriodId, locationId, skip, take, sortBy, sortOrder }) {
  const whereParts = [];

  if (status) whereParts.push(Prisma.sql`p.status = ${status}`);
  if (payrollMode) whereParts.push(Prisma.sql`p.payroll_mode = ${payrollMode}`);
  if (reportingPeriodId) whereParts.push(Prisma.sql`p.reporting_period_id = ${reportingPeriodId}`);

  if (search) {
    const like = `%${search}%`;
    whereParts.push(Prisma.sql`(
      p.description ILIKE ${like}
      OR p.created_by ILIKE ${like}
      OR p.payroll_mode ILIKE ${like}
      OR p.status ILIKE ${like}
    )`);
  }

  if (locationId) {
    whereParts.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      WHERE pe.payroll_period_id = p.id
        AND e.location_id = ${locationId}
    )`);
  }

  const whereSql = whereParts.length
    ? Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`
    : Prisma.empty;

  const legacySortMap = {
    id: Prisma.sql`p.id`,
    payrollMode: Prisma.sql`p.payroll_mode`,
    status: Prisma.sql`p.status`,
    createdAt: Prisma.sql`p.created_at`,
    updatedAt: Prisma.sql`p.updated_at`,
  };
  const orderColumn = legacySortMap[sortBy] || Prisma.sql`p.created_at`;
  const orderDirection = String(sortOrder).toLowerCase() === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const rows = await prisma.$queryRaw`
    SELECT
      p.id,
      p.reporting_period_id,
      p.payroll_mode,
      p.description,
      p.status,
      p.created_by,
      p.created_at,
      p.updated_at
    FROM payroll_periods p
    ${whereSql}
    ORDER BY ${orderColumn} ${orderDirection}
    OFFSET ${skip}
    LIMIT ${take}
  `;

  const countRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM payroll_periods p
    ${whereSql}
  `;

  return {
    periods: Array.isArray(rows) ? rows.map(mapLegacyPeriodRow) : [],
    total: Array.isArray(countRows) && countRows[0] ? Number(countRows[0].total || 0) : 0,
  };
}

async function createPayrollPeriod(payload) {
  const createData = {
    reportingPeriodId: payload.reportingPeriodId || null,
    payrollMode: payload.payrollMode,
    payrollMonth: payload.payrollMonth || null,
    payrollYear: payload.payrollYear || null,
    payrollPositionInMonth: payload.payrollPositionInMonth || null,
    description: payload.description || null,
    status: payload.status || 'draft',
    runStartedAt: payload.runStartedAt || null,
    finalizedAt: payload.finalizedAt || null,
    createdBy: payload.createdBy || null,
  };

  if (payrollPeriodHasLocation && payload.locationId !== undefined) {
    createData.locationId = payload.locationId || null;
  }

  try {
    return await prisma.payrollPeriod.create({
      data: createData,
    });
  } catch (err) {
    if (!isMissingPayrollPeriodsColumnError(err)) throw err;
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
}

async function updatePayrollPeriod(id, payload) {
  const updateData = {
    reportingPeriodId: payload.reportingPeriodId,
    payrollMode: payload.payrollMode,
    payrollMonth: payload.payrollMonth,
    payrollYear: payload.payrollYear,
    payrollPositionInMonth: payload.payrollPositionInMonth,
    description: payload.description,
    status: payload.status,
    runStartedAt: payload.runStartedAt,
    finalizedAt: payload.finalizedAt,
    createdBy: payload.createdBy,
  };

  if (payrollPeriodHasLocation && payload.locationId !== undefined) {
    updateData.locationId = payload.locationId;
  }

  try {
    return await prisma.payrollPeriod.update({
      where: { id },
      data: updateData,
    });
  } catch (err) {
    if (!isMissingPayrollPeriodsColumnError(err)) throw err;
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
}

async function listPayrollPeriods({ search, status, payrollMode, payrollMonth, payrollYear, reportingPeriodId, locationId, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (status) where.status = status;
  if (payrollMode) where.payrollMode = payrollMode;
  if (payrollMonth) where.payrollMonth = payrollMonth;
  if (payrollYear) where.payrollYear = payrollYear;
  if (reportingPeriodId) where.reportingPeriodId = reportingPeriodId;
  if (locationId) {
    if (payrollPeriodHasLocation) {
      where.locationId = locationId;
    } else {
      where.entries = {
        some: {
          employee: { locationId },
        },
      };
    }
  }
  if (search) {
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { createdBy: { contains: search, mode: 'insensitive' } },
      { payrollMode: { contains: search, mode: 'insensitive' } },
      { status: { contains: search, mode: 'insensitive' } },
    ];
  }

  let periods = [];
  let total = 0;

  try {
    [periods, total] = await Promise.all([
      prisma.payrollPeriod.findMany({ where, skip, take, orderBy: { [sortBy]: sortOrder } }),
      prisma.payrollPeriod.count({ where }),
    ]);
  } catch (err) {
    if (!isMissingPayrollPeriodsColumnError(err)) throw err;
    const legacy = await listPayrollPeriodsLegacy({ search, status, payrollMode, reportingPeriodId, locationId, skip, take, sortBy, sortOrder });
    periods = legacy.periods;
    total = legacy.total;
  }

  const ids = periods.map((p) => p.id);
  if (!ids.length) {
    return { data: periods, total, where };
  }

  let grouped = [];
  try {
    grouped = await prisma.payrollEntry.groupBy({
      by: ['payrollPeriodId'],
      where: { payrollPeriodId: { in: ids } },
      _count: { id: true },
      _sum: {
        grossPay: true,
        totalDeductions: true,
        netPay: true,
        overtimeAmount: true,
        loanDeductionAmount: true,
        accruedInterestAtPayroll: true,
      },
    });
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    const counts = await prisma.$queryRaw`
      SELECT payroll_period_id AS "payrollPeriodId", COUNT(*)::int AS "entryCount"
      FROM payroll_entries
      WHERE payroll_period_id IN (${Prisma.join(ids)})
      GROUP BY payroll_period_id
    `;
    grouped = (Array.isArray(counts) ? counts : []).map((row) => ({
      payrollPeriodId: Number(row.payrollPeriodId),
      _count: { id: Number(row.entryCount || 0) },
      _sum: {
        grossPay: 0,
        totalDeductions: 0,
        netPay: 0,
        overtimeAmount: 0,
        loanDeductionAmount: 0,
        accruedInterestAtPayroll: 0,
      },
    }));
  }

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
      totalAccruedInterestAtPayroll: g?._sum?.accruedInterestAtPayroll || 0,
    };
  });

  return { data, total, where };
}

async function getPayrollPeriodById(id) {
  try {
    return await prisma.payrollPeriod.findUnique({ where: { id } });
  } catch (err) {
    if (!isMissingPayrollPeriodsColumnError(err)) throw err;
    const rows = await prisma.$queryRaw`
      SELECT
        p.id,
        p.reporting_period_id,
        p.payroll_mode,
        p.description,
        p.status,
        p.created_by,
        p.created_at,
        p.updated_at
      FROM payroll_periods p
      WHERE p.id = ${id}
      LIMIT 1
    `;
    if (!Array.isArray(rows) || !rows[0]) return null;
    return mapLegacyPeriodRow(rows[0]);
  }
}

async function createPayrollEntry(payload) {
  await validatePayrollEntryLocationAlignment(payload);
  return prisma.payrollEntry.create({
    data: payload,
    include: {
      employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
      payrollPeriod: true,
    },
  });
}

async function updatePayrollEntry(id, payload) {
  const currentEntry = await prisma.payrollEntry.findUnique({
    where: { id },
    select: { payrollPeriodId: true, employeeId: true },
  });
  if (!currentEntry) {
    const error = new Error('Payroll entry not found.');
    error.statusCode = 400;
    throw error;
  }

  await validatePayrollEntryLocationAlignment({
    payrollPeriodId: payload.payrollPeriodId || currentEntry.payrollPeriodId,
    employeeId: payload.employeeId || currentEntry.employeeId,
  }, id);

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

async function listPayrollEntries({ payrollPeriodId, employeeId, locationId, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (payrollPeriodId) where.payrollPeriodId = payrollPeriodId;
  if (employeeId) where.employeeId = employeeId;
  if (locationId) {
    where.employee = { locationId };
  }

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

async function createTaxBracket(payload) {
  return prisma.payrollTaxBracket.create({ data: payload });
}

async function updateTaxBracket(id, payload) {
  return prisma.payrollTaxBracket.update({ where: { id }, data: payload });
}

async function listTaxBrackets({ locationId, isActive, effectiveDate, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (locationId) where.locationId = locationId;
  if (isActive !== null && isActive !== undefined) where.isActive = Boolean(isActive);
  if (effectiveDate) {
    where.effectiveFrom = { lte: effectiveDate };
    where.OR = [
      { effectiveTo: null },
      { effectiveTo: { gte: effectiveDate } },
    ];
  }

  let data = [];
  let total = 0;

  try {
    [data, total] = await Promise.all([
      prisma.payrollTaxBracket.findMany({ where, skip, take, orderBy: { [sortBy]: sortOrder } }),
      prisma.payrollTaxBracket.count({ where }),
    ]);
  } catch (err) {
    if (!isMissingTableError(err, 'payroll_tax_brackets')) throw err;
    return { data: [], total: 0, where };
  }

  return { data, total, where };
}

async function createIncrementPolicy(payload) {
  return prisma.payrollIncrementPolicy.create({ data: payload });
}

async function updateIncrementPolicy(id, payload) {
  return prisma.payrollIncrementPolicy.update({ where: { id }, data: payload });
}

async function listIncrementPolicies({ locationId, isActive, effectiveDate, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (locationId) where.locationId = locationId;
  if (isActive !== null && isActive !== undefined) where.isActive = Boolean(isActive);
  if (effectiveDate) {
    where.effectiveFrom = { lte: effectiveDate };
    where.OR = [
      { effectiveTo: null },
      { effectiveTo: { gte: effectiveDate } },
    ];
  }

  let data = [];
  let total = 0;

  try {
    [data, total] = await Promise.all([
      prisma.payrollIncrementPolicy.findMany({ where, skip, take, orderBy: { [sortBy]: sortOrder } }),
      prisma.payrollIncrementPolicy.count({ where }),
    ]);
  } catch (err) {
    if (!isMissingTableError(err, 'payroll_increment_policies')) throw err;
    return { data: [], total: 0, where };
  }

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
    const payrollMonth = row.payrollMonth ? Number(row.payrollMonth) : null;
    const payrollYear = row.payrollYear ? Number(row.payrollYear) : null;
    const payrollPositionInMonth = row.payrollPositionInMonth ? Number(row.payrollPositionInMonth) : null;

    const existing = await prisma.payrollPeriod.findFirst({
      where: { reportingPeriodId, payrollMode, description },
    });

    if (existing) {
      await prisma.payrollPeriod.update({
        where: { id: existing.id },
        data: {
          locationId: row.locationId || existing.locationId || null,
          payrollMonth: Number.isInteger(payrollMonth) ? payrollMonth : existing.payrollMonth,
          payrollYear: Number.isInteger(payrollYear) ? payrollYear : existing.payrollYear,
          payrollPositionInMonth: Number.isInteger(payrollPositionInMonth) ? payrollPositionInMonth : existing.payrollPositionInMonth,
          status: row.status || existing.status,
          runStartedAt: parseDate(row.runStartedAt) || existing.runStartedAt,
          finalizedAt: parseDate(row.finalizedAt) || existing.finalizedAt,
          createdBy: row.createdBy || existing.createdBy,
        },
      });
      result.updated += 1;
    } else {
      await prisma.payrollPeriod.create({
        data: {
          reportingPeriodId,
          payrollMode,
          locationId: row.locationId || null,
          payrollMonth: Number.isInteger(payrollMonth) ? payrollMonth : null,
          payrollYear: Number.isInteger(payrollYear) ? payrollYear : null,
          payrollPositionInMonth: Number.isInteger(payrollPositionInMonth) ? payrollPositionInMonth : null,
          description,
          status: row.status || 'draft',
          runStartedAt: parseDate(row.runStartedAt),
          finalizedAt: parseDate(row.finalizedAt),
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
      overtimeNormalHours: row.overtimeNormalHours !== undefined ? Number(row.overtimeNormalHours) : null,
      overtimeDoubleHours: row.overtimeDoubleHours !== undefined ? Number(row.overtimeDoubleHours) : null,
      overtimeAmount: row.overtimeAmount !== undefined ? Number(row.overtimeAmount) : null,
      overtimeNormalAmount: row.overtimeNormalAmount !== undefined ? Number(row.overtimeNormalAmount) : null,
      overtimeDoubleAmount: row.overtimeDoubleAmount !== undefined ? Number(row.overtimeDoubleAmount) : null,
      loanDeductionAmount: row.loanDeductionAmount !== undefined ? Number(row.loanDeductionAmount) : null,
      absenceDeductionAmount: row.absenceDeductionAmount !== undefined ? Number(row.absenceDeductionAmount) : null,
      otherDeductionAmount: row.otherDeductionAmount !== undefined ? Number(row.otherDeductionAmount) : null,
      bonusAmount: row.bonusAmount !== undefined ? Number(row.bonusAmount) : null,
      giftAmount: row.giftAmount !== undefined ? Number(row.giftAmount) : null,
      leavePayAmount: row.leavePayAmount !== undefined ? Number(row.leavePayAmount) : null,
      payeAmount: row.payeAmount !== undefined ? Number(row.payeAmount) : null,
      loanBalanceAtPayroll: row.loanBalanceAtPayroll !== undefined ? Number(row.loanBalanceAtPayroll) : null,
      accruedInterestAtPayroll: row.accruedInterestAtPayroll !== undefined ? Number(row.accruedInterestAtPayroll) : null,
      netPayMidPortion: row.netPayMidPortion !== undefined ? Number(row.netPayMidPortion) : null,
      netPayEndPortion: row.netPayEndPortion !== undefined ? Number(row.netPayEndPortion) : null,
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
      interestRate: row.interestRate !== undefined ? Number(row.interestRate) : null,
      accruedInterest: row.accruedInterest !== undefined ? Number(row.accruedInterest) : null,
      loanGrantedMonth: row.loanGrantedMonth !== undefined ? Number(row.loanGrantedMonth) : null,
      loanGrantedYear: row.loanGrantedYear !== undefined ? Number(row.loanGrantedYear) : null,
      monthlyDeductionAmount: row.monthlyDeductionAmount !== undefined ? Number(row.monthlyDeductionAmount) : null,
      repaymentEndMonth: row.repaymentEndMonth !== undefined ? Number(row.repaymentEndMonth) : null,
      repaymentEndYear: row.repaymentEndYear !== undefined ? Number(row.repaymentEndYear) : null,
      reason: row.reason || null,
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
      principalComponent: row.principalComponent !== undefined ? Number(row.principalComponent) : null,
      interestComponent: row.interestComponent !== undefined ? Number(row.interestComponent) : null,
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
      terminationType: row.terminationType || null,
      daysWorkedInFinalMonth: row.daysWorkedInFinalMonth !== undefined ? Number(row.daysWorkedInFinalMonth) : null,
      halfPayReceived: row.halfPayReceived !== undefined ? Number(row.halfPayReceived) : null,
      halfPayDueInTerminationMonth: row.halfPayDueInTerminationMonth !== undefined ? Number(row.halfPayDueInTerminationMonth) : null,
      amountPaidInTerminationMonth: row.amountPaidInTerminationMonth !== undefined ? Number(row.amountPaidInTerminationMonth) : null,
      leavePayAccruedDays: row.leavePayAccruedDays !== undefined ? Number(row.leavePayAccruedDays) : null,
      leavePayAmount: row.leavePayAmount !== undefined ? Number(row.leavePayAmount) : null,
      outstandingLoanObligations: row.outstandingLoanObligations !== undefined ? Number(row.outstandingLoanObligations) : null,
      grossSettlementAmount: row.grossSettlementAmount !== undefined ? Number(row.grossSettlementAmount) : null,
      netSettlementAmount: row.netSettlementAmount !== undefined ? Number(row.netSettlementAmount) : null,
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
      linkedTerminationId: row.linkedTerminationId !== undefined ? Number(row.linkedTerminationId) : null,
      wageAtRetrenchment: row.wageAtRetrenchment !== undefined ? Number(row.wageAtRetrenchment) : null,
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
  createTaxBracket,
  updateTaxBracket,
  listTaxBrackets,
  createIncrementPolicy,
  updateIncrementPolicy,
  listIncrementPolicies,
  bulkImportPayrollPeriods,
  bulkImportPayrollEntries,
  bulkImportLoans,
  bulkImportLoanTransactions,
  bulkImportTerminations,
  bulkImportReengagements,
};
