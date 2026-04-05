'use strict';

const archiver = require('archiver');
const { Readable } = require('stream');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Comprehensive data snapshot export/import service
 * Creates full backups of payroll and sales data in structured JSON format
 * Supports complete restoration in case of data loss
 */

const SNAPSHOT_VERSION = '1.0.0';
const MAX_BATCH_SIZE = 1000;

function camelToSnake(value) {
  return String(value || '').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function extractMissingColumn(error) {
  const message = String(error?.message || '');
  const match = message.match(/The column `([^`]+)` does not exist in the current database/i);
  return match?.[1] || null;
}

function buildDbColumnToFieldMap(tableName, fields = []) {
  const map = {};
  fields.forEach((field) => {
    const snake = camelToSnake(field);
    map[`${tableName}.${snake}`] = field;
    map[snake] = field;
  });
  return map;
}

async function findManyWithSelectFallback({
  delegate,
  args = {},
  selectFields = [],
  tableName,
  extraSelect = null,
  warnings = [],
  label = 'section',
}) {
  let activeFields = [...selectFields];
  const dbColumnToField = buildDbColumnToFieldMap(tableName, selectFields);

  while (true) {
    const select = activeFields.reduce((acc, field) => {
      acc[field] = true;
      return acc;
    }, {});

    if (extraSelect && typeof extraSelect === 'object') {
      Object.assign(select, extraSelect);
    }

    try {
      return await delegate.findMany({ ...args, select });
    } catch (error) {
      const missingColumn = extractMissingColumn(error);
      const field = missingColumn ? (dbColumnToField[missingColumn] || dbColumnToField[String(missingColumn).split('.').pop()]) : null;

      if (!field || !activeFields.includes(field)) {
        throw error;
      }

      activeFields = activeFields.filter((name) => name !== field);
      warnings.push(`${label}: missing column ${missingColumn} was skipped during export`);

      if (!activeFields.length) {
        return [];
      }
    }
  }
}

/**
 * PAYROLL EXPORT - Exports all payroll data with complete relationships
 */
async function exportPayrollSnapshot(filters = {}) {
  const snapshot = {
    version: SNAPSHOT_VERSION,
    type: 'payroll',
    exportedAt: new Date().toISOString(),
    filters,
    data: {
      employees: [],
      salaryStructures: [],
      payrollPeriods: [],
      payrollEntries: [],
      loans: [],
      loanTransactions: [],
      terminations: [],
      reengagements: [],
      taxBrackets: [],
      incrementPolicies: [],
      metadata: {},
    },
  };

  const compatibilityWarnings = [];

  try {
    // Fetch all employees with related data
    const employees = await prisma.employee.findMany({
      where: filters.locationId ? { locationId: Number(filters.locationId) } : undefined,
      include: {
        salaryStructures: true,
      },
    });

    snapshot.data.employees = employees.map(emp => ({
      id: emp.id,
      employeeNo: emp.employeeNo,
      firstName: emp.firstName,
      surname: emp.surname,
      middleName: emp.middleName,
      gender: emp.gender,
      dateOfBirth: emp.dateOfBirth?.toISOString(),
      districtOfOrigin: emp.districtOfOrigin,
      village: emp.village,
      traditionalAuthority: emp.traditionalAuthority,
      nationalId: emp.nationalId,
      nationalIdExpiryDate: emp.nationalIdExpiryDate?.toISOString(),
      contactNumber: emp.contactNumber,
      dateOfEmployment: emp.dateOfEmployment?.toISOString(),
      position: emp.position,
      department: emp.department,
      locationId: emp.locationId,
      employmentType: emp.employmentType,
      status: emp.status,
      notes: emp.notes,
    }));

    // Fetch salary structures
    const salaryStructures = await prisma.employeeSalaryStructure.findMany({
      where: filters.locationId
        ? { employee: { locationId: Number(filters.locationId) } }
        : undefined,
    });

    snapshot.data.salaryStructures = salaryStructures.map(ss => ({
      id: ss.id,
      employeeId: ss.employeeId,
      agreedSalaryPerMonth: ss.agreedSalaryPerMonth,
      annualIncrementAmount: ss.annualIncrementAmount,
      salaryAfterIncrement: ss.salaryAfterIncrement,
      currency: ss.currency,
      effectiveFrom: ss.effectiveFrom.toISOString(),
      effectiveTo: ss.effectiveTo?.toISOString(),
      isCurrent: ss.isCurrent,
    }));

    // Fetch payroll periods
    const payrollPeriods = await prisma.payrollPeriod.findMany({
      where: filters.locationId ? { locationId: Number(filters.locationId) } : undefined,
    });

    snapshot.data.payrollPeriods = payrollPeriods.map(pp => ({
      id: pp.id,
      reportingPeriodId: pp.reportingPeriodId,
      payrollMode: pp.payrollMode,
      locationId: pp.locationId,
      payrollMonth: pp.payrollMonth,
      payrollYear: pp.payrollYear,
      payrollPositionInMonth: pp.payrollPositionInMonth,
      description: pp.description,
      status: pp.status,
      createdBy: pp.createdBy,
      runStartedAt: pp.runStartedAt?.toISOString(),
      finalizedAt: pp.finalizedAt?.toISOString(),
    }));

    // Fetch payroll entries
    const payrollEntries = await findManyWithSelectFallback({
      delegate: prisma.payrollEntry,
      args: {
        where: filters.locationId
          ? {
              payrollPeriod: { locationId: Number(filters.locationId) },
            }
          : undefined,
      },
      selectFields: [
        'id',
        'payrollPeriodId',
        'employeeId',
        'basicSalary',
        'incrementAmount',
        'grossPay',
        'totalDeductions',
        'netPay',
        'daysWorked',
        'daysAbsent',
        'overtimeHours',
        'overtimeNormalHours',
        'overtimeDoubleHours',
        'overtimeAmount',
        'overtimeNormalAmount',
        'overtimeDoubleAmount',
        'loanDeductionAmount',
        'absenceDeductionAmount',
        'otherDeductionAmount',
        'bonusAmount',
        'giftAmount',
        'leavePayAmount',
        'payeAmount',
        'loanBalanceAtPayroll',
        'accruedInterestAtPayroll',
        'netPayMidPortion',
        'netPayEndPortion',
        'notes',
      ],
      tableName: 'payroll_entries',
      extraSelect: {
        employee: {
          select: { id: true, employeeNo: true },
        },
      },
      warnings: compatibilityWarnings,
      label: 'payrollEntries',
    });

    snapshot.data.payrollEntries = payrollEntries.map(pe => ({
      id: pe.id,
      payrollPeriodId: pe.payrollPeriodId,
      employeeId: pe.employeeId,
      basicSalary: pe.basicSalary,
      incrementAmount: pe.incrementAmount,
      grossPay: pe.grossPay,
      totalDeductions: pe.totalDeductions,
      netPay: pe.netPay,
      daysWorked: pe.daysWorked,
      daysAbsent: pe.daysAbsent,
      overtimeHours: pe.overtimeHours,
      overtimeNormalHours: pe.overtimeNormalHours,
      overtimeDoubleHours: pe.overtimeDoubleHours,
      overtimeAmount: pe.overtimeAmount,
      overtimeNormalAmount: pe.overtimeNormalAmount,
      overtimeDoubleAmount: pe.overtimeDoubleAmount,
      loanDeductionAmount: pe.loanDeductionAmount,
      absenceDeductionAmount: pe.absenceDeductionAmount,
      otherDeductionAmount: pe.otherDeductionAmount,
      bonusAmount: pe.bonusAmount,
      giftAmount: pe.giftAmount,
      leavePayAmount: pe.leavePayAmount,
      payeAmount: pe.payeAmount,
      loanBalanceAtPayroll: pe.loanBalanceAtPayroll,
      accruedInterestAtPayroll: pe.accruedInterestAtPayroll,
      netPayMidPortion: pe.netPayMidPortion,
      netPayEndPortion: pe.netPayEndPortion,
      notes: pe.notes,
    }));

    // Fetch loans
    const loans = await findManyWithSelectFallback({
      delegate: prisma.employeeLoan,
      args: {
        where: filters.locationId
          ? { employee: { locationId: Number(filters.locationId) } }
          : undefined,
      },
      selectFields: [
        'id',
        'employeeId',
        'loanReference',
        'principalAmount',
        'balanceAmount',
        'interestRate',
        'accruedInterest',
        'loanGrantedMonth',
        'loanGrantedYear',
        'monthlyDeductionAmount',
        'repaymentEndMonth',
        'repaymentEndYear',
        'reason',
        'startDate',
        'endDate',
        'status',
        'notes',
      ],
      tableName: 'employee_loans',
      warnings: compatibilityWarnings,
      label: 'employeeLoans',
    });

    snapshot.data.loans = loans.map(loan => ({
      id: loan.id,
      employeeId: loan.employeeId,
      loanReference: loan.loanReference,
      principalAmount: loan.principalAmount,
      balanceAmount: loan.balanceAmount,
      interestRate: loan.interestRate,
      accruedInterest: loan.accruedInterest,
      loanGrantedMonth: loan.loanGrantedMonth,
      loanGrantedYear: loan.loanGrantedYear,
      monthlyDeductionAmount: loan.monthlyDeductionAmount,
      repaymentEndMonth: loan.repaymentEndMonth,
      repaymentEndYear: loan.repaymentEndYear,
      reason: loan.reason,
      startDate: loan.startDate?.toISOString(),
      endDate: loan.endDate?.toISOString(),
      status: loan.status,
      notes: loan.notes,
    }));

    // Fetch loan transactions
    const loanTransactions = await findManyWithSelectFallback({
      delegate: prisma.employeeLoanTransaction,
      args: {
        where: filters.locationId
          ? {
              employeeLoan: { employee: { locationId: Number(filters.locationId) } },
            }
          : undefined,
      },
      selectFields: [
        'id',
        'employeeLoanId',
        'payrollPeriodId',
        'transactionType',
        'amount',
        'principalComponent',
        'interestComponent',
        'notes',
      ],
      tableName: 'employee_loan_transactions',
      warnings: compatibilityWarnings,
      label: 'employeeLoanTransactions',
    });

    snapshot.data.loanTransactions = loanTransactions.map(lt => ({
      id: lt.id,
      employeeLoanId: lt.employeeLoanId,
      payrollPeriodId: lt.payrollPeriodId,
      transactionType: lt.transactionType,
      amount: lt.amount,
      principalComponent: lt.principalComponent,
      interestComponent: lt.interestComponent,
      notes: lt.notes,
    }));

    // Fetch terminations
    const terminations = await findManyWithSelectFallback({
      delegate: prisma.employeeTermination,
      args: {
        where: filters.locationId
          ? { employee: { locationId: Number(filters.locationId) } }
          : undefined,
      },
      selectFields: [
        'id',
        'employeeId',
        'terminationDate',
        'terminationType',
        'reason',
        'daysWorkedInFinalMonth',
        'halfPayReceived',
        'halfPayDueInTerminationMonth',
        'amountPaidInTerminationMonth',
        'leavePayAccruedDays',
        'leavePayAmount',
        'outstandingLoanObligations',
        'grossSettlementAmount',
        'netSettlementAmount',
        'settlementAmount',
        'notes',
      ],
      tableName: 'employee_terminations',
      warnings: compatibilityWarnings,
      label: 'employeeTerminations',
    });

    snapshot.data.terminations = terminations.map(term => ({
      id: term.id,
      employeeId: term.employeeId,
      terminationDate: term.terminationDate.toISOString(),
      terminationType: term.terminationType,
      reason: term.reason,
      daysWorkedInFinalMonth: term.daysWorkedInFinalMonth,
      halfPayReceived: term.halfPayReceived,
      halfPayDueInTerminationMonth: term.halfPayDueInTerminationMonth,
      amountPaidInTerminationMonth: term.amountPaidInTerminationMonth,
      leavePayAccruedDays: term.leavePayAccruedDays,
      leavePayAmount: term.leavePayAmount,
      outstandingLoanObligations: term.outstandingLoanObligations,
      grossSettlementAmount: term.grossSettlementAmount,
      netSettlementAmount: term.netSettlementAmount,
      settlementAmount: term.settlementAmount,
      notes: term.notes,
    }));

    // Fetch reengagements
    const reengagements = await findManyWithSelectFallback({
      delegate: prisma.employeeReengagement,
      args: {
        where: filters.locationId
          ? { employee: { locationId: Number(filters.locationId) } }
          : undefined,
      },
      selectFields: [
        'id',
        'employeeId',
        'linkedTerminationId',
        'wageAtRetrenchment',
        'previousWage',
        'reengagementWage',
        'occupation',
        'effectiveDate',
        'contractExpiryDate',
        'notes',
      ],
      tableName: 'employee_reengagements',
      warnings: compatibilityWarnings,
      label: 'employeeReengagements',
    });

    snapshot.data.reengagements = reengagements.map(reeng => ({
      id: reeng.id,
      employeeId: reeng.employeeId,
      linkedTerminationId: reeng.linkedTerminationId,
      wageAtRetrenchment: reeng.wageAtRetrenchment,
      previousWage: reeng.previousWage,
      reengagementWage: reeng.reengagementWage,
      occupation: reeng.occupation,
      effectiveDate: reeng.effectiveDate.toISOString(),
      contractExpiryDate: reeng.contractExpiryDate?.toISOString(),
      notes: reeng.notes,
    }));

    // Fetch tax brackets
    const taxBrackets = await findManyWithSelectFallback({
      delegate: prisma.payrollTaxBracket,
      args: {
        where: filters.locationId ? { locationId: Number(filters.locationId) } : undefined,
      },
      selectFields: [
        'id',
        'locationId',
        'effectiveFrom',
        'effectiveTo',
        'minIncome',
        'maxIncome',
        'ratePercent',
        'fixedTaxAmount',
        'description',
        'isActive',
      ],
      tableName: 'payroll_tax_brackets',
      warnings: compatibilityWarnings,
      label: 'payrollTaxBrackets',
    });

    snapshot.data.taxBrackets = taxBrackets.map(tb => ({
      id: tb.id,
      locationId: tb.locationId,
      effectiveFrom: tb.effectiveFrom.toISOString(),
      effectiveTo: tb.effectiveTo?.toISOString(),
      minIncome: tb.minIncome,
      maxIncome: tb.maxIncome,
      ratePercent: tb.ratePercent,
      fixedTaxAmount: tb.fixedTaxAmount,
      description: tb.description,
      isActive: tb.isActive,
    }));

    // Fetch increment policies
    const incrementPolicies = await findManyWithSelectFallback({
      delegate: prisma.payrollIncrementPolicy,
      args: {
        where: filters.locationId ? { locationId: Number(filters.locationId) } : undefined,
      },
      selectFields: [
        'id',
        'locationId',
        'minServiceMonths',
        'maxServiceMonths',
        'incrementPercent',
        'incrementAmount',
        'effectiveFrom',
        'effectiveTo',
        'notes',
        'isActive',
      ],
      tableName: 'payroll_increment_policies',
      warnings: compatibilityWarnings,
      label: 'payrollIncrementPolicies',
    });

    snapshot.data.incrementPolicies = incrementPolicies.map(ip => ({
      id: ip.id,
      locationId: ip.locationId,
      minServiceMonths: ip.minServiceMonths,
      maxServiceMonths: ip.maxServiceMonths,
      incrementPercent: ip.incrementPercent,
      incrementAmount: ip.incrementAmount,
      effectiveFrom: ip.effectiveFrom.toISOString(),
      effectiveTo: ip.effectiveTo?.toISOString(),
      notes: ip.notes,
      isActive: ip.isActive,
    }));

    // Add metadata
    snapshot.data.metadata = {
      totalEmployees: snapshot.data.employees.length,
      totalPeriods: snapshot.data.payrollPeriods.length,
      totalEntries: snapshot.data.payrollEntries.length,
      totalLoans: snapshot.data.loans.length,
      totalTerminations: snapshot.data.terminations.length,
      totalReengagements: snapshot.data.reengagements.length,
      compatibilityWarnings,
    };

    return snapshot;
  } catch (error) {
    throw new Error(`Payroll export failed: ${error.message}`);
  }
}

/**
 * SALES EXPORT - Exports all sales data with complete relationships
 */
async function exportSalesSnapshot(filters = {}) {
  const snapshot = {
    version: SNAPSHOT_VERSION,
    type: 'sales',
    exportedAt: new Date().toISOString(),
    filters,
    data: {
      syncSources: [],
      invoices: [],
      invoiceItems: [],
      products: [],
      metadata: {},
    },
  };

  try {
    // Fetch all sync sources
    const syncSources = await prisma.salesSyncSource.findMany({
      where: filters.branchCode ? { branchCode: String(filters.branchCode) } : undefined,
    });

    snapshot.data.syncSources = syncSources.map(source => ({
      id: source.id,
      branchCode: source.branchCode,
      branchName: source.branchName,
      locationId: source.locationId,
      syncSourceCode: source.syncSourceCode,
      lastSeenAt: source.lastSeenAt.toISOString(),
    }));

    // Fetch all invoices with filters
    const invoiceWhere = {
      ...(filters.branchCode && { branchCode: String(filters.branchCode) }),
      ...(filters.syncSourceCode && { syncSourceCode: String(filters.syncSourceCode) }),
      ...(filters.startDate && { invoiceDate: { gte: new Date(filters.startDate) } }),
      ...(filters.endDate && { invoiceDate: { lte: new Date(filters.endDate) } }),
    };

    const invoices = await prisma.salesInvoice.findMany({
      where: invoiceWhere,
      orderBy: { invoiceDate: 'asc' },
    });

    snapshot.data.invoices = invoices.map(inv => ({
      id: inv.id,
      syncSourceId: inv.syncSourceId,
      branchCode: inv.branchCode,
      branchName: inv.branchName,
      locationId: inv.locationId,
      syncSourceCode: inv.syncSourceCode,
      sourceInvoiceNo: inv.sourceInvoiceNo,
      sourceInvoiceSerialNo: inv.sourceInvoiceSerialNo,
      sourceCashSaleNo: inv.sourceCashSaleNo,
      refNo: inv.refNo,
      invoiceDate: inv.invoiceDate?.toISOString(),
      invoiceTime: inv.invoiceTime?.toISOString(),
      customerCode: inv.customerCode,
      customerDetails: inv.customerDetails,
      locationCode: inv.locationCode,
      grossSale: inv.grossSale,
      vatAmount: inv.vatAmount,
      discount: inv.discount,
      netSale: inv.netSale,
      invoiceType: inv.invoiceType,
      tillId: inv.tillId,
      payMethod1: inv.payMethod1,
      tenderAmount1: inv.tenderAmount1,
      chqNo1: inv.chqNo1,
      payMethod2: inv.payMethod2,
      tenderAmount2: inv.tenderAmount2,
      chqNo2: inv.chqNo2,
      userName: inv.userName,
      priceTypeCode: inv.priceTypeCode,
      repCode: inv.repCode,
      uploadStatus: inv.uploadStatus,
      levyAmount: inv.levyAmount,
      reserved: inv.reserved,
      discountAmount: inv.discountAmount,
      fiscalReceiptNo: inv.fiscalReceiptNo,
      bankCode: inv.bankCode,
      bankName: inv.bankName,
      bankCardHolder: inv.bankCardHolder,
      bankCardNo: inv.bankCardNo,
      bankCardExpiry: inv.bankCardExpiry,
      quoteNo: inv.quoteNo,
      sourceSyncedAt: inv.sourceSyncedAt?.toISOString(),
      firstReceivedAt: inv.firstReceivedAt.toISOString(),
      lastReceivedAt: inv.lastReceivedAt.toISOString(),
    }));

    // Fetch all invoice items
    const invoiceItems = await prisma.salesInvoiceItem.findMany({
      where: invoiceWhere.syncSourceCode
        ? { syncSourceCode: String(filters.syncSourceCode) }
        : undefined,
      orderBy: { createdAt: 'asc' },
    });

    snapshot.data.invoiceItems = invoiceItems.map(item => ({
      id: item.id,
      salesInvoiceId: item.salesInvoiceId,
      syncSourceCode: item.syncSourceCode,
      sourceInvDetailId: item.sourceInvDetailId,
      sourceInvoiceCode: item.sourceInvoiceCode,
      productCode: item.productCode,
      productName: item.productName,
      qty: item.qty,
      priceTypeCode: item.priceTypeCode,
      unitPrice: item.unitPrice,
      bulkPrice: item.bulkPrice,
      discount: item.discount,
      amount: item.amount,
      startSerialNo: item.startSerialNo,
      endSerialNo: item.endSerialNo,
      taxRate: item.taxRate,
      taxAmount: item.taxAmount,
      fPrice: item.fPrice,
      uploadStatus: item.uploadStatus,
      locationCode: item.locationCode,
      levyRate: item.levyRate,
      levyAmount: item.levyAmount,
      printed: item.printed,
      subQty: item.subQty,
      discountAmount: item.discountAmount,
      costPrice: item.costPrice,
      grnDate: item.grnDate?.toISOString(),
      firstReceivedAt: item.firstReceivedAt.toISOString(),
      lastReceivedAt: item.lastReceivedAt.toISOString(),
    }));

    // Fetch products
    const products = await prisma.product.findMany({
      orderBy: { name: 'asc' },
    });

    snapshot.data.products = products.map(prod => ({
      id: prod.id,
      sourceCode: prod.sourceCode,
      name: prod.name,
      price: prod.price,
      originalPrice: prod.originalPrice,
      discountPrice: prod.discountPrice,
      isOnSale: prod.isOnSale,
      stock: prod.stock,
      category: prod.category,
      description: prod.description,
      barcode: prod.barcode,
      expiryDate: prod.expiryDate?.toISOString(),
      expiryBatchCount: prod.expiryBatchCount,
      image: prod.image,
      isActive: prod.isActive,
      hideFromProductsPage: prod.hideFromProductsPage,
      enabled: prod.enabled,
      lowStockThreshold: prod.lowStockThreshold,
    }));

    // Add metadata
    snapshot.data.metadata = {
      totalSyncSources: snapshot.data.syncSources.length,
      totalInvoices: snapshot.data.invoices.length,
      totalInvoiceItems: snapshot.data.invoiceItems.length,
      totalProducts: snapshot.data.products.length,
      dateRange: {
        start: filters.startDate || null,
        end: filters.endDate || null,
      },
    };

    return snapshot;
  } catch (error) {
    throw new Error(`Sales export failed: ${error.message}`);
  }
}

/**
 * IMPORT PAYROLL - Restores payroll data from snapshot
 */
async function importPayrollSnapshot(snapshotData, options = {}) {
  const { upsert = true, clearExisting = false, locationId = null } = options;
  const results = {
    imported: {},
    skipped: [],
    errors: [],
  };

  try {
    if (!snapshotData.data) {
      throw new Error('Invalid snapshot format: missing data section');
    }

    const data = snapshotData.data;

    // Import employees
    if (data.employees?.length) {
      try {
        for (const emp of data.employees) {
          const createData = {
            employeeNo: emp.employeeNo,
            firstName: emp.firstName,
            surname: emp.surname,
            middleName: emp.middleName,
            gender: emp.gender,
            dateOfBirth: emp.dateOfBirth ? new Date(emp.dateOfBirth) : null,
            districtOfOrigin: emp.districtOfOrigin,
            village: emp.village,
            traditionalAuthority: emp.traditionalAuthority,
            nationalId: emp.nationalId,
            nationalIdExpiryDate: emp.nationalIdExpiryDate ? new Date(emp.nationalIdExpiryDate) : null,
            contactNumber: emp.contactNumber,
            dateOfEmployment: emp.dateOfEmployment ? new Date(emp.dateOfEmployment) : null,
            position: emp.position,
            department: emp.department,
            locationId: emp.locationId || locationId,
            employmentType: emp.employmentType,
            status: emp.status || 'active',
            notes: emp.notes,
          };

          if (upsert && emp.employeeNo) {
            await prisma.employee.upsert({
              where: { employeeNo: emp.employeeNo },
              update: createData,
              create: createData,
            });
          } else {
            await prisma.employee.create({ data: createData });
          }
        }
        results.imported.employees = data.employees.length;
      } catch (error) {
        results.errors.push(`Employee import error: ${error.message}`);
      }
    }

    // Import salary structures
    if (data.salaryStructures?.length) {
      try {
        for (const ss of data.salaryStructures) {
          const createData = {
            employeeId: ss.employeeId,
            agreedSalaryPerMonth: ss.agreedSalaryPerMonth,
            annualIncrementAmount: ss.annualIncrementAmount,
            salaryAfterIncrement: ss.salaryAfterIncrement,
            currency: ss.currency || 'MWK',
            effectiveFrom: new Date(ss.effectiveFrom),
            effectiveTo: ss.effectiveTo ? new Date(ss.effectiveTo) : null,
            isCurrent: ss.isCurrent !== false,
          };

          await prisma.employeeSalaryStructure.create({ data: createData });
        }
        results.imported.salaryStructures = data.salaryStructures.length;
      } catch (error) {
        results.errors.push(`Salary structure import error: ${error.message}`);
      }
    }

    // Import payroll periods
    if (data.payrollPeriods?.length) {
      try {
        const periodMap = new Map();
        for (const pp of data.payrollPeriods) {
          const createData = {
            reportingPeriodId: pp.reportingPeriodId,
            payrollMode: pp.payrollMode,
            locationId: pp.locationId || locationId,
            payrollMonth: pp.payrollMonth,
            payrollYear: pp.payrollYear,
            payrollPositionInMonth: pp.payrollPositionInMonth,
            description: pp.description,
            status: pp.status || 'draft',
            createdBy: pp.createdBy,
            runStartedAt: pp.runStartedAt ? new Date(pp.runStartedAt) : null,
            finalizedAt: pp.finalizedAt ? new Date(pp.finalizedAt) : null,
          };

          const created = await prisma.payrollPeriod.create({ data: createData });
          periodMap.set(pp.id, created.id);
        }
        results.imported.payrollPeriods = data.payrollPeriods.length;
      } catch (error) {
        results.errors.push(`Payroll period import error: ${error.message}`);
      }
    }

    // Import payroll entries
    if (data.payrollEntries?.length) {
      try {
        for (const pe of data.payrollEntries) {
          const createData = {
            payrollPeriodId: pe.payrollPeriodId,
            employeeId: pe.employeeId,
            basicSalary: pe.basicSalary || 0,
            incrementAmount: pe.incrementAmount || 0,
            grossPay: pe.grossPay || 0,
            totalDeductions: pe.totalDeductions || 0,
            netPay: pe.netPay || 0,
            daysWorked: pe.daysWorked,
            daysAbsent: pe.daysAbsent,
            overtimeHours: pe.overtimeHours,
            overtimeNormalHours: pe.overtimeNormalHours,
            overtimeDoubleHours: pe.overtimeDoubleHours,
            overtimeAmount: pe.overtimeAmount,
            overtimeNormalAmount: pe.overtimeNormalAmount,
            overtimeDoubleAmount: pe.overtimeDoubleAmount,
            loanDeductionAmount: pe.loanDeductionAmount,
            absenceDeductionAmount: pe.absenceDeductionAmount,
            otherDeductionAmount: pe.otherDeductionAmount,
            bonusAmount: pe.bonusAmount,
            giftAmount: pe.giftAmount,
            leavePayAmount: pe.leavePayAmount,
            payeAmount: pe.payeAmount,
            loanBalanceAtPayroll: pe.loanBalanceAtPayroll,
            accruedInterestAtPayroll: pe.accruedInterestAtPayroll,
            netPayMidPortion: pe.netPayMidPortion,
            netPayEndPortion: pe.netPayEndPortion,
            notes: pe.notes,
          };

          await prisma.payrollEntry.create({ data: createData });
        }
        results.imported.payrollEntries = data.payrollEntries.length;
      } catch (error) {
        results.errors.push(`Payroll entry import error: ${error.message}`);
      }
    }

    // Import loans
    if (data.loans?.length) {
      try {
        const loanMap = new Map();
        for (const loan of data.loans) {
          const createData = {
            employeeId: loan.employeeId,
            loanReference: loan.loanReference,
            principalAmount: loan.principalAmount,
            balanceAmount: loan.balanceAmount,
            interestRate: loan.interestRate,
            accruedInterest: loan.accruedInterest || 0,
            loanGrantedMonth: loan.loanGrantedMonth,
            loanGrantedYear: loan.loanGrantedYear,
            monthlyDeductionAmount: loan.monthlyDeductionAmount,
            repaymentEndMonth: loan.repaymentEndMonth,
            repaymentEndYear: loan.repaymentEndYear,
            reason: loan.reason,
            startDate: loan.startDate ? new Date(loan.startDate) : null,
            endDate: loan.endDate ? new Date(loan.endDate) : null,
            status: loan.status || 'active',
            notes: loan.notes,
          };

          const created = await prisma.employeeLoan.create({ data: createData });
          loanMap.set(loan.id, created.id);
        }
        results.imported.loans = data.loans.length;
      } catch (error) {
        results.errors.push(`Loan import error: ${error.message}`);
      }
    }

    // Import loan transactions
    if (data.loanTransactions?.length) {
      try {
        for (const lt of data.loanTransactions) {
          const createData = {
            employeeLoanId: lt.employeeLoanId,
            payrollPeriodId: lt.payrollPeriodId,
            transactionType: lt.transactionType,
            amount: lt.amount,
            principalComponent: lt.principalComponent,
            interestComponent: lt.interestComponent,
            notes: lt.notes,
          };

          await prisma.employeeLoanTransaction.create({ data: createData });
        }
        results.imported.loanTransactions = data.loanTransactions.length;
      } catch (error) {
        results.errors.push(`Loan transaction import error: ${error.message}`);
      }
    }

    // Import terminations
    if (data.terminations?.length) {
      try {
        for (const term of data.terminations) {
          const createData = {
            employeeId: term.employeeId,
            terminationDate: new Date(term.terminationDate),
            terminationType: term.terminationType,
            reason: term.reason,
            daysWorkedInFinalMonth: term.daysWorkedInFinalMonth,
            halfPayReceived: term.halfPayReceived,
            halfPayDueInTerminationMonth: term.halfPayDueInTerminationMonth,
            amountPaidInTerminationMonth: term.amountPaidInTerminationMonth,
            leavePayAccruedDays: term.leavePayAccruedDays,
            leavePayAmount: term.leavePayAmount,
            outstandingLoanObligations: term.outstandingLoanObligations,
            grossSettlementAmount: term.grossSettlementAmount,
            netSettlementAmount: term.netSettlementAmount,
            settlementAmount: term.settlementAmount,
            notes: term.notes,
          };

          await prisma.employeeTermination.create({ data: createData });
        }
        results.imported.terminations = data.terminations.length;
      } catch (error) {
        results.errors.push(`Termination import error: ${error.message}`);
      }
    }

    // Import reengagements
    if (data.reengagements?.length) {
      try {
        for (const reeng of data.reengagements) {
          const createData = {
            employeeId: reeng.employeeId,
            linkedTerminationId: reeng.linkedTerminationId,
            wageAtRetrenchment: reeng.wageAtRetrenchment,
            previousWage: reeng.previousWage,
            reengagementWage: reeng.reengagementWage,
            occupation: reeng.occupation,
            effectiveDate: new Date(reeng.effectiveDate),
            contractExpiryDate: reeng.contractExpiryDate ? new Date(reeng.contractExpiryDate) : null,
            notes: reeng.notes,
          };

          await prisma.employeeReengagement.create({ data: createData });
        }
        results.imported.reengagements = data.reengagements.length;
      } catch (error) {
        results.errors.push(`Reengagement import error: ${error.message}`);
      }
    }

    // Import tax brackets
    if (data.taxBrackets?.length) {
      try {
        for (const tb of data.taxBrackets) {
          const createData = {
            locationId: tb.locationId || locationId,
            effectiveFrom: new Date(tb.effectiveFrom),
            effectiveTo: tb.effectiveTo ? new Date(tb.effectiveTo) : null,
            minIncome: tb.minIncome,
            maxIncome: tb.maxIncome,
            ratePercent: tb.ratePercent,
            fixedTaxAmount: tb.fixedTaxAmount,
            description: tb.description,
            isActive: tb.isActive !== false,
          };

          await prisma.payrollTaxBracket.create({ data: createData });
        }
        results.imported.taxBrackets = data.taxBrackets.length;
      } catch (error) {
        results.errors.push(`Tax bracket import error: ${error.message}`);
      }
    }

    // Import increment policies
    if (data.incrementPolicies?.length) {
      try {
        for (const ip of data.incrementPolicies) {
          const createData = {
            locationId: ip.locationId || locationId,
            minServiceMonths: ip.minServiceMonths,
            maxServiceMonths: ip.maxServiceMonths,
            incrementPercent: ip.incrementPercent,
            incrementAmount: ip.incrementAmount,
            effectiveFrom: new Date(ip.effectiveFrom),
            effectiveTo: ip.effectiveTo ? new Date(ip.effectiveTo) : null,
            notes: ip.notes,
            isActive: ip.isActive !== false,
          };

          await prisma.payrollIncrementPolicy.create({ data: createData });
        }
        results.imported.incrementPolicies = data.incrementPolicies.length;
      } catch (error) {
        results.errors.push(`Increment policy import error: ${error.message}`);
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Payroll import failed: ${error.message}`);
  }
}

