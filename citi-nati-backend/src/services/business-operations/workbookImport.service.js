'use strict';

const { PrismaClient } = require('@prisma/client');
const importsService = require('./imports.service');
const { readWorkbookFromBuffer } = require('./parsers/commonWorkbook.utils');
const { parsePayrollWorkbook } = require('./parsers/payrollWorkbook.parser');
const { parseBusinessWorkbook } = require('./parsers/businessWorkbook.parser');

const prisma = new PrismaClient();

function normalizeSectionSet(sections) {
  if (!sections) return null;
  if (Array.isArray(sections)) {
    return new Set(sections.map((s) => String(s).trim()).filter(Boolean));
  }
  if (typeof sections === 'string') {
    return new Set(sections.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return null;
}

function includeSection(sectionSet, key) {
  if (!sectionSet || !sectionSet.size) return true;
  return sectionSet.has(key);
}

function buildEntityResult(parsedCount, importResult = null) {
  if (!importResult) {
    return {
      parsed: parsedCount,
      inserted: 0,
      updated: 0,
      skipped: parsedCount,
      imported: false,
    };
  }

  return {
    parsed: parsedCount,
    inserted: importResult.inserted || 0,
    updated: importResult.updated || 0,
    skipped: importResult.skipped || 0,
    imported: true,
  };
}

async function mapEmployeeNosToIds(records, employeeNoKey = 'employeeNo') {
  const map = new Map();
  const employeeNos = [...new Set(records.map((r) => (r[employeeNoKey] ? String(r[employeeNoKey]).trim() : null)).filter(Boolean))];

  if (!employeeNos.length) return map;

  const employees = await prisma.employee.findMany({
    where: { employeeNo: { in: employeeNos } },
    select: { id: true, employeeNo: true },
  });

  employees.forEach((e) => map.set(String(e.employeeNo).trim(), e.id));
  return map;
}

async function mapPeriodDescriptionsToIds(records) {
  const map = new Map();
  const keys = [...new Set(records.map((r) => `${r.payrollMode || 'full_month'}||${r.description || ''}`))];
  if (!keys.length) return map;

  const periods = await prisma.payrollPeriod.findMany({
    where: {
      OR: keys.map((k) => {
        const [payrollMode, description] = k.split('||');
        return { payrollMode, description };
      }),
    },
    select: { id: true, payrollMode: true, description: true },
  });

  periods.forEach((p) => {
    map.set(`${p.payrollMode || 'full_month'}||${p.description || ''}`, p.id);
  });

  return map;
}

async function parseWorkbook(buffer, workbookType) {
  const workbook = readWorkbookFromBuffer(buffer);

  if (workbookType === 'payroll') {
    return parsePayrollWorkbook(workbook);
  }

  if (workbookType === 'business') {
    return parseBusinessWorkbook(workbook);
  }

  throw new Error(`Unsupported workbookType '${workbookType}'`);
}

async function importPayrollParsedData(parsed, options = {}) {
  const warnings = [];
  const errors = [];
  const sectionSet = normalizeSectionSet(options.sections);
  const results = {};

  let employeesResult = null;
  if (includeSection(sectionSet, 'employees') && parsed.employees.length) {
    employeesResult = await importsService.importEmployees(parsed.employees);
  }
  results.employees = buildEntityResult(parsed.employees.length, employeesResult);

  let salaryResult = null;
  if (includeSection(sectionSet, 'salaryStructures') && parsed.salaryStructures.length) {
    salaryResult = await importsService.importSalaryStructures(parsed.salaryStructures);
  }
  results.salaryStructures = buildEntityResult(parsed.salaryStructures.length, salaryResult);

  let periodsResult = null;
  if (includeSection(sectionSet, 'payrollPeriods') && parsed.payrollPeriods.length) {
    periodsResult = await importsService.importPayrollPeriods(parsed.payrollPeriods);
  }
  results.payrollPeriods = buildEntityResult(parsed.payrollPeriods.length, periodsResult);

  let entriesResult = null;
  if (includeSection(sectionSet, 'payrollEntries') && parsed.payrollEntries.length) {
    const employeeMap = await mapEmployeeNosToIds(parsed.payrollEntries, 'employeeNo');

    const periodCandidates = parsed.payrollPeriods.length
      ? parsed.payrollPeriods
      : [...new Set(parsed.payrollEntries.map((entry) => entry.periodDescription || entry.sourceSheet).filter(Boolean))].map((desc) => ({
          payrollMode: 'full_month',
          description: desc,
        }));

    const periodMap = await mapPeriodDescriptionsToIds(periodCandidates);

    const normalizedEntries = [];

    parsed.payrollEntries.forEach((entry) => {
      const employeeId = employeeMap.get(String(entry.employeeNo || '').trim());
      const periodKey = `${entry.payrollMode || 'full_month'}||${entry.periodDescription || entry.sourceSheet || ''}`;
      const payrollPeriodId = periodMap.get(periodKey);

      if (!employeeId || !payrollPeriodId) {
        return;
      }

      normalizedEntries.push({
        payrollPeriodId,
        employeeId,
        basicSalary: entry.basicSalary || 0,
        incrementAmount: entry.incrementAmount || 0,
        grossPay: entry.grossPay || 0,
        totalDeductions: entry.totalDeductions || 0,
        netPay: entry.netPay || 0,
        daysWorked: entry.daysWorked,
        daysAbsent: entry.daysAbsent,
        overtimeHours: entry.overtimeHours,
        overtimeAmount: entry.overtimeAmount,
        loanDeductionAmount: entry.loanDeductionAmount,
        otherDeductionAmount: entry.otherDeductionAmount,
        bonusAmount: entry.bonusAmount,
        giftAmount: entry.giftAmount,
        leavePayAmount: entry.leavePayAmount,
        payeAmount: entry.payeAmount,
        notes: entry.notes,
      });
    });

    if (normalizedEntries.length < parsed.payrollEntries.length) {
      warnings.push('Some payroll entries were skipped because employee or payroll period mapping was not found');
    }

    entriesResult = await importsService.importPayrollEntries(normalizedEntries);
  }
  results.payrollEntries = buildEntityResult(parsed.payrollEntries.length, entriesResult);

  let loansResult = null;
  let importedLoans = [];
  if (includeSection(sectionSet, 'loans') && parsed.loans.length) {
    const employeeMap = await mapEmployeeNosToIds(parsed.loans, 'employeeNo');

    const normalizedLoans = parsed.loans
      .map((loan) => {
        const employeeId = employeeMap.get(String(loan.employeeNo || '').trim());
        if (!employeeId) return null;
        return {
          employeeId,
          loanReference: loan.loanReference,
          principalAmount: loan.principalAmount,
          balanceAmount: loan.balanceAmount,
          monthlyDeductionAmount: loan.monthlyDeductionAmount,
          startDate: loan.startDate,
          endDate: loan.endDate,
          status: loan.status,
          notes: loan.notes,
        };
      })
      .filter(Boolean);

    if (normalizedLoans.length < parsed.loans.length) {
      warnings.push('Some loan rows were skipped because employee mapping by employee number failed');
    }

    loansResult = await importsService.importLoans(normalizedLoans);
    importedLoans = normalizedLoans;
  }
  results.loans = buildEntityResult(parsed.loans.length, loansResult);

  let loanTxResult = null;
  if (includeSection(sectionSet, 'loanTransactions') && parsed.loanTransactions.length) {
    const loanReferences = [...new Set([
      ...importedLoans.map((l) => l.loanReference),
      ...parsed.loanTransactions.map((tx) => tx.loanReference),
    ].filter(Boolean))];
    const existingLoans = loanReferences.length
      ? await prisma.employeeLoan.findMany({ where: { loanReference: { in: loanReferences } }, select: { id: true, loanReference: true } })
      : [];
    const loanMap = new Map(existingLoans.map((l) => [String(l.loanReference).trim(), l.id]));

    const normalizedTx = parsed.loanTransactions
      .map((tx) => {
        const employeeLoanId = tx.loanReference ? loanMap.get(String(tx.loanReference).trim()) : null;
        if (!employeeLoanId) return null;
        return {
          employeeLoanId,
          payrollPeriodId: null,
          transactionType: tx.transactionType || 'repayment',
          amount: tx.amount,
          notes: tx.notes,
        };
      })
      .filter(Boolean);

    if (normalizedTx.length < parsed.loanTransactions.length) {
      warnings.push('Some loan transactions were skipped because loan reference mapping failed');
    }

    loanTxResult = await importsService.importLoanTransactions(normalizedTx);
  }
  results.loanTransactions = buildEntityResult(parsed.loanTransactions.length, loanTxResult);

  let terminationsResult = null;
  if (includeSection(sectionSet, 'terminations') && parsed.terminations.length) {
    const employeeMap = await mapEmployeeNosToIds(parsed.terminations, 'employeeNo');
    const normalized = parsed.terminations
      .map((row) => {
        const employeeId = employeeMap.get(String(row.employeeNo || '').trim());
        if (!employeeId) return null;
        return {
          employeeId,
          terminationDate: row.terminationDate,
          reason: row.reason,
          daysWorkedInFinalMonth: row.daysWorkedInFinalMonth,
          halfPayReceived: row.halfPayReceived,
          settlementAmount: row.settlementAmount,
          notes: row.notes,
        };
      })
      .filter(Boolean);

    if (normalized.length < parsed.terminations.length) {
      warnings.push('Some terminations were skipped because employee mapping failed');
    }

    terminationsResult = await importsService.importTerminations(normalized);
  }
  results.terminations = buildEntityResult(parsed.terminations.length, terminationsResult);

  let reengagementResult = null;
  if (includeSection(sectionSet, 'reengagements') && parsed.reengagements.length) {
    const employeeMap = await mapEmployeeNosToIds(parsed.reengagements, 'employeeNo');
    const normalized = parsed.reengagements
      .map((row) => {
        const employeeId = employeeMap.get(String(row.employeeNo || '').trim());
        if (!employeeId) return null;
        return {
          employeeId,
          previousWage: row.previousWage,
          reengagementWage: row.reengagementWage,
          occupation: row.occupation,
          effectiveDate: row.effectiveDate,
          contractExpiryDate: row.contractExpiryDate,
          notes: row.notes,
        };
      })
      .filter(Boolean);

    if (normalized.length < parsed.reengagements.length) {
      warnings.push('Some reengagement records were skipped because employee mapping failed');
    }

    reengagementResult = await importsService.importReengagements(normalized);
  }
  results.reengagements = buildEntityResult(parsed.reengagements.length, reengagementResult);

  return { results, warnings, errors };
}

async function importBusinessParsedData(parsed, options = {}) {
  const warnings = [];
  const errors = [];
  const sectionSet = normalizeSectionSet(options.sections);
  const results = {};

  let categoriesResult = null;
  if (includeSection(sectionSet, 'expenseCategories') && parsed.expenseCategories.length) {
    categoriesResult = await importsService.importExpenseCategories(parsed.expenseCategories);
  }
  results.expenseCategories = buildEntityResult(parsed.expenseCategories.length, categoriesResult);

  let suppliersResult = null;
  if (includeSection(sectionSet, 'suppliers') && parsed.suppliers.length) {
    suppliersResult = await importsService.importSuppliers(parsed.suppliers);
  }
  results.suppliers = buildEntityResult(parsed.suppliers.length, suppliersResult);

  let supplierTxResult = null;
  if (includeSection(sectionSet, 'supplierTransactions') && parsed.supplierTransactions.length) {
    supplierTxResult = await importsService.importSupplierTransactions(parsed.supplierTransactions);
  }
  results.supplierTransactions = buildEntityResult(parsed.supplierTransactions.length, supplierTxResult);

  let expensesResult = null;
  if (includeSection(sectionSet, 'expenses') && parsed.expenses.length) {
    expensesResult = await importsService.importExpenses(parsed.expenses);
  }
  results.expenses = buildEntityResult(parsed.expenses.length, expensesResult);

  return { results, warnings, errors };
}

async function processWorkbookUpload({ fileBuffer, workbookType, parseOnly = false, sections = null }) {
  const parsedOutput = await parseWorkbook(fileBuffer, workbookType);

  if (parseOnly) {
    return {
      success: true,
      workbookType: parsedOutput.workbookType,
      detectedSheets: parsedOutput.detectedSheets,
      summary: parsedOutput.summary,
      warnings: parsedOutput.warnings,
      errors: parsedOutput.errors,
      parseOnly: true,
    };
  }

  let importOutput;

  if (workbookType === 'payroll') {
    importOutput = await importPayrollParsedData(parsedOutput.parsed, { sections });
  } else if (workbookType === 'business') {
    importOutput = await importBusinessParsedData(parsedOutput.parsed, { sections });
  } else {
    throw new Error(`Unsupported workbookType '${workbookType}'`);
  }

  return {
    success: importOutput.errors.length === 0,
    workbookType: parsedOutput.workbookType,
    detectedSheets: parsedOutput.detectedSheets,
    summary: parsedOutput.summary,
    results: importOutput.results,
    warnings: [...parsedOutput.warnings, ...importOutput.warnings],
    errors: [...parsedOutput.errors, ...importOutput.errors],
    parseOnly: false,
  };
}

module.exports = {
  processWorkbookUpload,
  parseWorkbook,
};
