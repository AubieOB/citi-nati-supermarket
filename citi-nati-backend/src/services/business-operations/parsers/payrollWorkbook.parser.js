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
  biodata: ['Biodata', 'Bio Data', 'Employee Biodata'],
  loanSchedule: ['LoanSchedule', 'Loan Schedule', 'Loans'],
  terminations: ['Terminations', 'Termination'],
  reengagements: ['Reengagement Wages', 'Re Engagement Wages', 'Reengagements'],
  payrollLike: ['Pay Sheet', 'Final', 'Wages', 'Combined Pay', 'Res-Workers', 'Shop-Workers'],
};

function parseEmployeeNo(row, headerMap) {
  return cleanString(findCellByAliases(row, headerMap, [
    'Employee No',
    'Employee Number',
    'Emp No',
    'Employee ID',
    'Staff No',
    'Staff Number',
    'Payroll No',
    'Worker No',
    'Man No',
    'ID',
  ]));
}

function splitFullName(value) {
  const text = cleanString(value);
  if (!text) return { firstName: null, surname: null };
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, surname: null };
  if (parts.length === 1) return { firstName: parts[0], surname: 'Unknown' };
  return {
    firstName: parts[0],
    surname: parts.slice(1).join(' '),
  };
}

function shouldSkipSummaryLikeRow(row, headerMap) {
  const token = normalizeToken((row || []).map((cell) => cleanString(cell) || '').join(' '));
  if (!token) return true;

  const looksLikeSummary = [
    'total',
    'subtotal',
    'grand total',
    'brought forward',
    'balance b f',
    'balance bf',
    'opening balance',
    'closing balance',
  ].some((needle) => token.includes(needle));

  if (!looksLikeSummary) return false;

  const employeeNo = parseEmployeeNo(row, headerMap);
  return !employeeNo;
}

function parseBiodataSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  const headerIndex = findHeaderRowIndex(rows, ['employee no', 'first name', 'surname']);

  if (headerIndex < 0) {
    warnings.push(`Sheet '${sheetName}' found but biodata headers were not confidently detected`);
    return { employees: [], salaryStructures: [] };
  }

  const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);

  const employees = [];
  const salaryStructures = [];
  let skippedRows = 0;

  for (const row of dataRows) {
    if (shouldSkipSummaryLikeRow(row, headerMap)) {
      skippedRows += 1;
      continue;
    }

    const employeeNo = parseEmployeeNo(row, headerMap);
    const explicitFirstName = cleanString(findCellByAliases(row, headerMap, ['First Name', 'Firstname']));
    const explicitSurname = cleanString(findCellByAliases(row, headerMap, ['Surname', 'Last Name']));
    const rawName = cleanString(findCellByAliases(row, headerMap, ['Employee Name', 'Full Name', 'Name', 'Names']));

    const nameParts = splitFullName(rawName);
    const firstName = explicitFirstName || nameParts.firstName;
    const surname = explicitSurname || nameParts.surname;

    if ((!firstName || !surname) && !employeeNo) {
      skippedRows += 1;
      continue;
    }

    employees.push({
      employeeNo,
      firstName: firstName || 'Unknown',
      surname: surname || 'Unknown',
      middleName: cleanString(findCellByAliases(row, headerMap, ['Middle Name', 'Other Name'])),
      gender: cleanString(findCellByAliases(row, headerMap, ['Gender', 'Sex'])),
      dateOfBirth: parseDate(findCellByAliases(row, headerMap, ['Date of Birth', 'DOB'])),
      districtOfOrigin: cleanString(findCellByAliases(row, headerMap, ['District of Origin', 'District'])),
      village: cleanString(findCellByAliases(row, headerMap, ['Village'])),
      traditionalAuthority: cleanString(findCellByAliases(row, headerMap, ['Traditional Authority', 'T/A'])),
      nationalId: cleanString(findCellByAliases(row, headerMap, ['National ID', 'ID Number', 'National Id'])),
      nationalIdExpiryDate: parseDate(findCellByAliases(row, headerMap, ['ID Expiry Date', 'National ID Expiry Date'])),
      contactNumber: cleanString(findCellByAliases(row, headerMap, ['Contact Number', 'Phone', 'Phone Number'])),
      dateOfEmployment: parseDate(findCellByAliases(row, headerMap, ['Date of Employment', 'Employment Date'])),
      position: cleanString(findCellByAliases(row, headerMap, ['Position', 'Role'])),
      department: cleanString(findCellByAliases(row, headerMap, ['Department', 'Section'])),
      employmentType: cleanString(findCellByAliases(row, headerMap, ['Employment Type', 'Worker Type'])),
      notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
    });

    const agreedSalaryPerMonth = parseNumber(findCellByAliases(row, headerMap, ['Agreed Salary per Month', 'Monthly Salary', 'Salary', 'Basic Pay', 'Basic Salary']));
    const annualIncrementAmount = parseNumber(findCellByAliases(row, headerMap, ['Annual Increment', 'Increment']));
    const salaryAfterIncrement = parseNumber(findCellByAliases(row, headerMap, ['Salary after Increment', 'Salary After Increment']));

    if (agreedSalaryPerMonth !== null && employeeNo) {
      salaryStructures.push({
        employeeNo,
        agreedSalaryPerMonth,
        annualIncrementAmount: annualIncrementAmount || 0,
        salaryAfterIncrement,
        currency: 'MWK',
        effectiveFrom: parseDate(findCellByAliases(row, headerMap, ['Effective From', 'Start Date'])) || parseDate(findCellByAliases(row, headerMap, ['Date of Employment'])) || new Date(),
        effectiveTo: parseDate(findCellByAliases(row, headerMap, ['Effective To', 'End Date'])),
        isCurrent: true,
      });
    }
  }

  if (!employees.length && !salaryStructures.length) {
    warnings.push(`Biodata sheet detected but no valid rows were parsed from '${sheetName}'`);
  } else if (skippedRows > 0) {
    warnings.push(`Biodata sheet '${sheetName}' skipped ${skippedRows} non-data or incomplete rows during parsing`);
  }

  return { employees, salaryStructures };
}

function parseLoanSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  const headerIndex = findHeaderRowIndex(rows, ['employee', 'loan', 'amount']);

  if (headerIndex < 0) {
    warnings.push(`Sheet '${sheetName}' found but loan headers were not confidently detected`);
    return { loans: [], loanTransactions: [] };
  }

  const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);
  const loans = [];
  const loanTransactions = [];

  for (const row of dataRows) {
    if (shouldSkipSummaryLikeRow(row, headerMap)) continue;

    const employeeNo = parseEmployeeNo(row, headerMap);
    const principalAmount = parseNumber(findCellByAliases(row, headerMap, ['Principal Amount', 'Loan Amount', 'Principal']));
    const balanceAmount = parseNumber(findCellByAliases(row, headerMap, ['Balance Amount', 'Balance']));

    if (!employeeNo || principalAmount === null) continue;

    loans.push({
      employeeNo,
      loanReference: cleanString(findCellByAliases(row, headerMap, ['Loan Reference', 'Loan Ref', 'Reference'])),
      principalAmount,
      balanceAmount: balanceAmount !== null ? balanceAmount : principalAmount,
      monthlyDeductionAmount: parseNumber(findCellByAliases(row, headerMap, ['Monthly Deduction', 'Deduction per Month'])),
      startDate: parseDate(findCellByAliases(row, headerMap, ['Start Date', 'Loan Start Date'])),
      endDate: parseDate(findCellByAliases(row, headerMap, ['End Date', 'Loan End Date'])),
      status: cleanString(findCellByAliases(row, headerMap, ['Status'])) || 'active',
      notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
    });

    const repayment = parseNumber(findCellByAliases(row, headerMap, ['Repayment Amount', 'Amount Paid', 'Paid']));
    if (repayment !== null && repayment > 0) {
      loanTransactions.push({
        loanReference: cleanString(findCellByAliases(row, headerMap, ['Loan Reference', 'Loan Ref', 'Reference'])),
        employeeNo,
        transactionType: 'repayment',
        amount: repayment,
        notes: cleanString(findCellByAliases(row, headerMap, ['Payment Notes', 'Notes'])),
      });
    }
  }

  if (!loans.length && !loanTransactions.length) {
    warnings.push(`Loan sheet detected but no valid rows were parsed from '${sheetName}'`);
  }

  return { loans, loanTransactions };
}

function parseTerminationSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  const headerIndex = findHeaderRowIndex(rows, ['employee', 'termination', 'reason']);

  if (headerIndex < 0) {
    warnings.push(`Sheet '${sheetName}' found but termination headers were not confidently detected`);
    return { terminations: [] };
  }

  const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);
  const terminations = [];

  for (const row of dataRows) {
    if (shouldSkipSummaryLikeRow(row, headerMap)) continue;

    const employeeNo = parseEmployeeNo(row, headerMap);
    const terminationDate = parseDate(findCellByAliases(row, headerMap, ['Termination Date', 'Date']));

    if (!employeeNo || !terminationDate) continue;

    terminations.push({
      employeeNo,
      terminationDate,
      reason: cleanString(findCellByAliases(row, headerMap, ['Reason', 'Termination Reason'])),
      daysWorkedInFinalMonth: parseNumber(findCellByAliases(row, headerMap, ['Days Worked in Final Month', 'Days Worked'])),
      halfPayReceived: parseNumber(findCellByAliases(row, headerMap, ['Half Pay Received', 'Half Pay'])),
      settlementAmount: parseNumber(findCellByAliases(row, headerMap, ['Settlement Amount', 'Settlement'])),
      notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
    });
  }

  if (!terminations.length) {
    warnings.push(`Terminations sheet detected but no valid rows were parsed from '${sheetName}'`);
  }

  return { terminations };
}

function parseReengagementSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  const headerIndex = findHeaderRowIndex(rows, ['employee', 'effective', 'wage']);

  if (headerIndex < 0) {
    warnings.push(`Sheet '${sheetName}' found but reengagement headers were not confidently detected`);
    return { reengagements: [] };
  }

  const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);
  const reengagements = [];

  for (const row of dataRows) {
    if (shouldSkipSummaryLikeRow(row, headerMap)) continue;

    const employeeNo = parseEmployeeNo(row, headerMap);
    const effectiveDate = parseDate(findCellByAliases(row, headerMap, ['Effective Date', 'Date']));

    if (!employeeNo || !effectiveDate) continue;

    reengagements.push({
      employeeNo,
      previousWage: parseNumber(findCellByAliases(row, headerMap, ['Previous Wage', 'Old Wage'])),
      reengagementWage: parseNumber(findCellByAliases(row, headerMap, ['Reengagement Wage', 'New Wage'])),
      occupation: cleanString(findCellByAliases(row, headerMap, ['Occupation', 'Position'])),
      effectiveDate,
      contractExpiryDate: parseDate(findCellByAliases(row, headerMap, ['Contract Expiry Date', 'Expiry Date'])),
      notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
    });
  }

  if (!reengagements.length) {
    warnings.push(`Reengagement sheet detected but no valid rows were parsed from '${sheetName}'`);
  }

  return { reengagements };
}

function parsePayrollLikeSheets(workbook, sheetNames, warnings) {
  const payrollPeriods = [];
  const payrollEntries = [];

  sheetNames.forEach((sheetName) => {
    const rows = getSheetRows(workbook, sheetName);
    const headerIndex = findHeaderRowIndex(rows, ['employee', 'net', 'gross']);

    if (headerIndex < 0) {
      warnings.push(`Sheet '${sheetName}' detected but skipped for payroll entries due to low-confidence mapping`);
      return;
    }

    const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);

    const periodDescription = sheetName;
    const payrollMode = normalizeToken(sheetName).includes('mid') ? 'mid_month' : 'full_month';

    payrollPeriods.push({
      reportingPeriodId: null,
      payrollMode,
      description: periodDescription,
      status: 'imported',
      createdBy: 'excel-import',
    });

    dataRows.forEach((row) => {
      if (shouldSkipSummaryLikeRow(row, headerMap)) return;

      const employeeNo = parseEmployeeNo(row, headerMap);
      if (!employeeNo) return;

      payrollEntries.push({
        sourceSheet: sheetName,
        periodDescription,
        payrollMode,
        employeeNo,
        basicSalary: parseNumber(findCellByAliases(row, headerMap, ['Basic Salary', 'Salary'])) || 0,
        incrementAmount: parseNumber(findCellByAliases(row, headerMap, ['Increment Amount', 'Increment'])) || 0,
        grossPay: parseNumber(findCellByAliases(row, headerMap, ['Gross Pay', 'Gross'])) || 0,
        totalDeductions: parseNumber(findCellByAliases(row, headerMap, ['Total Deductions', 'Deductions'])) || 0,
        netPay: parseNumber(findCellByAliases(row, headerMap, ['Net Pay', 'Net'])) || 0,
        daysWorked: parseNumber(findCellByAliases(row, headerMap, ['Days Worked'])),
        daysAbsent: parseNumber(findCellByAliases(row, headerMap, ['Days Absent'])),
        overtimeHours: parseNumber(findCellByAliases(row, headerMap, ['Overtime Hours'])),
        overtimeAmount: parseNumber(findCellByAliases(row, headerMap, ['Overtime Amount'])),
        loanDeductionAmount: parseNumber(findCellByAliases(row, headerMap, ['Loan Deduction', 'Loan Deduction Amount'])),
        otherDeductionAmount: parseNumber(findCellByAliases(row, headerMap, ['Other Deduction', 'Other Deductions'])),
        bonusAmount: parseNumber(findCellByAliases(row, headerMap, ['Bonus', 'Bonus Amount'])),
        giftAmount: parseNumber(findCellByAliases(row, headerMap, ['Gift', 'Gift Amount'])),
        leavePayAmount: parseNumber(findCellByAliases(row, headerMap, ['Leave Pay', 'Leave Pay Amount'])),
        payeAmount: parseNumber(findCellByAliases(row, headerMap, ['PAYE', 'PAYE Amount'])),
        notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
      });
    });

    const entriesFromSheet = payrollEntries.filter((entry) => entry.sourceSheet === sheetName).length;
    if (!entriesFromSheet) {
      warnings.push(`Payroll sheet '${sheetName}' detected but no valid payroll rows were parsed`);
    }
  });

  return { payrollPeriods, payrollEntries };
}

