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

function parseEmployeeName(row, headerMap) {
  return cleanString(findCellByAliases(row, headerMap, [
    'Name of Employee',
    'Employee Name',
    'Full Name',
    'Name',
    'Names',
  ]));
}

function cleanEmployeeNameCandidate(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const stripped = raw.replace(/^\d+\s*/g, '').replace(/^[-:\.\)\(\s]+|[-:\.\)\(\s]+$/g, '').trim();
  if (!stripped) return null;
  if (/^(vacant|subtotal|sub-total|total|nil|none)$/i.test(stripped)) return null;
  if (/^(nyambadwe and domasi residence|citi-nati supermarkets.*|wages for residences.*)$/i.test(stripped)) return null;
  if (!/[a-z]/i.test(stripped)) return null;
  return stripped;
}

function inferEmployeeNameFromRow(row, headerMap) {
  const explicit = cleanEmployeeNameCandidate(parseEmployeeName(row, headerMap));
  if (explicit) return explicit;

  for (const cell of row || []) {
    const candidate = cleanEmployeeNameCandidate(cell);
    if (!candidate) continue;

    const asNumber = parseAmountSafe(candidate);
    if (asNumber !== null) continue;
    return candidate;
  }

  return null;
}

function parseAmountSafe(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '-' || /^nil$/i.test(text) || /^none$/i.test(text) || /^not applicable$/i.test(text) || /^vacant$/i.test(text)) {
    return null;
  }
  return parseNumber(text);
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

function findLabelValueInWindow(rows, startIndex, endIndex, labelAliases = []) {
  const start = Math.max(0, startIndex);
  const end = Math.min(rows.length - 1, endIndex);

  for (let i = start; i <= end; i += 1) {
    const row = rows[i] || [];
    for (let c = 0; c < row.length; c += 1) {
      const cellValue = cleanString(row[c]);
      if (!cellValue) continue;
      const token = normalizeToken(cellValue);

      const hit = labelAliases.some((alias) => {
        const aliasToken = normalizeToken(alias);
        return token === aliasToken || token.includes(aliasToken) || aliasToken.includes(token);
      });

      if (!hit) continue;

      for (let next = c + 1; next < row.length; next += 1) {
        const candidate = cleanString(row[next]);
        if (candidate) return candidate;
      }

      if (i + 1 <= end) {
        const downRow = rows[i + 1] || [];
        for (let next = c; next < downRow.length; next += 1) {
          const candidate = cleanString(downRow[next]);
          if (candidate) return candidate;
        }
      }
    }
  }

  return null;
}

function hasActionableLoanLikeRows(dataRows, headerMap) {
  return (dataRows || []).some((row) => {
    const employeeNo = parseEmployeeNo(row, headerMap);
    const employeeName = inferEmployeeNameFromRow(row, headerMap);
    const principalAmount = parseAmountSafe(findCellByAliases(row, headerMap, ['Principal Amount', 'Loan Amount', 'Principal']));
    const balanceAmount = parseAmountSafe(findCellByAliases(row, headerMap, ['Balance Amount', 'Balance']));
    const repayment = parseAmountSafe(findCellByAliases(row, headerMap, ['Repayment Amount', 'Amount Paid', 'Paid']));

    const hasIdentity = Boolean(employeeNo || employeeName);
    const hasMoney = [principalAmount, balanceAmount, repayment].some((v) => v !== null && v > 0);
    return hasIdentity && hasMoney;
  });
}

function hasActionableTerminationBlocks(rows) {
  const allRows = rows || [];
  for (let i = 0; i < allRows.length; i += 1) {
    const rowText = normalizeToken((allRows[i] || []).map((cell) => cleanString(cell) || '').join(' '));
    if (!rowText.includes('employee resignation') && !rowText.includes('dismissal')) continue;

    const employeeName = cleanString(findLabelValueInWindow(allRows, i, i + 12, ['Name of Employee', 'Employee Name']));
    if (!employeeName) continue;
    if (/^employee does not exist$/i.test(employeeName)) continue;
    if (/^vacant$/i.test(employeeName)) continue;
    return true;
  }

  return false;
}

function parseBiodataSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  const headerIndex = findHeaderRowIndex(rows, ['employee no', 'first name', 'surname']);

  if (headerIndex < 0) {
    const topTokens = rows
      .slice(0, 30)
      .map((r) => normalizeToken((r || []).join(' ')))
      .join(' ');
    if (topTokens.includes('biodata') || topTokens.includes('employee no') || topTokens.includes('first name')) {
      warnings.push(`Sheet '${sheetName}' found but biodata headers were not confidently detected`);
    }
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
    const rawName = parseEmployeeName(row, headerMap);

    if (rawName && /^vacant$/i.test(rawName)) {
      skippedRows += 1;
      continue;
    }

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
    const topTokens = rows
      .slice(0, 50)
      .map((r) => normalizeToken((r || []).join(' ')))
      .join(' ');
    const looksLikeLoanData = topTokens.includes('loan') && (topTokens.includes('employee') || topTokens.includes('amount') || topTokens.includes('balance'));
    if (looksLikeLoanData) {
      warnings.push(`Sheet '${sheetName}' found but loan headers were not confidently detected`);
    }
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

  if (!loans.length && !loanTransactions.length && hasActionableLoanLikeRows(dataRows, headerMap)) {
    warnings.push(`Loan sheet detected but no valid rows were parsed from '${sheetName}'`);
  }

  return { loans, loanTransactions };
}

function parseTerminationSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  const headerIndex = findHeaderRowIndex(rows, ['employee', 'termination', 'reason']);

  function parseTerminationFormBlocks() {
    const terminations = [];
    for (let i = 0; i < rows.length; i += 1) {
      const rowText = normalizeToken((rows[i] || []).map((cell) => cleanString(cell) || '').join(' '));
      if (!rowText.includes('employee resignation') && !rowText.includes('dismissal')) continue;

      const employeeName = findLabelValueInWindow(rows, i, i + 12, ['Name of Employee', 'Employee Name']);
      const terminationDateRaw = findLabelValueInWindow(rows, i, i + 20, ['Date Contract Terminated', 'Termination Date']);
      const settlementRaw = findLabelValueInWindow(rows, i, i + 28, ['Total Gross Amount Due at End of Contract', 'Total Net Amount Due at End of Contract']);
      const daysWorkedRaw = findLabelValueInWindow(rows, i, i + 24, ['Number of days worked during month of resignation/dismissal', 'Days Worked in Final Month']);
      const halfPayRaw = findLabelValueInWindow(rows, i, i + 20, ['Payslip for end of Contract', 'Half Pay Received']);

      const normalizedName = cleanString(employeeName);
      if (!normalizedName || /^employee does not exist$/i.test(normalizedName)) {
        continue;
      }

      terminations.push({
        employeeNo: null,
        employeeName: normalizedName,
        terminationDate: parseDate(terminationDateRaw),
        reason: 'resignation/dismissal',
        daysWorkedInFinalMonth: parseAmountSafe(daysWorkedRaw),
        halfPayReceived: parseAmountSafe(halfPayRaw),
        settlementAmount: parseAmountSafe(settlementRaw),
        notes: `Imported from form layout row ${i + 1}`,
      });
    }

    return terminations;
  }

  if (headerIndex >= 0) {
    const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);
    const terminations = [];

    for (const row of dataRows) {
      if (shouldSkipSummaryLikeRow(row, headerMap)) continue;

      const employeeNo = parseEmployeeNo(row, headerMap);
      const employeeName = parseEmployeeName(row, headerMap);
      const terminationDate = parseDate(findCellByAliases(row, headerMap, ['Termination Date', 'Date', 'Date Contract Terminated']));

      if ((!employeeNo && !employeeName) || !terminationDate) continue;

      terminations.push({
        employeeNo,
        employeeName,
        terminationDate,
        reason: cleanString(findCellByAliases(row, headerMap, ['Reason', 'Termination Reason', 'Resignation', 'Dismissal'])),
        daysWorkedInFinalMonth: parseAmountSafe(findCellByAliases(row, headerMap, ['Days Worked in Final Month', 'Days Worked', 'Number of days worked during month of resignation/dismissal'])),
        halfPayReceived: parseAmountSafe(findCellByAliases(row, headerMap, ['Half Pay Received', 'Half Pay', 'Payslip for end of Contract'])),
        settlementAmount: parseAmountSafe(findCellByAliases(row, headerMap, ['Settlement Amount', 'Settlement', 'Total Gross Amount Due at End of Contract', 'Total Net Amount Due at End of Contract'])),
        notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
      });
    }

    if (!terminations.length) {
      terminations.push(...parseTerminationFormBlocks());
    }

    if (!terminations.length && hasActionableTerminationBlocks(rows)) {
      warnings.push(`Terminations sheet detected but no valid rows were parsed from '${sheetName}'`);
    }

    return { terminations };
  }

  // Fallback for form-style layout where labels and values are vertically arranged.
  const terminations = parseTerminationFormBlocks();

  if (!terminations.length && hasActionableTerminationBlocks(rows)) {
    warnings.push(`Sheet '${sheetName}' found but termination data rows were not detected in table or form layout`);
  }

  return { terminations };
}

