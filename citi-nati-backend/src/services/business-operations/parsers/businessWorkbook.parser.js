'use strict';

const {
  normalizeToken,
  detectSheetByAliases,
  getSheetRows,
  findHeaderRowIndex,
  buildRowObjectsFromSheet,
  findCellByAliases,
  cleanString,
  parseNumber,
  parseDate,
  summarizeParsedData,
} = require('./commonWorkbook.utils');

const SHEET_ALIASES = {
  suppliers: ['Suppliers Report', 'Supplier Report', 'Suppliers'],
  expenses: ['Expenses Report', 'Expense Report', 'Expenses'],
  salesInput: ['Sales Input'],
  consolidatedSales: ['Consolidated Sales'],
  summary: ['Summary'],
};

function parseSuppliersSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  let headerIndex = findHeaderRowIndex(rows, ['supplier', 'name', 'balance']);

  // Fallback: look for rows with "Supplier Name" in first column or nearby
  if (headerIndex < 0) {
    for (let i = 0; i < Math.min(15, rows.length); i += 1) {
      const row = rows[i] || [];
      const firstCells = (row.slice(0, 5) || []).map((c) => cleanString(c) || '').join(' ').toLowerCase();
      if (firstCells.includes('supplier') && firstCells.includes('name')) {
        headerIndex = i;
        break;
      }
    }
  }

  if (headerIndex < 0) {
    warnings.push(`Sheet '${sheetName}' found but supplier headers were not confidently detected`);
    return { suppliers: [], supplierTransactions: [] };
  }

  const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);
  const suppliers = [];
  const supplierTransactions = [];

  for (const row of dataRows) {
    const name = cleanString(findCellByAliases(row, headerMap, ['Supplier Name', 'Supplier', 'Name']));
    if (!name) continue;

    const supplierCode = cleanString(findCellByAliases(row, headerMap, ['Supplier Code', 'Code'])) || name.slice(0, 20);
    const openingBalance = parseNumber(findCellByAliases(row, headerMap, ['Opening Balance', 'Opening', 'Balance'])) || 0;

    suppliers.push({
      supplierCode,
      name,
      contactPerson: cleanString(findCellByAliases(row, headerMap, ['Contact Person', 'Contact'])),
      phone: cleanString(findCellByAliases(row, headerMap, ['Phone', 'Phone Number', 'Contact Number'])),
      email: cleanString(findCellByAliases(row, headerMap, ['Email', 'E-mail'])),
      address: cleanString(findCellByAliases(row, headerMap, ['Address'])),
      openingBalance,
      status: cleanString(findCellByAliases(row, headerMap, ['Status'])) || 'active',
      notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
    });

    // Look for debt and paid amounts across all amount columns
    const debtAmount = parseNumber(
      findCellByAliases(row, headerMap, ['Debt Amount', 'Amount Due to Suppliers', 'Total Debt']) ||
      findCellByAliases(row, headerMap, ['Amount'])
    );
    const paidAmount = parseNumber(
      findCellByAliases(row, headerMap, ['Amount Paid', 'Total Paid', 'Paid']) ||
      findCellByAliases(row, headerMap, ['Amount'])
    );

    if (debtAmount !== null && debtAmount > 0) {
      supplierTransactions.push({
        supplierCode,
        supplierName: name,
        reportingPeriodId: null,
        transactionDate: parseDate(findCellByAliases(row, headerMap, ['Date', 'Transaction Date'])) || new Date(),
        transactionType: 'debt',
        paymentMethod: 'other',
        amount: debtAmount,
        description: 'Imported debt summary',
        referenceNo: cleanString(findCellByAliases(row, headerMap, ['Reference', 'Ref No'])),
      });
    }

    if (paidAmount !== null && paidAmount > 0) {
      supplierTransactions.push({
        supplierCode,
        supplierName: name,
        reportingPeriodId: null,
        transactionDate: parseDate(findCellByAliases(row, headerMap, ['Date', 'Transaction Date'])) || new Date(),
        transactionType: 'payment',
        paymentMethod: 'other',
        amount: paidAmount,
        description: 'Imported payment summary',
        referenceNo: cleanString(findCellByAliases(row, headerMap, ['Reference', 'Ref No'])),
      });
    }
  }

  if (!suppliers.length && !supplierTransactions.length) {
    warnings.push(`Suppliers sheet detected but no valid rows were parsed from '${sheetName}'`);
  }

  return { suppliers, supplierTransactions };
}

function parseExpensesSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  let headerIndex = findHeaderRowIndex(rows, ['expense', 'amount', 'date']);

  // Fallback: look for rows with "Expense Distribution" or similar in first column
  if (headerIndex < 0) {
    for (let i = 0; i < Math.min(15, rows.length); i += 1) {
      const row = rows[i] || [];
      const firstCells = (row.slice(0, 5) || []).map((c) => cleanString(c) || '').join(' ').toLowerCase();
      if ((firstCells.includes('expense') || firstCells.includes('distribution')) && firstCells.includes('amount')) {
        headerIndex = i;
        break;
      }
    }
  }

  if (headerIndex < 0) {
    warnings.push(`Sheet '${sheetName}' found but expense headers were not confidently detected`);
    return { expenseCategories: [], expenses: [] };
  }

  const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);
  const categoryMap = new Map();
  const expenses = [];

  for (const row of dataRows) {
    // Handle both "Expense Distribution" and direct category naming
    const categoryName = cleanString(
      findCellByAliases(row, headerMap, ['Expense Distribution', 'Category', 'Expense Category', 'Type']) ||
      row[0]  // Fall back to first column if it contains the expense name
    ) || 'Other Operating Expenses';
    
    // Skip section headers like "Total Expenses Incurred"
    if (!categoryName || categoryName.toLowerCase().includes('total') || categoryName.toLowerCase() === 'expense distribution') {
      continue;
    }

    // Look for amount in debt or total columns
    const amount = parseNumber(
      findCellByAliases(row, headerMap, ['Debt Amount', 'Amount', 'Total'])
    );
    
    // Try to extract date, default to today if not found
    const expenseDate = parseDate(findCellByAliases(row, headerMap, ['Date', 'Transaction Date'])) || new Date();

    if (amount === null || amount === 0) continue;

    const normalizedCode = normalizeToken(categoryName).replace(/\s+/g, '_').toUpperCase().slice(0, 32) || 'OTHER_OPERATING';

    if (!categoryMap.has(normalizedCode)) {
      categoryMap.set(normalizedCode, {
        code: normalizedCode,
        name: categoryName,
        description: `Imported from ${sheetName}`,
        isActive: true,
      });
    }

    expenses.push({
      reportingPeriodId: null,
      categoryCode: normalizedCode,
      locationId: null,
      expenseDate,
      amount,
      description: cleanString(findCellByAliases(row, headerMap, ['Details', 'Narration', 'Notes'])),
      paymentMethod: cleanString(findCellByAliases(row, headerMap, ['Payment Method', 'Method'])) || 'other',
      referenceNo: cleanString(findCellByAliases(row, headerMap, ['Reference', 'Ref No', 'Voucher No'])),
      enteredBy: cleanString(findCellByAliases(row, headerMap, ['Entered By', 'User'])) || 'excel-import',
    });
  }

  if (![...categoryMap.values()].length && !expenses.length) {
    warnings.push(`Expenses sheet detected but no valid rows were parsed from '${sheetName}'`);
  }

  return {
    expenseCategories: [...categoryMap.values()],
    expenses,
  };
}

function parseBusinessWorkbook(workbook) {
  const warnings = [];
  const errors = [];
  const detectedSheets = [];

  const sheetNames = workbook.SheetNames || [];

  const suppliersSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.suppliers);
  const expensesSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.expenses);
  const salesInputSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.salesInput);
  const consolidatedSalesSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.consolidatedSales);
  const summarySheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.summary);

  const parsed = {
    suppliers: [],
    supplierTransactions: [],
    expenseCategories: [],
    expenses: [],
  };

  if (suppliersSheet) {
    try {
      detectedSheets.push(suppliersSheet);
      const result = parseSuppliersSheet(workbook, suppliersSheet, warnings);
      parsed.suppliers.push(...result.suppliers);
      parsed.supplierTransactions.push(...result.supplierTransactions);
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parseSuppliersSheet';
      err.sheet = suppliersSheet;
      err.detectedSheets = detectedSheets;
      throw err;
    }
  }

  if (expensesSheet) {
    try {
      detectedSheets.push(expensesSheet);
      const result = parseExpensesSheet(workbook, expensesSheet, warnings);
      parsed.expenseCategories.push(...result.expenseCategories);
      parsed.expenses.push(...result.expenses);
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parseExpensesSheet';
      err.sheet = expensesSheet;
      err.detectedSheets = detectedSheets;
      throw err;
    }
  }

  if (salesInputSheet) {
    detectedSheets.push(salesInputSheet);
    warnings.push(`Sheet '${salesInputSheet}' detected. Sales import is intentionally not prioritized because POS sync is authoritative.`);
  }

  if (consolidatedSalesSheet) {
    detectedSheets.push(consolidatedSalesSheet);
    warnings.push(`Sheet '${consolidatedSalesSheet}' detected. Sales import is intentionally skipped in this phase.`);
  }

  if (summarySheet) {
    detectedSheets.push(summarySheet);
    warnings.push(`Sheet '${summarySheet}' detected. Summary values are not imported automatically in this phase.`);
  }

  if (!detectedSheets.length) {
    warnings.push('No recognized business workbook sheets were found. Confirm workbook type and sheet names.');
  }

  const summary = summarizeParsedData(parsed);
  const parsedTotal = Object.values(summary).reduce((sum, value) => sum + Number(value || 0), 0);
  const penalty = (warnings.length * 4) + (errors.length * 15);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const confidence = {
    score,
    level: score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low',
    summary: `Detected ${parsedTotal} total parsed records across ${detectedSheets.length} sheets`,
  };

  return {
    workbookType: 'business',
    detectedSheets,
    parsed,
    summary,
    confidence,
    warnings,
    errors,
  };
}

module.exports = {
  parseBusinessWorkbook,
};
