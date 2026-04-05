'use strict';

const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const tableColumnCache = new Map();

async function getTableColumns(tableName) {
  if (tableColumnCache.has(tableName)) {
    return tableColumnCache.get(tableName);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `,
    tableName,
  );

  const set = new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.column_name)));
  tableColumnCache.set(tableName, set);
  return set;
}

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

  let period;
  let employee;

  try {
    [period, employee] = await Promise.all([
      prisma.payrollPeriod.findUnique({ where: { id: payrollPeriodId }, select: { id: true, locationId: true } }),
      prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, locationId: true } }),
    ]);
  } catch (err) {
    if (isMissingPayrollPeriodsColumnError(err)) {
      return;
    }
    throw err;
  }

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

function isMissingPayrollEntriesColumnError(err) {
  return isMissingColumnError(err) && String(err?.meta?.column || '').toLowerCase().startsWith('payroll_entries.');
}

function isMissingTerminationsColumnError(err) {
  return isMissingColumnError(err) && String(err?.meta?.column || '').toLowerCase().startsWith('employee_terminations.');
}

function isMissingReengagementsColumnError(err) {
  return isMissingColumnError(err) && String(err?.meta?.column || '').toLowerCase().startsWith('employee_reengagements.');
}

function isMissingLoansColumnError(err) {
  return isMissingColumnError(err) && String(err?.meta?.column || '').toLowerCase().startsWith('employee_loans.');
}

function isMissingLoanTransactionsColumnError(err) {
  return isMissingColumnError(err) && String(err?.meta?.column || '').toLowerCase().startsWith('employee_loan_transactions.');
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
    reportingPeriodId: row.reporting_period_id === undefined || row.reporting_period_id === null ? null : Number(row.reporting_period_id),
    payrollMode: row.payroll_mode || null,
    locationId: null,
    payrollMonth: null,
    payrollYear: null,
    payrollPositionInMonth: null,
    description: row.description ?? null,
    status: row.status ?? 'draft',
    createdBy: row.created_by ?? null,
    runStartedAt: null,
    finalizedAt: null,
    createdAt: row.created_at || new Date(),
    updatedAt: row.updated_at || new Date(),
  };
}

function mapLegacyPayrollEntryRow(row) {
  return {
    id: Number(row.id),
    payrollPeriodId: Number(row.payroll_period_id),
    employeeId: Number(row.employee_id),
    basicSalary: Number(row.basic_salary || 0),
    incrementAmount: Number(row.increment_amount || 0),
    grossPay: Number(row.gross_pay || 0),
    totalDeductions: Number(row.total_deductions || 0),
    netPay: Number(row.net_pay || 0),
    daysWorked: row.days_worked === null ? null : Number(row.days_worked),
    daysAbsent: row.days_absent === null ? null : Number(row.days_absent),
    overtimeHours: row.overtime_hours === null ? null : Number(row.overtime_hours),
    overtimeNormalHours: null,
    overtimeDoubleHours: null,
    overtimeAmount: row.overtime_amount === null ? null : Number(row.overtime_amount),
    overtimeNormalAmount: null,
    overtimeDoubleAmount: null,
    loanDeductionAmount: row.loan_deduction_amount === null ? null : Number(row.loan_deduction_amount),
    absenceDeductionAmount: null,
    otherDeductionAmount: row.other_deduction_amount === null ? null : Number(row.other_deduction_amount),
    bonusAmount: row.bonus_amount === null ? null : Number(row.bonus_amount),
    giftAmount: row.gift_amount === null ? null : Number(row.gift_amount),
    leavePayAmount: row.leave_pay_amount === null ? null : Number(row.leave_pay_amount),
    payeAmount: row.paye_amount === null ? null : Number(row.paye_amount),
    loanBalanceAtPayroll: null,
    accruedInterestAtPayroll: null,
    netPayMidPortion: null,
    netPayEndPortion: null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    employee: {
      id: Number(row.employee_id),
      employeeNo: row.employee_no,
      firstName: row.first_name,
      surname: row.surname,
    },
    payrollPeriod: {
      id: Number(row.payroll_period_id),
      payrollMode: row.payroll_mode,
    },
  };
}

function mapLegacyLoanRow(row) {
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    loanReference: row.loan_reference ?? null,
    principalAmount: Number(row.principal_amount || 0),
    balanceAmount: Number(row.balance_amount || 0),
    interestRate: null,
    accruedInterest: null,
    loanGrantedMonth: null,
    loanGrantedYear: null,
    monthlyDeductionAmount: row.monthly_deduction_amount != null ? Number(row.monthly_deduction_amount) : null,
    repaymentEndMonth: null,
    repaymentEndYear: null,
    reason: null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    status: row.status ?? 'active',
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    employee: row.employee_id ? {
      id: Number(row.employee_id),
      employeeNo: row.employee_no ?? null,
      firstName: row.first_name ?? null,
      surname: row.surname ?? null,
    } : undefined,
  };
}

async function listPayrollPeriodsLegacy({ search, status, payrollMode, reportingPeriodId, locationId, skip, take, sortBy, sortOrder }) {
  const periodColumns = await getTableColumns('payroll_periods');
  const conditions = [];
  const params = [];

  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (status && periodColumns.has('status')) conditions.push(`p.status = ${bind(status)}`);
  if (payrollMode && periodColumns.has('payroll_mode')) conditions.push(`p.payroll_mode = ${bind(payrollMode)}`);
  if (reportingPeriodId && periodColumns.has('reporting_period_id')) conditions.push(`p.reporting_period_id = ${bind(reportingPeriodId)}`);

  if (search) {
    const like = `%${search}%`;
    const searchParts = [];
    if (periodColumns.has('description')) searchParts.push(`p.description ILIKE ${bind(like)}`);
    if (periodColumns.has('created_by')) searchParts.push(`p.created_by ILIKE ${bind(like)}`);
    if (periodColumns.has('payroll_mode')) searchParts.push(`p.payroll_mode ILIKE ${bind(like)}`);
    if (periodColumns.has('status')) searchParts.push(`p.status ILIKE ${bind(like)}`);
    if (searchParts.length) conditions.push(`(${searchParts.join(' OR ')})`);
  }

  if (locationId) {
    const pLoc = bind(locationId);
    conditions.push(`EXISTS (SELECT 1 FROM payroll_entries pe JOIN employees e ON e.id = pe.employee_id WHERE pe.payroll_period_id = p.id AND e.location_id = ${pLoc})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const legacySortMap = {
    id: 'p.id',
    payrollMode: periodColumns.has('payroll_mode') ? 'p.payroll_mode' : 'p.id',
    status: periodColumns.has('status') ? 'p.status' : 'p.id',
    createdAt: periodColumns.has('created_at') ? 'p.created_at' : 'p.id',
    updatedAt: periodColumns.has('updated_at') ? 'p.updated_at' : (periodColumns.has('created_at') ? 'p.created_at' : 'p.id'),
  };
  const orderColumn = legacySortMap[sortBy] || (periodColumns.has('created_at') ? 'p.created_at' : 'p.id');
  const orderDirection = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const reportingPeriodSelect = periodColumns.has('reporting_period_id') ? 'p.reporting_period_id' : 'NULL::int AS reporting_period_id';
  const payrollModeSelect = periodColumns.has('payroll_mode') ? 'p.payroll_mode' : 'NULL::text AS payroll_mode';
  const descriptionSelect = periodColumns.has('description') ? 'p.description' : 'NULL::text AS description';
  const statusSelect = periodColumns.has('status') ? 'p.status' : `'draft'::text AS status`;
  const createdBySelect = periodColumns.has('created_by') ? 'p.created_by' : 'NULL::text AS created_by';
  const createdAtSelect = periodColumns.has('created_at') ? 'p.created_at' : 'NOW() AS created_at';
  const updatedAtSelect = periodColumns.has('updated_at') ? 'p.updated_at' : 'NOW() AS updated_at';

  const offsetPlaceholder = bind(Number(skip) || 0);
  const limitPlaceholder = bind(Number(take) || 10);

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        p.id,
        ${reportingPeriodSelect},
        ${payrollModeSelect},
        ${descriptionSelect},
        ${statusSelect},
        ${createdBySelect},
        ${createdAtSelect},
        ${updatedAtSelect}
      FROM payroll_periods p
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDirection}
      OFFSET ${offsetPlaceholder}
      LIMIT ${limitPlaceholder}
    `,
    ...params,
  );

  const countRows = await prisma.$queryRawUnsafe(
    `
      SELECT COUNT(*)::int AS total
      FROM payroll_periods p
      ${whereClause}
    `,
    ...params.slice(0, params.length - 2),
  );

  return {
    periods: Array.isArray(rows) ? rows.map(mapLegacyPeriodRow) : [],
    total: Array.isArray(countRows) && countRows[0] ? Number(countRows[0].total || 0) : 0,
  };
}

async function listPayrollEntriesLegacy({ payrollPeriodId, employeeId, locationId, skip, take, sortBy, sortOrder }) {
  const conditions = [];
  const params = [];

  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (payrollPeriodId) conditions.push(`pe.payroll_period_id = ${bind(payrollPeriodId)}`);
  if (employeeId) conditions.push(`pe.employee_id = ${bind(employeeId)}`);
  if (locationId) conditions.push(`e.location_id = ${bind(locationId)}`);

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap = {
    id: 'pe.id',
    grossPay: 'pe.gross_pay',
    netPay: 'pe.net_pay',
    basicSalary: 'pe.basic_salary',
    createdAt: 'pe.created_at',
    updatedAt: 'pe.updated_at',
  };
  const orderColumn = sortMap[sortBy] || 'pe.created_at';
  const orderDirection = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const offsetPlaceholder = bind(Number(skip) || 0);
  const limitPlaceholder = bind(Number(take) || 10);

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        pe.id,
        pe.payroll_period_id,
        pe.employee_id,
        pe.basic_salary,
        pe.increment_amount,
        pe.gross_pay,
        pe.total_deductions,
        pe.net_pay,
        pe.days_worked,
        pe.days_absent,
        pe.overtime_hours,
        pe.overtime_amount,
        pe.loan_deduction_amount,
        pe.other_deduction_amount,
        pe.bonus_amount,
        pe.gift_amount,
        pe.leave_pay_amount,
        pe.paye_amount,
        pe.notes,
        pe.created_at,
        pe.updated_at,
        e.employee_no,
        e.first_name,
        e.surname,
        pp.payroll_mode
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      LEFT JOIN payroll_periods pp ON pp.id = pe.payroll_period_id
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDirection}
      OFFSET ${offsetPlaceholder}
      LIMIT ${limitPlaceholder}
    `,
    ...params,
  );

  const countRows = await prisma.$queryRawUnsafe(
    `
      SELECT COUNT(*)::int AS total
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      ${whereClause}
    `,
    ...params.slice(0, params.length - 2),
  );

  return {
    data: (Array.isArray(rows) ? rows : []).map(mapLegacyPayrollEntryRow),
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

    const periodColumns = await getTableColumns('payroll_periods');
    const insertColumns = [];
    const insertValues = [];

    const pushValue = (column, value) => {
      if (!periodColumns.has(column)) return;
      insertColumns.push(column);
      insertValues.push(value);
    };

    pushValue('reporting_period_id', payload.reportingPeriodId || null);
    pushValue('payroll_mode', payload.payrollMode);
    pushValue('description', payload.description || null);
    pushValue('status', payload.status || 'draft');
    pushValue('created_by', payload.createdBy || null);
    if (periodColumns.has('created_at')) {
      insertColumns.push('created_at');
      insertValues.push(new Date());
    }
    if (periodColumns.has('updated_at')) {
      insertColumns.push('updated_at');
      insertValues.push(new Date());
    }

    if (!insertColumns.length) {
      throw err;
    }

    const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(', ');
    const createdRows = await prisma.$queryRawUnsafe(
      `
        INSERT INTO payroll_periods (${insertColumns.join(', ')})
        VALUES (${placeholders})
        RETURNING id
      `,
      ...insertValues,
    );

    const createdId = Array.isArray(createdRows) && createdRows[0] ? Number(createdRows[0].id) : null;
    if (!createdId) {
      return mapLegacyPeriodRow({ id: 0, payroll_mode: payload.payrollMode, status: payload.status || 'draft' });
    }
    return getPayrollPeriodById(createdId);
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

    const periodColumns = await getTableColumns('payroll_periods');
    const setClauses = [];
    const values = [];

    const setColumn = (column, value) => {
      if (!periodColumns.has(column) || value === undefined) return;
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    };

    setColumn('reporting_period_id', payload.reportingPeriodId);
    setColumn('payroll_mode', payload.payrollMode);
    setColumn('description', payload.description);
    setColumn('status', payload.status);
    setColumn('created_by', payload.createdBy);
    if (periodColumns.has('updated_at')) {
      values.push(new Date());
      setClauses.push(`updated_at = $${values.length}`);
    }

    if (setClauses.length) {
      values.push(id);
      await prisma.$queryRawUnsafe(
        `
          UPDATE payroll_periods
          SET ${setClauses.join(', ')}
          WHERE id = $${values.length}
        `,
        ...values,
      );
    }

    return getPayrollPeriodById(id);
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
  try {
    return await prisma.payrollEntry.create({
      data: payload,
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
        payrollPeriod: true,
      },
    });
  } catch (err) {
    if (!isMissingPayrollEntriesColumnError(err) && !isMissingPayrollPeriodsColumnError(err)) throw err;
    const legacyPayload = {
      payrollPeriodId: payload.payrollPeriodId,
      employeeId: payload.employeeId,
      basicSalary: payload.basicSalary,
      incrementAmount: payload.incrementAmount,
      grossPay: payload.grossPay,
      totalDeductions: payload.totalDeductions,
      netPay: payload.netPay,
      daysWorked: payload.daysWorked,
      daysAbsent: payload.daysAbsent,
      overtimeHours: payload.overtimeHours,
      overtimeAmount: payload.overtimeAmount,
      loanDeductionAmount: payload.loanDeductionAmount,
      otherDeductionAmount: payload.otherDeductionAmount,
      bonusAmount: payload.bonusAmount,
      giftAmount: payload.giftAmount,
      leavePayAmount: payload.leavePayAmount,
      payeAmount: payload.payeAmount,
      notes: payload.notes,
    };
    return prisma.payrollEntry.create({
      data: legacyPayload,
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
      },
    });
  }
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

  try {
    return await prisma.payrollEntry.update({
      where: { id },
      data: payload,
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
        payrollPeriod: true,
      },
    });
  } catch (err) {
    if (!isMissingPayrollEntriesColumnError(err) && !isMissingPayrollPeriodsColumnError(err)) throw err;
    const legacyPayload = {
      payrollPeriodId: payload.payrollPeriodId,
      employeeId: payload.employeeId,
      basicSalary: payload.basicSalary,
      incrementAmount: payload.incrementAmount,
      grossPay: payload.grossPay,
      totalDeductions: payload.totalDeductions,
      netPay: payload.netPay,
      daysWorked: payload.daysWorked,
      daysAbsent: payload.daysAbsent,
      overtimeHours: payload.overtimeHours,
      overtimeAmount: payload.overtimeAmount,
      loanDeductionAmount: payload.loanDeductionAmount,
      otherDeductionAmount: payload.otherDeductionAmount,
      bonusAmount: payload.bonusAmount,
      giftAmount: payload.giftAmount,
      leavePayAmount: payload.leavePayAmount,
      payeAmount: payload.payeAmount,
      notes: payload.notes,
    };
    return prisma.payrollEntry.update({
      where: { id },
      data: legacyPayload,
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
      },
    });
  }
}