/**
 * IMPORT SALES - Restores sales data from snapshot
 */
async function importSalesSnapshot(snapshotData, options = {}) {
  const { upsert = true } = options;
  const results = {
    imported: {},
    skipped: [],
    errors: [],
  };

  try {
    if (!snapshotData.data) {
      throw new Error('Invalid snapshot format: missing data section');
    }

    const data = snapshotData.data;

    // Import sync sources
    if (data.syncSources?.length) {
      try {
        const sourceMap = new Map();
        for (const source of data.syncSources) {
          const createData = {
            branchCode: source.branchCode,
            branchName: source.branchName,
            locationId: source.locationId,
            syncSourceCode: source.syncSourceCode,
            lastSeenAt: new Date(source.lastSeenAt),
          };

          if (upsert && source.syncSourceCode) {
            const existing = await prisma.salesSyncSource.findFirst({
              where: { syncSourceCode: source.syncSourceCode },
            });

            if (existing) {
              const updated = await prisma.salesSyncSource.update({
                where: { id: existing.id },
                data: createData,
              });
              sourceMap.set(source.id, updated.id);
            } else {
              const created = await prisma.salesSyncSource.create({ data: createData });
              sourceMap.set(source.id, created.id);
            }
          } else {
            const created = await prisma.salesSyncSource.create({ data: createData });
            sourceMap.set(source.id, created.id);
          }
        }
        results.imported.syncSources = data.syncSources.length;
      } catch (error) {
        results.errors.push(`Sync source import error: ${error.message}`);
      }
    }

    // Import products
    if (data.products?.length) {
      try {
        for (const prod of data.products) {
          const createData = {
            sourceCode: prod.sourceCode,
            name: prod.name,
            price: prod.price,
            originalPrice: prod.originalPrice,
            discountPrice: prod.discountPrice,
            isOnSale: prod.isOnSale !== false,
            stock: prod.stock || 0,
            category: prod.category,
            description: prod.description,
            barcode: prod.barcode,
            expiryDate: prod.expiryDate ? new Date(prod.expiryDate) : null,
            expiryBatchCount: prod.expiryBatchCount || 0,
            image: prod.image,
            isActive: prod.isActive !== false,
            hideFromProductsPage: prod.hideFromProductsPage !== true,
            enabled: prod.enabled !== false,
            lowStockThreshold: prod.lowStockThreshold,
          };

          if (upsert && prod.sourceCode) {
            await prisma.product.upsert({
              where: { sourceCode: prod.sourceCode },
              update: createData,
              create: createData,
            });
          } else if (upsert && prod.barcode) {
            const existing = await prisma.product.findFirst({
              where: { barcode: prod.barcode },
            });

            if (existing) {
              await prisma.product.update({
                where: { id: existing.id },
                data: createData,
              });
            } else {
              await prisma.product.create({ data: createData });
            }
          } else {
            await prisma.product.create({ data: createData });
          }
        }
        results.imported.products = data.products.length;
      } catch (error) {
        results.errors.push(`Product import error: ${error.message}`);
      }
    }

    // Import invoices
    if (data.invoices?.length) {
      try {
        const invoiceMap = new Map();
        for (const inv of data.invoices) {
          const createData = {
            syncSourceId: inv.syncSourceId,
            branchCode: inv.branchCode,
            branchName: inv.branchName,
            locationId: inv.locationId,
            syncSourceCode: inv.syncSourceCode,
            sourceInvoiceNo: inv.sourceInvoiceNo,
            sourceInvoiceSerialNo: inv.sourceInvoiceSerialNo,
            sourceCashSaleNo: inv.sourceCashSaleNo,
            refNo: inv.refNo,
            invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : null,
            invoiceTime: inv.invoiceTime ? new Date(inv.invoiceTime) : null,
            customerCode: inv.customerCode,
            customerDetails: inv.customerDetails,
            locationCode: inv.locationCode,
            grossSale: inv.grossSale || 0,
            vatAmount: inv.vatAmount || 0,
            discount: inv.discount || 0,
            netSale: inv.netSale || 0,
            invoiceType: inv.invoiceType,
            tillId: inv.tillId,
            payMethod1: inv.payMethod1,
            tenderAmount1: inv.tenderAmount1,
            chqNo1: inv.chqNo1,
            payMethod2: inv.payMethod2,
            tenderAmount2: inv.tenderAmount2,
            chqNo2: inv.chqNo2,
            userName: inv.userName,
            priceTypeCode: inv.priceTypeCode,
            repCode: inv.repCode,
            uploadStatus: inv.uploadStatus,
            levyAmount: inv.levyAmount,
            reserved: inv.reserved,
            discountAmount: inv.discountAmount,
            fiscalReceiptNo: inv.fiscalReceiptNo,
            bankCode: inv.bankCode,
            bankName: inv.bankName,
            bankCardHolder: inv.bankCardHolder,
            bankCardNo: inv.bankCardNo,
            bankCardExpiry: inv.bankCardExpiry,
            quoteNo: inv.quoteNo,
            sourceSyncedAt: inv.sourceSyncedAt ? new Date(inv.sourceSyncedAt) : null,
            firstReceivedAt: new Date(inv.firstReceivedAt),
            lastReceivedAt: new Date(inv.lastReceivedAt),
          };

          if (upsert && inv.syncSourceCode && inv.sourceInvoiceNo) {
            const existing = await prisma.salesInvoice.findFirst({
              where: {
                syncSourceCode: inv.syncSourceCode,
                sourceInvoiceNo: inv.sourceInvoiceNo,
              },
            });

            if (existing) {
              const updated = await prisma.salesInvoice.update({
                where: { id: existing.id },
                data: createData,
              });
              invoiceMap.set(inv.id, updated.id);
            } else {
              const created = await prisma.salesInvoice.create({ data: createData });
              invoiceMap.set(inv.id, created.id);
            }
          } else {
            const created = await prisma.salesInvoice.create({ data: createData });
            invoiceMap.set(inv.id, created.id);
          }
        }
        results.imported.invoices = data.invoices.length;
      } catch (error) {
        results.errors.push(`Invoice import error: ${error.message}`);
      }
    }

    // Import invoice items
    if (data.invoiceItems?.length) {
      try {
        for (const item of data.invoiceItems) {
          const createData = {
            salesInvoiceId: item.salesInvoiceId,
            syncSourceCode: item.syncSourceCode,
            sourceInvDetailId: item.sourceInvDetailId,
            sourceInvoiceCode: item.sourceInvoiceCode,
            productCode: item.productCode,
            productName: item.productName,
            qty: item.qty || 0,
            priceTypeCode: item.priceTypeCode,
            unitPrice: item.unitPrice,
            bulkPrice: item.bulkPrice,
            discount: item.discount,
            amount: item.amount,
            startSerialNo: item.startSerialNo,
            endSerialNo: item.endSerialNo,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            fPrice: item.fPrice,
            uploadStatus: item.uploadStatus,
            locationCode: item.locationCode,
            levyRate: item.levyRate,
            levyAmount: item.levyAmount,
            printed: item.printed,
            subQty: item.subQty,
            discountAmount: item.discountAmount,
            costPrice: item.costPrice,
            grnDate: item.grnDate ? new Date(item.grnDate) : null,
            firstReceivedAt: new Date(item.firstReceivedAt),
            lastReceivedAt: new Date(item.lastReceivedAt),
          };

          await prisma.salesInvoiceItem.create({ data: createData });
        }
        results.imported.invoiceItems = data.invoiceItems.length;
      } catch (error) {
        results.errors.push(`Invoice item import error: ${error.message}`);
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Sales import failed: ${error.message}`);
  }
}

/**
 * Create a ZIP archive with both payroll and sales exports
 */
async function createFullBackupZip(options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const stream = new Readable();
      const chunks = [];

      archive.on('data', (chunk) => {
        chunks.push(chunk);
      });

      archive.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      archive.on('error', reject);

      // Export payroll data
      const payrollSnapshot = await exportPayrollSnapshot(options.payrollFilters || {});
      archive.append(JSON.stringify(payrollSnapshot, null, 2), { name: 'payroll-snapshot.json' });

      // Export sales data
      const salesSnapshot = await exportSalesSnapshot(options.salesFilters || {});
      archive.append(JSON.stringify(salesSnapshot, null, 2), { name: 'sales-snapshot.json' });

      // Add manifest
      const manifest = {
        version: SNAPSHOT_VERSION,
        createdAt: new Date().toISOString(),
        description: 'Complete backup of Citi-Nati Supermarket payroll and sales data',
        files: ['payroll-snapshot.json', 'sales-snapshot.json'],
      };
      archive.append(JSON.stringify(manifest, null, 2), { name: 'MANIFEST.json' });

      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  exportPayrollSnapshot,
  exportSalesSnapshot,
  importPayrollSnapshot,
  importSalesSnapshot,
  createFullBackupZip,
  SNAPSHOT_VERSION,
};