function parseReengagementSheet(workbook, sheetName, warnings) {
  const rows = getSheetRows(workbook, sheetName);
  const headerIndex = findHeaderRowIndex(rows, ['employee', 'effective', 'wage', 'occupation', 'date employed']);

  const reengagements = [];

  if (headerIndex >= 0) {
    const { headerMap, dataRows } = buildRowObjectsFromSheet(workbook, sheetName, headerIndex);

    for (const row of dataRows) {
      if (shouldSkipSummaryLikeRow(row, headerMap)) continue;

      const employeeNo = parseEmployeeNo(row, headerMap);
      const employeeName = inferEmployeeNameFromRow(row, headerMap);
      const effectiveDate = parseDate(findCellByAliases(row, headerMap, ['Effective Date', 'Date', 'Date Employed']));

      if ((!employeeNo && !employeeName) || !effectiveDate) continue;
      if (employeeName && /^vacant$/i.test(employeeName)) continue;

      reengagements.push({
        employeeNo,
        employeeName,
        previousWage: parseAmountSafe(findCellByAliases(row, headerMap, ['Previous Wage', 'Old Wage', 'Wages as at 30/09/25'])),
        reengagementWage: parseAmountSafe(findCellByAliases(row, headerMap, ['Reengagement Wage', 'New Wage', 'New Wage from 1/10/25', 'Wages on retrenchment'])),
        occupation: cleanString(findCellByAliases(row, headerMap, ['Occupation', 'Position'])),
        effectiveDate,
        contractExpiryDate: parseDate(findCellByAliases(row, headerMap, ['Contract Expiry Date', 'Expiry Date', 'Expiry of Contract'])),
        notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
      });
    }
  }

  if (!reengagements.length) {
    // Fallback for form/key-value layout blocks.
    for (let i = 0; i < rows.length; i += 1) {
      const rowText = normalizeToken((rows[i] || []).map((cell) => cleanString(cell) || '').join(' '));
      if (!rowText.includes('name of employee') && !rowText.includes('employee name')) continue;

      const employeeName = cleanEmployeeNameCandidate(findLabelValueInWindow(rows, i, i + 4, ['Name of Employee', 'Employee Name']));
      if (!employeeName) continue;

      const employeeNo = findLabelValueInWindow(rows, i, i + 5, ['Employee Number', 'Employee No', 'Staff No', 'ID']);
      const previousWage = findLabelValueInWindow(rows, i, i + 18, ['Previous Wage', 'Old Wage', 'Wages as at']);
      const newWage = findLabelValueInWindow(rows, i, i + 18, ['Reengagement Wage', 'New Wage', 'New Wage from', 'Wages on retrenchment']);
      const occupation = findLabelValueInWindow(rows, i, i + 10, ['Occupation', 'Position']);
      const dateEmployed = findLabelValueInWindow(rows, i, i + 10, ['Date Employed', 'Effective Date', 'Date']);
      const expiryDate = findLabelValueInWindow(rows, i, i + 14, ['Expiry of Contract', 'Contract Expiry Date', 'Expiry Date']);

      const effectiveDate = parseDate(dateEmployed);
      if (!effectiveDate) continue;

      reengagements.push({
        employeeNo: cleanString(employeeNo),
        employeeName,
        previousWage: parseAmountSafe(previousWage),
        reengagementWage: parseAmountSafe(newWage),
        occupation: cleanString(occupation),
        effectiveDate,
        contractExpiryDate: parseDate(expiryDate),
        notes: `Imported from reengagement form layout row ${i + 1}`,
      });

      i += 4;
    }
  }

  if (!reengagements.length) {
    const topTokens = rows
      .slice(0, 40)
      .map((r) => normalizeToken((r || []).join(' ')))
      .join(' ');
    if (topTokens.includes('reengagement') || topTokens.includes('new wage') || topTokens.includes('wages on retrenchment')) {
      warnings.push(`Reengagement sheet detected but no valid rows were parsed from '${sheetName}'`);
    }
  }

  return { reengagements };
}

