'use strict';

const suppliersService = require('./suppliers.service');
const expensesService = require('./expenses.service');
const employeesService = require('./employees.service');
const payrollService = require('./payroll.service');

async function importSuppliers(records) {
  return suppliersService.bulkUpsertSuppliers(records);
}

async function importExpenseCategories(records) {
  return expensesService.bulkUpsertExpenseCategories(records);
}

async function importExpenses(records) {
  return expensesService.bulkImportExpenses(records);
}

async function importEmployees(records) {
  return employeesService.bulkUpsertEmployees(records);
}

async function importSalaryStructures(records) {
  return employeesService.bulkUpsertSalaryStructures(records);
}

async function importPayrollPeriods(records) {
  return payrollService.bulkImportPayrollPeriods(records);
}

async function importPayrollEntries(records) {
  return payrollService.bulkImportPayrollEntries(records);
}

async function importLoans(records) {
  return payrollService.bulkImportLoans(records);
}

async function importTerminations(records) {
  return payrollService.bulkImportTerminations(records);
}

async function importReengagements(records) {
  return payrollService.bulkImportReengagements(records);
}

module.exports = {
  importSuppliers,
  importExpenseCategories,
  importExpenses,
  importEmployees,
  importSalaryStructures,
  importPayrollPeriods,
  importPayrollEntries,
  importLoans,
  importTerminations,
  importReengagements,
};