function parsePayrollWorkbook(workbook) {
  const warnings = [];
  const errors = [];
  const detectedSheets = [];

  const sheetNames = workbook.SheetNames || [];

  const biodataSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.biodata);
  const loanSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.loanSchedule);
  const terminationsSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.terminations);
  const reengagementSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.reengagements);

  const payrollLikeSheets = sheetNames.filter((sheetName) => {
    const normalized = normalizeToken(sheetName);
    return SHEET_ALIASES.payrollLike.some((alias) => {
      const token = normalizeToken(alias);
      return normalized === token || normalized.includes(token) || token.includes(normalized);
    });
  });

  const parsed = {
    employees: [],
    salaryStructures: [],
    payrollPeriods: [],
    payrollEntries: [],
    loans: [],
    loanTransactions: [],
    terminations: [],
    reengagements: [],
  };

  if (biodataSheet) {
    try {
      detectedSheets.push(biodataSheet);
      const result = parseBiodataSheet(workbook, biodataSheet, warnings);
      parsed.employees.push(...result.employees);
      parsed.salaryStructures.push(...result.salaryStructures);
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parseBiodataSheet';
      err.sheet = biodataSheet;
      err.detectedSheets = detectedSheets;
      throw err;
    }
  }

  if (loanSheet) {
    try {
      detectedSheets.push(loanSheet);
      const result = parseLoanSheet(workbook, loanSheet, warnings);
      parsed.loans.push(...result.loans);
      parsed.loanTransactions.push(...result.loanTransactions);
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parseLoanSheet';
      err.sheet = loanSheet;
      err.detectedSheets = detectedSheets;
      throw err;
    }
  }

  if (terminationsSheet) {
    try {
      detectedSheets.push(terminationsSheet);
      const result = parseTerminationSheet(workbook, terminationsSheet, warnings);
      parsed.terminations.push(...result.terminations);
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parseTerminationSheet';
      err.sheet = terminationsSheet;
      err.detectedSheets = detectedSheets;
      throw err;
    }
  }

  if (reengagementSheet) {
    try {
      detectedSheets.push(reengagementSheet);
      const result = parseReengagementSheet(workbook, reengagementSheet, warnings);
      parsed.reengagements.push(...result.reengagements);
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parseReengagementSheet';
      err.sheet = reengagementSheet;
      err.detectedSheets = detectedSheets;
      throw err;
    }
  }

  if (payrollLikeSheets.length) {
    try {
      detectedSheets.push(...payrollLikeSheets);
      const result = parsePayrollLikeSheets(workbook, payrollLikeSheets, warnings);
      parsed.payrollPeriods.push(...result.payrollPeriods);
      parsed.payrollEntries.push(...result.payrollEntries);
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parsePayrollLikeSheets';
      err.sheet = payrollLikeSheets.join(', ');
      err.detectedSheets = detectedSheets;
      throw err;
    }
  }

  if (!detectedSheets.length) {
    warnings.push('No recognized payroll workbook sheets were found. Confirm workbook type and sheet names.');
  }

  return {
    workbookType: 'payroll',
    detectedSheets,
    parsed,
    summary: summarizeParsedData(parsed),
    warnings,
    errors,
  };
}

module.exports = {
  parsePayrollWorkbook,
};
