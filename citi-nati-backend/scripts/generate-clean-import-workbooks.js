'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { parseBusinessWorkbook } = require('../src/services/business-operations/parsers/businessWorkbook.parser');
const { parsePayrollWorkbook } = require('../src/services/business-operations/parsers/payrollWorkbook.parser');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'clean-import-workbooks');

const SALES_SOURCE = path.join(ROOT_DIR, 'Sales report for 2025.xlsx');
const PAYROLL_SOURCE = path.join(ROOT_DIR, 'Citi-Nati PayRoll-2026v1.xlsx');

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ');
}

function shouldSkipSyntheticEmployee(row) {
  const name = normalizeToken(row?.employeeName || `${row?.firstName || ''} ${row?.surname || ''}`);
  if (!name) return true;
  if (name === 'count' || name === 'total' || name === 'subtotal') return true;
  if (name.includes('wages for ') || name.includes('citi nati supermarket')) return true;
  return false;
}

function writeWorkbook(filePath, sheets) {
  const workbook = XLSX.utils.book_new();

  for (const [sheetName, rows] of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  XLSX.writeFile(workbook, filePath);
}

function generateBusinessCleanWorkbook() {
  const workbook = XLSX.readFile(SALES_SOURCE, { cellDates: true });
  const parsed = parseBusinessWorkbook(workbook).parsed;

  const categoryByCode = new Map(
    (parsed.expenseCategories || []).map((category) => [category.code, category.name])
  );

  const supplierMoneyByKey = new Map();
  for (const transaction of parsed.supplierTransactions || []) {
    const key = transaction.supplierCode || transaction.supplierName;
    if (!key) continue;

    const current = supplierMoneyByKey.get(key) || { debtAmount: 0, amountPaid: 0 };
    if (transaction.transactionType === 'debt') current.debtAmount += Number(transaction.amount || 0);
    if (transaction.transactionType === 'payment') current.amountPaid += Number(transaction.amount || 0);
    supplierMoneyByKey.set(key, current);
  }

  const suppliersRows = (parsed.suppliers || []).map((supplier) => {
    const key = supplier.supplierCode || supplier.name;
    const totals = supplierMoneyByKey.get(key) || { debtAmount: 0, amountPaid: 0 };

    return {
      'Supplier Code': cleanText(supplier.supplierCode) || null,
      'Supplier Name': cleanText(supplier.name),
      'Opening Balance': Number(supplier.openingBalance || 0),
      'Debt Amount': Number(totals.debtAmount || 0),
      'Amount Paid': Number(totals.amountPaid || 0),
      Status: cleanText(supplier.status) || 'active',
      Notes: cleanText(supplier.notes) || null,
    };
  });

  const expensesRows = (parsed.expenses || []).map((expense) => ({
    Category: categoryByCode.get(expense.categoryCode) || expense.categoryCode || 'Other Operating Expenses',
    Amount: Number(expense.amount || 0),
    Date: expense.expenseDate ? new Date(expense.expenseDate) : new Date(),
    Description: cleanText(expense.description) || null,
    'Payment Method': cleanText(expense.paymentMethod) || 'other',
    Reference: cleanText(expense.referenceNo) || null,
  }));

  const outputPath = path.join(OUTPUT_DIR, 'Business_Workbook_Clean_2025.xlsx');
  writeWorkbook(outputPath, [
    ['Suppliers Report', suppliersRows],
    ['Expenses Report', expensesRows],
  ]);

  return {
    outputPath,
    suppliers: suppliersRows.length,
    expenses: expensesRows.length,
  };
}

function generatePayrollCleanWorkbook() {
  const workbook = XLSX.readFile(PAYROLL_SOURCE, { cellDates: true });
  const parsed = parsePayrollWorkbook(workbook).parsed;

  const salaryByEmployeeNo = new Map();
  for (const salary of parsed.salaryStructures || []) {
    if (!salary.employeeNo) continue;
    if (!salaryByEmployeeNo.has(salary.employeeNo)) {
      salaryByEmployeeNo.set(salary.employeeNo, salary);
    }
  }

  const biodataRows = (parsed.employees || [])
    .filter((employee) => !shouldSkipSyntheticEmployee(employee))
    .map((employee) => {
      const salary = salaryByEmployeeNo.get(employee.employeeNo);
      return {
        'Employee No': cleanText(employee.employeeNo),
        'First Name': cleanText(employee.firstName) || 'Unknown',
        Surname: cleanText(employee.surname) || 'Unknown',
        'Date of Employment': employee.dateOfEmployment ? new Date(employee.dateOfEmployment) : null,
        Position: cleanText(employee.position) || null,
        'Employment Type': cleanText(employee.employmentType) || 'imported',
        'Agreed Salary per Month': salary ? Number(salary.agreedSalaryPerMonth || 0) : null,
      };
    })
    .filter((row) => row['First Name'] && row.Surname);

  const seenPayrollRows = new Set();
  const payrollRows = (parsed.payrollEntries || [])
    .filter((entry) => !shouldSkipSyntheticEmployee(entry))
    .filter((entry) => Number(entry.grossPay || 0) > 0 || Number(entry.netPay || 0) > 0)
    .map((entry) => ({
      'Employee No': cleanText(entry.employeeNo) || null,
      'Name of Employee': cleanText(entry.employeeName) || null,
      'Basic Salary': Number(entry.basicSalary || 0),
      'Gross Pay': Number(entry.grossPay || 0),
      'Total Deductions': Number(entry.totalDeductions || 0),
      'Net Pay': Number(entry.netPay || 0),
      PAYE: Number(entry.payeAmount || 0),
      'Loan Deduction': Number(entry.loanDeductionAmount || 0),
      'Other Deductions': Number(entry.otherDeductionAmount || 0),
      'Days Worked': entry.daysWorked === null || entry.daysWorked === undefined ? null : Number(entry.daysWorked),
      'Overtime Hours': entry.overtimeHours === null || entry.overtimeHours === undefined ? null : Number(entry.overtimeHours),
      Notes: cleanText(entry.notes) || null,
    }))
    .filter((row) => {
      const key = [
        row['Employee No'] || '',
        row['Name of Employee'] || '',
        String(row['Gross Pay'] || 0),
        String(row['Net Pay'] || 0),
      ].join('|');

      if (seenPayrollRows.has(key)) return false;
      seenPayrollRows.add(key);
      return true;
    });

  const terminationRows = (parsed.terminations || [])
    .filter((row) => !shouldSkipSyntheticEmployee(row))
    .map((row) => ({
      'Employee No': cleanText(row.employeeNo) || null,
      'Employee Name': cleanText(row.employeeName) || null,
      'Termination Date': row.terminationDate ? new Date(row.terminationDate) : null,
      Reason: cleanText(row.reason) || null,
      'Days Worked in Final Month': row.daysWorkedInFinalMonth === null || row.daysWorkedInFinalMonth === undefined
        ? null
        : Number(row.daysWorkedInFinalMonth),
      'Half Pay Received': row.halfPayReceived === null || row.halfPayReceived === undefined
        ? null
        : Number(row.halfPayReceived),
      'Settlement Amount': row.settlementAmount === null || row.settlementAmount === undefined
        ? null
        : Number(row.settlementAmount),
      Notes: cleanText(row.notes) || null,
    }));

  const reengagementRows = (parsed.reengagements || [])
    .filter((row) => !shouldSkipSyntheticEmployee(row))
    .map((row) => ({
      'Employee No': cleanText(row.employeeNo) || null,
      'Employee Name': cleanText(row.employeeName) || null,
      'Previous Wage': row.previousWage === null || row.previousWage === undefined ? null : Number(row.previousWage),
      'New Wage from 1/10/25': row.reengagementWage === null || row.reengagementWage === undefined ? null : Number(row.reengagementWage),
      Occupation: cleanText(row.occupation) || null,
      'Date Employed': row.effectiveDate ? new Date(row.effectiveDate) : null,
      'Expiry of Contract': row.contractExpiryDate ? new Date(row.contractExpiryDate) : null,
      Notes: cleanText(row.notes) || null,
    }));

  const outputPath = path.join(OUTPUT_DIR, 'Payroll_Workbook_Clean_2026.xlsx');
  writeWorkbook(outputPath, [
    ['Biodata', biodataRows],
    ['Pay Sheet', payrollRows],
    ['Terminations', terminationRows],
    ['Reengagement Wages', reengagementRows],
  ]);

  return {
    outputPath,
    biodata: biodataRows.length,
    payrollEntries: payrollRows.length,
    terminations: terminationRows.length,
    reengagements: reengagementRows.length,
  };
}

function main() {
  ensureOutputDir();

  if (!fs.existsSync(SALES_SOURCE)) {
    throw new Error(`Missing source workbook: ${SALES_SOURCE}`);
  }
  if (!fs.existsSync(PAYROLL_SOURCE)) {
    throw new Error(`Missing source workbook: ${PAYROLL_SOURCE}`);
  }

  const businessResult = generateBusinessCleanWorkbook();
  const payrollResult = generatePayrollCleanWorkbook();

  console.log('Clean workbook generation complete.');
  console.log('Business workbook:', businessResult);
  console.log('Payroll workbook:', payrollResult);
}

main();