async function getPayrollEntryById(id) {
  try {
    return await prisma.payrollEntry.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, surname: true } },
        payrollPeriod: true,
      },
    });
  } catch (err) {
    if (!isMissingPayrollEntriesColumnError(err) && !isMissingPayrollPeriodsColumnError(err)) throw err;
    const legacy = await listPayrollEntriesLegacy({ payrollPeriodId: null, employeeId: null, locationId: null, skip: 0, take: 5000, sortBy: 'id', sortOrder: 'desc' });
    return legacy.data.find((entry) => Number(entry.id) === Number(id)) || null;
  }
}

async function listPayrollEntries({ payrollPeriodId, employeeId, locationId, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (payrollPeriodId) where.payrollPeriodId = payrollPeriodId;
  if (employeeId) where.employeeId = employeeId;
  if (locationId) {
    where.employee = { locationId };
  }

  let data = [];
  let total = 0;

  try {
    [data, total] = await Promise.all([
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
  } catch (err) {
    if (!isMissingPayrollEntriesColumnError(err) && !isMissingPayrollPeriodsColumnError(err)) throw err;
    const legacy = await listPayrollEntriesLegacy({ payrollPeriodId, employeeId, locationId, skip, take, sortBy, sortOrder });
    data = legacy.data;
    total = legacy.total;
  }

  return { data, total, where };
}

async function createEmployeeLoan(payload) {
  try {
    return await prisma.employeeLoan.create({
      data: payload,
      include: { employee: true },
    });
  } catch (err) {
    if (!isMissingLoansColumnError(err)) throw err;
    const safePayload = {
      employeeId: payload.employeeId,
      loanReference: payload.loanReference || null,
      principalAmount: payload.principalAmount,
      balanceAmount: payload.balanceAmount,
      monthlyDeductionAmount: payload.monthlyDeductionAmount || null,
      startDate: payload.startDate || null,
      endDate: payload.endDate || null,
      status: payload.status || 'active',
      notes: payload.notes || null,
    };
    return prisma.employeeLoan.create({
      data: safePayload,
      include: { employee: true },
    });
  }
}

async function updateEmployeeLoan(id, payload) {
  try {
    return await prisma.employeeLoan.update({
      where: { id },
      data: payload,
      include: { employee: true },
    });
  } catch (err) {
    if (!isMissingLoansColumnError(err)) throw err;
    const safePayload = {};
    if (payload.loanReference !== undefined) safePayload.loanReference = payload.loanReference;
    if (payload.principalAmount !== undefined) safePayload.principalAmount = payload.principalAmount;
    if (payload.balanceAmount !== undefined) safePayload.balanceAmount = payload.balanceAmount;
    if (payload.monthlyDeductionAmount !== undefined) safePayload.monthlyDeductionAmount = payload.monthlyDeductionAmount;
    if (payload.startDate !== undefined) safePayload.startDate = payload.startDate;
    if (payload.endDate !== undefined) safePayload.endDate = payload.endDate;
    if (payload.status !== undefined) safePayload.status = payload.status;
    if (payload.notes !== undefined) safePayload.notes = payload.notes;
    return prisma.employeeLoan.update({
      where: { id },
      data: safePayload,
      include: { employee: true },
    });
  }
}

async function getEmployeeLoanById(id) {
  try {
    return await prisma.employeeLoan.findUnique({
      where: { id },
      include: { employee: true },
    });
  } catch (err) {
    if (!isMissingLoansColumnError(err)) throw err;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT l.*, e.id AS emp_id, e.employee_no, e.first_name, e.surname
       FROM employee_loans l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.id = $1 LIMIT 1`,
      id,
    );
    if (!Array.isArray(rows) || !rows[0]) return null;
    return mapLegacyLoanRow(rows[0]);
  }
}

async function listEmployeeLoans({ employeeId, status, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  let data = [];
  let total = 0;

  try {
    [data, total] = await Promise.all([
      prisma.employeeLoan.findMany({
        where,
        include: { employee: true },
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.employeeLoan.count({ where }),
    ]);
  } catch (err) {
    if (!isMissingLoansColumnError(err)) throw err;
    const conditions = [];
    const params = [];
    const bind = (v) => { params.push(v); return `$${params.length}`; };
    if (employeeId) conditions.push(`l.employee_id = ${bind(employeeId)}`);
    if (status) conditions.push(`l.status = ${bind(status)}`);
    const where2 = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM employee_loans l ${where2}`,
      ...params,
    );
    params.push(skip || 0); const offsetPh = `$${params.length}`;
    params.push(take || 50); const limitPh = `$${params.length}`;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT l.id, l.employee_id, l.loan_reference, l.principal_amount, l.balance_amount,
              l.monthly_deduction_amount, l.start_date, l.end_date, l.status, l.notes,
              l.created_at, l.updated_at,
              e.employee_no, e.first_name, e.surname
       FROM employee_loans l
       JOIN employees e ON e.id = l.employee_id
       ${where2}
       ORDER BY l.created_at DESC
       OFFSET ${offsetPh} LIMIT ${limitPh}`,
      ...params,
    );
    data = (Array.isArray(rows) ? rows : []).map(mapLegacyLoanRow);
    total = Array.isArray(countRows) && countRows[0] ? Number(countRows[0].total || 0) : data.length;
  }

  return { data, total, where };
}

async function createLoanTransaction(payload) {
  try {
    return await prisma.employeeLoanTransaction.create({
      data: payload,
      include: { employeeLoan: true, payrollPeriod: true },
    });
  } catch (err) {
    if (!isMissingLoanTransactionsColumnError(err)) throw err;
    const safePayload = {
      employeeLoanId: payload.employeeLoanId,
      payrollPeriodId: payload.payrollPeriodId || null,
      transactionType: payload.transactionType,
      amount: payload.amount,
      notes: payload.notes || null,
    };
    return prisma.employeeLoanTransaction.create({
      data: safePayload,
      include: { employeeLoan: true, payrollPeriod: true },
    });
  }
}

async function updateLoanTransaction(id, payload) {
  try {
    return await prisma.employeeLoanTransaction.update({
      where: { id },
      data: payload,
      include: { employeeLoan: true, payrollPeriod: true },
    });
  } catch (err) {
    if (!isMissingLoanTransactionsColumnError(err)) throw err;
    const safePayload = {};
    if (payload.employeeLoanId !== undefined) safePayload.employeeLoanId = payload.employeeLoanId;
    if (payload.payrollPeriodId !== undefined) safePayload.payrollPeriodId = payload.payrollPeriodId;
    if (payload.transactionType !== undefined) safePayload.transactionType = payload.transactionType;
    if (payload.amount !== undefined) safePayload.amount = payload.amount;
    if (payload.notes !== undefined) safePayload.notes = payload.notes;
    return prisma.employeeLoanTransaction.update({
      where: { id },
      data: safePayload,
      include: { employeeLoan: true, payrollPeriod: true },
    });
  }
}

async function listLoanTransactions({ employeeLoanId, payrollPeriodId, transactionType, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (employeeLoanId) where.employeeLoanId = employeeLoanId;
  if (payrollPeriodId) where.payrollPeriodId = payrollPeriodId;
  if (transactionType) where.transactionType = transactionType;

  let data = [];
  let total = 0;

  try {
    [data, total] = await Promise.all([
      prisma.employeeLoanTransaction.findMany({
        where,
        include: { employeeLoan: true, payrollPeriod: true },
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.employeeLoanTransaction.count({ where }),
    ]);
  } catch (err) {
    if (!isMissingLoanTransactionsColumnError(err)) throw err;
    const conditions = [];
    const params = [];
    const bind = (v) => { params.push(v); return `$${params.length}`; };
    if (employeeLoanId) conditions.push(`t.employee_loan_id = ${bind(employeeLoanId)}`);
    if (payrollPeriodId) conditions.push(`t.payroll_period_id = ${bind(payrollPeriodId)}`);
    if (transactionType) conditions.push(`t.transaction_type = ${bind(transactionType)}`);
    const where2 = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM employee_loan_transactions t ${where2}`,
      ...params,
    );

    params.push(skip || 0); const offsetPh = `$${params.length}`;
    params.push(take || 50); const limitPh = `$${params.length}`;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT t.id, t.employee_loan_id, t.payroll_period_id, t.transaction_type, t.amount,
              t.notes, t.created_at
       FROM employee_loan_transactions t
       ${where2}
       ORDER BY t.created_at DESC
       OFFSET ${offsetPh} LIMIT ${limitPh}`,
      ...params,
    );

    data = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: Number(row.id),
      employeeLoanId: Number(row.employee_loan_id),
      payrollPeriodId: row.payroll_period_id == null ? null : Number(row.payroll_period_id),
      transactionType: row.transaction_type,
      amount: Number(row.amount || 0),
      principalComponent: null,
      interestComponent: null,
      notes: row.notes ?? null,
      createdAt: row.created_at,
    }));

    total = Array.isArray(countRows) && countRows[0] ? Number(countRows[0].total || 0) : data.length;
  }

  return { data, total, where };
}

async function createTermination(payload) {
  try {
    return await prisma.employeeTermination.create({
      data: payload,
      include: { employee: true },
    });
  } catch (err) {
    if (!isMissingTerminationsColumnError(err)) throw err;
    const safePayload = {
      employeeId: payload.employeeId,
      terminationDate: payload.terminationDate,
      reason: payload.reason || null,
      daysWorkedInFinalMonth: payload.daysWorkedInFinalMonth || null,
      halfPayReceived: payload.halfPayReceived || null,
      settlementAmount: payload.settlementAmount || null,
      notes: payload.notes || null,
    };
    return prisma.employeeTermination.create({
      data: safePayload,
      include: { employee: true },
    });
  }
}

async function updateTermination(id, payload) {
  try {
    return await prisma.employeeTermination.update({
      where: { id },
      data: payload,
      include: { employee: true },
    });
  } catch (err) {
    if (!isMissingTerminationsColumnError(err)) throw err;
    const safePayload = {};
    if (payload.terminationDate !== undefined) safePayload.terminationDate = payload.terminationDate;
    if (payload.reason !== undefined) safePayload.reason = payload.reason;
    if (payload.daysWorkedInFinalMonth !== undefined) safePayload.daysWorkedInFinalMonth = payload.daysWorkedInFinalMonth;
    if (payload.halfPayReceived !== undefined) safePayload.halfPayReceived = payload.halfPayReceived;
    if (payload.settlementAmount !== undefined) safePayload.settlementAmount = payload.settlementAmount;
    if (payload.notes !== undefined) safePayload.notes = payload.notes;
    return prisma.employeeTermination.update({
      where: { id },
      data: safePayload,
      include: { employee: true },
    });
  }
}

async function listTerminations({ employeeId, startDate, endDate, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (startDate || endDate) {
    where.terminationDate = {};
    if (startDate) where.terminationDate.gte = startDate;
    if (endDate) where.terminationDate.lte = endDate;
  }

  let data = [];
  let total = 0;

  try {
    [data, total] = await Promise.all([
      prisma.employeeTermination.findMany({ where, include: { employee: true }, skip, take, orderBy: { [sortBy]: sortOrder } }),
      prisma.employeeTermination.count({ where }),
    ]);
  } catch (err) {
    if (!isMissingTerminationsColumnError(err)) throw err;
    // Fall back to selecting only the original columns that definitely exist
    const rows = await prisma.$queryRawUnsafe(
      `SELECT t.id, t.employee_id, t.termination_date, t.reason,
              t.days_worked_in_final_month, t.half_pay_received, t.settlement_amount,
              t.notes, t.created_at, t.updated_at
       FROM employee_terminations t
       ${employeeId ? 'WHERE t.employee_id = $1' : ''}
       ORDER BY t.termination_date DESC
       OFFSET ${skip || 0} LIMIT ${take || 50}`,
      ...(employeeId ? [employeeId] : []),
    );
    data = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: Number(row.id), employeeId: Number(row.employee_id),
      terminationDate: row.termination_date, reason: row.reason ?? null,
      terminationType: null, daysWorkedInFinalMonth: row.days_worked_in_final_month ?? null,
      halfPayReceived: row.half_pay_received ?? null, settlementAmount: row.settlement_amount ?? null,
      halfPayDueInTerminationMonth: null, amountPaidInTerminationMonth: null,
      leavePayAccruedDays: null, leavePayAmount: null, outstandingLoanObligations: null,
      grossSettlementAmount: null, netSettlementAmount: null,
      notes: row.notes ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
    total = data.length;
  }

  return { data, total, where };
}

async function createReengagement(payload) {
  try {
    return await prisma.employeeReengagement.create({
      data: payload,
      include: { employee: true },
    });
  } catch (err) {
    if (!isMissingReengagementsColumnError(err)) throw err;
    const safePayload = {
      employeeId: payload.employeeId,
      effectiveDate: payload.effectiveDate,
      previousWage: payload.previousWage || null,
      reengagementWage: payload.reengagementWage || null,
      occupation: payload.occupation || null,
      contractExpiryDate: payload.contractExpiryDate || null,
      notes: payload.notes || null,
    };
    return prisma.employeeReengagement.create({
      data: safePayload,
      include: { employee: true },
    });
  }
}

async function updateReengagement(id, payload) {
  try {
    return await prisma.employeeReengagement.update({
      where: { id },
      data: payload,
      include: { employee: true },
    });
  } catch (err) {
    if (!isMissingReengagementsColumnError(err)) throw err;
    const safePayload = {};
    if (payload.effectiveDate !== undefined) safePayload.effectiveDate = payload.effectiveDate;
    if (payload.previousWage !== undefined) safePayload.previousWage = payload.previousWage;
    if (payload.reengagementWage !== undefined) safePayload.reengagementWage = payload.reengagementWage;
    if (payload.occupation !== undefined) safePayload.occupation = payload.occupation;
    if (payload.contractExpiryDate !== undefined) safePayload.contractExpiryDate = payload.contractExpiryDate;
    if (payload.notes !== undefined) safePayload.notes = payload.notes;
    return prisma.employeeReengagement.update({
      where: { id },
      data: safePayload,
      include: { employee: true },
    });
  }
}

async function listReengagements({ employeeId, startDate, endDate, skip, take, sortBy, sortOrder }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (startDate || endDate) {
    where.effectiveDate = {};
    if (startDate) where.effectiveDate.gte = startDate;
    if (endDate) where.effectiveDate.lte = endDate;
  }

  let data = [];
  let total = 0;

  try {
    [data, total] = await Promise.all([
      prisma.employeeReengagement.findMany({ where, include: { employee: true }, skip, take, orderBy: { [sortBy]: sortOrder } }),
      prisma.employeeReengagement.count({ where }),
    ]);
  } catch (err) {
    if (!isMissingReengagementsColumnError(err)) throw err;
    // Fall back to selecting only the original columns that definitely exist
    const rows = await prisma.$queryRawUnsafe(
      `SELECT r.id, r.employee_id, r.previous_wage, r.reengagement_wage,
              r.occupation, r.effective_date, r.contract_expiry_date,
              r.notes, r.created_at, r.updated_at
       FROM employee_reengagements r
       ${employeeId ? 'WHERE r.employee_id = $1' : ''}
       ORDER BY r.effective_date DESC
       OFFSET ${skip || 0} LIMIT ${take || 50}`,
      ...(employeeId ? [employeeId] : []),
    );
    data = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: Number(row.id), employeeId: Number(row.employee_id),
      linkedTerminationId: null, wageAtRetrenchment: null,
      previousWage: row.previous_wage ?? null, reengagementWage: row.reengagement_wage ?? null,
      occupation: row.occupation ?? null, effectiveDate: row.effective_date,
      contractExpiryDate: row.contract_expiry_date ?? null,
      notes: row.notes ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
    total = data.length;
  }

  return { data, total, where };
}

async function createTaxBracket(payload) {
  try {
    return await prisma.payrollTaxBracket.create({ data: payload });
  } catch (err) {
    if (!isMissingTableError(err, 'payroll_tax_brackets')) throw err;
    const error = new Error('Tax bracket table is not yet available. Please run database migrations.');
    error.statusCode = 503;
    throw error;
  }
}

async function updateTaxBracket(id, payload) {
  try {
    return await prisma.payrollTaxBracket.update({ where: { id }, data: payload });
  } catch (err) {
    if (!isMissingTableError(err, 'payroll_tax_brackets')) throw err;
    const error = new Error('Tax bracket table is not yet available. Please run database migrations.');
    error.statusCode = 503;
    throw error;
  }
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
  try {
    return await prisma.payrollIncrementPolicy.create({ data: payload });
  } catch (err) {
    if (!isMissingTableError(err, 'payroll_increment_policies')) throw err;
    const error = new Error('Increment policy table is not yet available. Please run database migrations.');
    error.statusCode = 503;
    throw error;
  }
}

async function updateIncrementPolicy(id, payload) {
  try {
    return await prisma.payrollIncrementPolicy.update({ where: { id }, data: payload });
  } catch (err) {
    if (!isMissingTableError(err, 'payroll_increment_policies')) throw err;
    const error = new Error('Increment policy table is not yet available. Please run database migrations.');
    error.statusCode = 503;
    throw error;
  }
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

async function deletePayrollPeriod(id) {
  return prisma.payrollPeriod.delete({ where: { id } });
}

async function deletePayrollEntry(id) {
  return prisma.payrollEntry.delete({ where: { id } });
}

async function deleteEmployeeLoan(id) {
  return prisma.employeeLoan.delete({ where: { id } });
}

async function deleteLoanTransaction(id) {
  return prisma.employeeLoanTransaction.delete({ where: { id } });
}

async function deleteTermination(id) {
  return prisma.employeeTermination.delete({ where: { id } });
}

async function deleteReengagement(id) {
  return prisma.employeeReengagement.delete({ where: { id } });
}

async function deleteTaxBracket(id) {
  try {
    return await prisma.payrollTaxBracket.delete({ where: { id } });
  } catch (err) {
    if (!isMissingTableError(err, 'payroll_tax_brackets')) throw err;
    return null;
  }
}

async function deleteIncrementPolicy(id) {
  try {
    return await prisma.payrollIncrementPolicy.delete({ where: { id } });
  } catch (err) {
    if (!isMissingTableError(err, 'payroll_increment_policies')) throw err;
    return null;
  }
}

async function purgeAllPayrollData() {
  // Delete in FK-safe order (children before parents)
  const tables = [
    'payroll_entries',
    'employee_loan_transactions',
    'employee_loans',
    'employee_terminations',
    'employee_reengagements',
    'payroll_periods',
    'payroll_tax_brackets',
    'payroll_increment_policies',
  ];

  const counts = {};
  for (const table of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`DELETE FROM "${table}"`);
      counts[table] = typeof result === 'number' ? result : 'ok';
    } catch (err) {
      // Table may not exist on older schema – skip gracefully
      if (err.code === 'P2021' || (err.message && err.message.includes('does not exist'))) {
        counts[table] = 'skipped (table missing)';
      } else {
        throw err;
      }
    }
  }
  // Clear the column cache so fresh queries start clean
  tableColumnCache.clear();
  return counts;
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
  deletePayrollPeriod,
  deletePayrollEntry,
  deleteEmployeeLoan,
  deleteLoanTransaction,
  deleteTermination,
  deleteReengagement,
  deleteTaxBracket,
  deleteIncrementPolicy,
  purgeAllPayrollData,
};