function parsePayrollLikeSheets(workbook, sheetNames, warnings) {
  const payrollPeriods = [];
  const payrollEntries = [];
  const discoveredEmployees = [];
  const discoveredSalaryStructures = [];

  const employeeIdentityMap = new Map();

  function rememberEmployeeIdentity(entry) {
    const key = entry.employeeNo || normalizeToken(entry.employeeName || '');
    if (!key) return;
    if (employeeIdentityMap.has(key)) return;

    const employeeName = cleanString(entry.employeeName);
    if (!employeeName || /^vacant$/i.test(employeeName)) return;

    const split = splitFullName(employeeName);
    const employee = {
      employeeNo: entry.employeeNo || null,
      firstName: split.firstName || 'Unknown',
      surname: split.surname || 'Unknown',
      employmentType: 'imported',
      status: 'active',
      notes: 'Derived from payroll sheets where biodata records were unavailable',
    };

    discoveredEmployees.push(employee);
    employeeIdentityMap.set(key, true);

    const monthlySalary = parseAmountSafe(entry.basicSalary) ?? parseAmountSafe(entry.grossPay) ?? parseAmountSafe(entry.netPay);
    if (entry.employeeNo && monthlySalary !== null) {
      discoveredSalaryStructures.push({
        employeeNo: entry.employeeNo,
        agreedSalaryPerMonth: monthlySalary,
        annualIncrementAmount: 0,
        salaryAfterIncrement: monthlySalary,
        currency: 'MWK',
        effectiveFrom: new Date(),
        effectiveTo: null,
        isCurrent: true,
      });
    }
  }

  function pushPayrollEntry(sheetName, payrollMode, periodDescription, entry) {
    const employeeNo = cleanString(entry.employeeNo || null);
    const employeeName = cleanString(entry.employeeName || null);
    if (!employeeNo && !employeeName) return;
    if (employeeName && /^vacant$/i.test(employeeName)) return;

    const normalizedEntry = {
      sourceSheet: sheetName,
      periodDescription,
      payrollMode,
      employeeNo,
      employeeName,
      basicSalary: parseAmountSafe(entry.basicSalary) || 0,
      incrementAmount: parseAmountSafe(entry.incrementAmount) || 0,
      grossPay: parseAmountSafe(entry.grossPay) || 0,
      totalDeductions: parseAmountSafe(entry.totalDeductions) || 0,
      netPay: parseAmountSafe(entry.netPay) || 0,
      daysWorked: parseAmountSafe(entry.daysWorked),
      daysAbsent: parseAmountSafe(entry.daysAbsent),
      overtimeHours: parseAmountSafe(entry.overtimeHours),
      overtimeAmount: parseAmountSafe(entry.overtimeAmount),
      loanDeductionAmount: parseAmountSafe(entry.loanDeductionAmount),
      otherDeductionAmount: parseAmountSafe(entry.otherDeductionAmount),
      bonusAmount: parseAmountSafe(entry.bonusAmount),
      giftAmount: parseAmountSafe(entry.giftAmount),
      leavePayAmount: parseAmountSafe(entry.leavePayAmount),
      payeAmount: parseAmountSafe(entry.payeAmount),
      notes: entry.notes || null,
    };

    payrollEntries.push(normalizedEntry);
    rememberEmployeeIdentity(normalizedEntry);
  }

  sheetNames.forEach((sheetName) => {
    const rows = getSheetRows(workbook, sheetName);
    const headerIndex = findHeaderRowIndex(rows, ['employee', 'name', 'gross', 'net', 'count', 'amount due']);

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
      const employeeName = inferEmployeeNameFromRow(row, headerMap);
      const grossCandidate = findCellByAliases(row, headerMap, ['Gross Salary', 'Gross Pay', 'Gross', 'Amount Due', 'Salary', 'Wages on retrenchment']);
      const netCandidate = findCellByAliases(row, headerMap, ['Net Pay', 'Net', 'Net Pay for the Month', 'Net Pay mid and end of Month']);

      pushPayrollEntry(sheetName, payrollMode, periodDescription, {
        employeeNo,
        employeeName,
        basicSalary: findCellByAliases(row, headerMap, ['Basic Salary', 'Salary', 'Gross Salary', 'Amount Due']),
        incrementAmount: findCellByAliases(row, headerMap, ['Increment Amount', 'Increment']),
        grossPay: grossCandidate,
        totalDeductions: findCellByAliases(row, headerMap, ['Total Deductions', 'Deductions']),
        netPay: netCandidate || grossCandidate,
        daysWorked: findCellByAliases(row, headerMap, ['Days Worked']),
        daysAbsent: findCellByAliases(row, headerMap, ['Days Absent']),
        overtimeHours: findCellByAliases(row, headerMap, ['Overtime Hours']),
        overtimeAmount: findCellByAliases(row, headerMap, ['Overtime Amount', 'Overtime Claim']),
        loanDeductionAmount: findCellByAliases(row, headerMap, ['Loan Deduction', 'Loan Instalment', 'Loan Deduction Amount']),
        otherDeductionAmount: findCellByAliases(row, headerMap, ['Other Deduction', 'Other Deductions', 'Absence Deduction']),
        bonusAmount: findCellByAliases(row, headerMap, ['Bonus', 'Bonus Amount']),
        giftAmount: findCellByAliases(row, headerMap, ['Gift', 'Gift Amount', 'Xmas Gift/Leave Pay']),
        leavePayAmount: findCellByAliases(row, headerMap, ['Leave Pay', 'Leave Pay Amount']),
        payeAmount: findCellByAliases(row, headerMap, ['PAYE', 'P.A.Y.E', 'PAYE Amount']),
        notes: cleanString(findCellByAliases(row, headerMap, ['Notes', 'Comment'])),
      });
    });

    // Fallback for card-style sheets (Wages / Res-Workers style) where values are label-value blocks.
    for (let i = 0; i < rows.length; i += 1) {
      const rowText = normalizeToken((rows[i] || []).map((cell) => cleanString(cell) || '').join(' '));
      if (!rowText.includes('name of employee')) continue;

      const employeeName = cleanEmployeeNameCandidate(findLabelValueInWindow(rows, i, i + 3, ['Name of Employee', 'Employee Name']));
      if (!employeeName || /^vacant$/i.test(employeeName)) continue;

      const employeeNo = findLabelValueInWindow(rows, i, i + 4, ['Employee Number', 'Employee No', 'Staff No', 'ID']);
      const grossSalary = findLabelValueInWindow(rows, i, i + 18, ['Gross Salary', 'Amount Due', 'Wages on retrenchment']);
      const netSalary = findLabelValueInWindow(rows, i, i + 18, ['Net Pay for the Month', 'Net Pay mid and end of Month']);
      const loanInstalment = findLabelValueInWindow(rows, i, i + 18, ['Loan Instalment', 'Loan Deduction']);
      const absenceDeduction = findLabelValueInWindow(rows, i, i + 18, ['Absence Deduction']);
      const paye = findLabelValueInWindow(rows, i, i + 18, ['P.A.Y.E', 'PAYE']);

      pushPayrollEntry(sheetName, payrollMode, periodDescription, {
        employeeNo,
        employeeName,
        basicSalary: grossSalary,
        grossPay: grossSalary,
        netPay: netSalary || grossSalary,
        loanDeductionAmount: loanInstalment,
        otherDeductionAmount: absenceDeduction,
        payeAmount: paye,
        notes: `Imported from card layout block row ${i + 1}`,
      });

      i += 8;
    }

    const entriesFromSheet = payrollEntries.filter((entry) => entry.sourceSheet === sheetName).length;
    if (!entriesFromSheet) {
      warnings.push(`Payroll sheet '${sheetName}' detected but no valid payroll rows were parsed`);
    }
  });

  return { payrollPeriods, payrollEntries, discoveredEmployees, discoveredSalaryStructures };
}

