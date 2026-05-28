'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PRESERVED_TABLES = [
  'sales_invoices',
  'sales_invoice_items',
  'sales_reporting_summary (derived/reporting views)',
  'users/auth/system settings',
  'product sync and inventory sync data',
  'business_locations',
  'reporting_periods',
];

const TARGET_TABLES = [
  { key: 'goodsIntakeItems', model: 'goodsIntakeItem' },
  { key: 'goodsIntakes', model: 'goodsIntake' },
  { key: 'supplierTransactions', model: 'supplierTransaction' },
  { key: 'supplierBalances', model: 'supplierBalance' },
  { key: 'suppliers', model: 'supplier' },
  { key: 'expenses', model: 'expense' },
  { key: 'employeeLoanTransactions', model: 'employeeLoanTransaction' },
  { key: 'employeeLoans', model: 'employeeLoan' },
  { key: 'employeeTerminations', model: 'employeeTermination' },
  { key: 'employeeReengagements', model: 'employeeReengagement' },
  { key: 'payrollEntries', model: 'payrollEntry' },
  { key: 'payrollPeriods', model: 'payrollPeriod' },
  { key: 'employeeSalaryStructures', model: 'employeeSalaryStructure' },
  { key: 'employees', model: 'employee' },
];

const WIPE_TARGET_TABLES = [
  { key: 'goodsIntakeItems', model: 'goodsIntakeItem' },
  { key: 'goodsIntakes', model: 'goodsIntake' },
  { key: 'supplierTransactions', model: 'supplierTransaction' },
  { key: 'supplierBalances', model: 'supplierBalance' },
  { key: 'suppliers', model: 'supplier' },
  { key: 'expenses', model: 'expense' },
  { key: 'expenseCategories', model: 'expenseCategory' },
  { key: 'payrollEntries', model: 'payrollEntry' },
  { key: 'employeeLoanTransactions', model: 'employeeLoanTransaction' },
  { key: 'employeeLoans', model: 'employeeLoan' },
  { key: 'employeeReengagements', model: 'employeeReengagement' },
  { key: 'employeeTerminations', model: 'employeeTermination' },
  { key: 'employeeSalaryStructures', model: 'employeeSalaryStructure' },
  { key: 'payrollPeriods', model: 'payrollPeriod' },
  { key: 'payrollTaxBrackets', model: 'payrollTaxBracket' },
  { key: 'payrollIncrementPolicies', model: 'payrollIncrementPolicy' },
  { key: 'employees', model: 'employee' },
];

function getDelegate(client, modelName) {
  const delegate = client[modelName];
  if (!delegate || typeof delegate.count !== 'function') {
    return null;
  }
  return delegate;
}

async function collectCounts(client) {
  const counts = {};
  for (const table of TARGET_TABLES) {
    const delegate = getDelegate(client, table.model);
    counts[table.key] = delegate ? await delegate.count() : 0;
  }

  const expenseCategoryDelegate = getDelegate(client, 'expenseCategory');
  counts.expenseCategories = expenseCategoryDelegate ? await expenseCategoryDelegate.count() : 0;
  return counts;
}

function normalizeOptions(options = {}) {
  return {
    dryRun: options.dryRun !== false,
    preserveExpenseCategories: options.preserveExpenseCategories !== false,
    pruneUnusedExpenseCategories: options.pruneUnusedExpenseCategories === true,
    actor: options.actor || 'unknown',
  };
}

async function resetImportedBusinessOperationsData(options = {}) {
  const normalized = normalizeOptions(options);

  const beforeCounts = await collectCounts(prisma);

  const result = {
    success: true,
    dryRun: normalized.dryRun,
    deletedCounts: {},
    beforeCounts,
    afterCounts: null,
    preservedTables: [...PRESERVED_TABLES],
    notes: [
      'Cleanup targets only workbook-driven Business Operations records.',
      'POS sync, sales reporting, auth/users, and system configuration are untouched.',
    ],
  };

  console.info('[BO][RESET] Request received', {
    actor: normalized.actor,
    dryRun: normalized.dryRun,
    preserveExpenseCategories: normalized.preserveExpenseCategories,
    pruneUnusedExpenseCategories: normalized.pruneUnusedExpenseCategories,
    beforeCounts,
  });

  if (normalized.dryRun) {
    result.afterCounts = beforeCounts;
    result.notes.push('Dry run only: no records were deleted.');
    result.aboutToDelete = { ...beforeCounts };
    return result;
  }

  const deletedCounts = await prisma.$transaction(async (tx) => {
    const deleted = {};

    for (const table of TARGET_TABLES) {
      const delegate = getDelegate(tx, table.model);
      if (!delegate || typeof delegate.deleteMany !== 'function') {
        deleted[table.key] = 0;
        continue;
      }
      deleted[table.key] = (await delegate.deleteMany({})).count;
    }

    if (!normalized.preserveExpenseCategories && normalized.pruneUnusedExpenseCategories) {
      const expenseCategoryDelegate = getDelegate(tx, 'expenseCategory');
      if (expenseCategoryDelegate && typeof expenseCategoryDelegate.deleteMany === 'function') {
        deleted.expenseCategories = (await expenseCategoryDelegate.deleteMany({
          where: {
            expenses: { none: {} },
          },
        })).count;
      } else {
        deleted.expenseCategories = 0;
      }
    } else {
      deleted.expenseCategories = 0;
    }

    return deleted;
  });

  const afterCounts = await collectCounts(prisma);

  result.deletedCounts = deletedCounts;
  result.afterCounts = afterCounts;

  if (normalized.preserveExpenseCategories) {
    result.notes.push('Expense categories were preserved.');
  } else if (normalized.pruneUnusedExpenseCategories) {
    result.notes.push('Unused expense categories were pruned.');
  }

  console.info('[BO][RESET] Completed', {
    actor: normalized.actor,
    deletedCounts,
    afterCounts,
  });

  return result;
}

module.exports = {
  resetImportedBusinessOperationsData,
  wipeAllBusinessOperationsData,
};

async function wipeAllBusinessOperationsData(options = {}) {
  const actor = options.actor || 'unknown';

  const beforeCounts = {};
  for (const table of WIPE_TARGET_TABLES) {
    const delegate = getDelegate(prisma, table.model);
    beforeCounts[table.key] = delegate ? await delegate.count() : 0;
  }

  logger.productionSummaryLog('[BO][WIPE] Request received', {
    actor,
    beforeCounts,
    preservedTables: PRESERVED_TABLES,
  });

  const deletedCounts = await prisma.$transaction(async (tx) => {
    const deleted = {};
    for (const table of WIPE_TARGET_TABLES) {
      const delegate = getDelegate(tx, table.model);
      if (!delegate || typeof delegate.deleteMany !== 'function') {
        deleted[table.key] = 0;
        continue;
      }
      deleted[table.key] = (await delegate.deleteMany({})).count;
    }
    return deleted;
  });

  const afterCounts = {};
  for (const table of WIPE_TARGET_TABLES) {
    const delegate = getDelegate(prisma, table.model);
    afterCounts[table.key] = delegate ? await delegate.count() : 0;
  }

  logger.productionSummaryLog('[BO][WIPE] Completed', {
    actor,
    deletedCounts,
    afterCounts,
  });

  return {
    deletedCounts,
    beforeCounts,
    afterCounts,
    preservedTables: [...PRESERVED_TABLES],
    notes: [
      'Sales report source data (sales_invoices, sales_invoice_items, sales_sync_sources) was preserved.',
      'This operation removed Business Operations domain data only.',
    ],
  };
}