function parsePayrollWorkbook(workbook) {
  let warnings = [];
  const errors = [];
  const detectedSheets = [];

  const sheetNames = workbook.SheetNames || [];

  const biodataSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.biodata);
  const loanSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.loanSchedule);
  const terminationsSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.terminations);
  const reengagementSheet = detectSheetByAliases(sheetNames, SHEET_ALIASES.reengagements);
  const reengagementSheets = [...new Set([
    reengagementSheet,
    ...sheetNames.filter((name) => normalizeToken(name).includes('reengagement')),
  ].filter(Boolean))];

  const payrollLikeSheets = sheetNames.filter((sheetName) => {
    const normalized = normalizeToken(sheetName);
    if (normalized.includes('reengagement')) return false;
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

  if (reengagementSheets.length) {
    try {
      detectedSheets.push(...reengagementSheets);
      reengagementSheets.forEach((sheet) => {
        const result = parseReengagementSheet(workbook, sheet, warnings);
        parsed.reengagements.push(...result.reengagements);
      });
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parseReengagementSheet';
      err.sheet = reengagementSheets.join(', ');
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
      parsed.employees.push(...(result.discoveredEmployees || []));
      parsed.salaryStructures.push(...(result.discoveredSalaryStructures || []));
    } catch (err) {
      err.stage = 'parsing';
      err.parser = 'parsePayrollLikeSheets';
      err.sheet = payrollLikeSheets.join(', ');
      err.detectedSheets = detectedSheets;
      throw err;
    }
  }

  if (parsed.employees.length) {
    const seen = new Set();
    parsed.employees = parsed.employees.filter((row) => {
      const key = row.employeeNo || `${normalizeToken(row.firstName)}|${normalizeToken(row.surname)}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (parsed.salaryStructures.length) {
    const seen = new Set();
    parsed.salaryStructures = parsed.salaryStructures.filter((row) => {
      const key = `${row.employeeNo || ''}|${String(row.agreedSalaryPerMonth || '')}`;
      if (!row.employeeNo || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  let duplicatePayrollEntriesRemoved = 0;
  if (parsed.payrollEntries.length) {
    const seen = new Set();
    parsed.payrollEntries = parsed.payrollEntries.filter((row) => {
      const key = [
        row.sourceSheet || '',
        row.periodDescription || '',
        row.employeeNo || normalizeToken(row.employeeName || ''),
        String(row.grossPay || 0),
        String(row.netPay || 0),
      ].join('|');

      if (seen.has(key)) {
        duplicatePayrollEntriesRemoved += 1;
        return false;
      }

      seen.add(key);
      return true;
    });

    if (duplicatePayrollEntriesRemoved > 0) {
      warnings.push(`Deduplicated ${duplicatePayrollEntriesRemoved} duplicate payroll entries from repeated sheet rows`);
    }
  }

  if (parsed.employees.length) {
    warnings = warnings.filter((w) => !w.includes('Biodata sheet detected but no valid rows were parsed'));
  }

  if (parsed.terminations.length) {
    warnings = warnings.filter((w) => !w.includes('Terminations sheet detected but no valid rows were parsed'));
    warnings = warnings.filter((w) => !w.includes('termination data rows were not detected'));
  }

  if (!detectedSheets.length) {
    warnings.push('No recognized payroll workbook sheets were found. Confirm workbook type and sheet names.');
  }

  const summary = summarizeParsedData(parsed);
  const parsedTotal = Object.values(summary).reduce((sum, value) => sum + Number(value || 0), 0);
  const penalty = (warnings.length * 4) + (errors.length * 15);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const confidence = {
    score,
    level: score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low',
    summary: `Detected ${parsedTotal} total parsed records across ${detectedSheets.length} sheets`,
    duplicatePayrollEntriesRemoved,
  };

  return {
    workbookType: 'payroll',
    detectedSheets,
    parsed,
    summary,
    confidence,
    warnings,
    errors,
  };
}

module.exports = {
  parsePayrollWorkbook,
};
