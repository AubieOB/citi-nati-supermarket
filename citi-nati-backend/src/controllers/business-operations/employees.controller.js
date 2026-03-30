'use strict';

const employeesService = require('../../services/business-operations/employees.service');
const importsService = require('../../services/business-operations/imports.service');
const {
  parsePagination,
  parseSort,
  requiredString,
  toInt,
  toDate,
  toNumber,
  listResponse,
} = require('../../utils/business-operations/common');

const EMPLOYEE_SORT_FIELDS = new Set(['id', 'employeeNo', 'firstName', 'surname', 'department', 'status', 'createdAt']);
const SALARY_SORT_FIELDS = new Set(['id', 'effectiveFrom', 'agreedSalaryPerMonth', 'isCurrent', 'createdAt']);

function normalizeEmployeeNo(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function isEmployeeNoUniqueError(err) {
  return (
    err &&
    err.code === 'P2002' &&
    Array.isArray(err.meta?.target) &&
    err.meta.target.includes('employee_no')
  );
}

async function createEmployee(req, res) {
  try {
    const firstNameErr = requiredString(req.body.firstName, 'firstName');
    const surnameErr = requiredString(req.body.surname, 'surname');
    if (firstNameErr || surnameErr) {
      return res.status(400).json({ success: false, error: firstNameErr || surnameErr });
    }

    const employee = await employeesService.createEmployee({
      employeeNo: normalizeEmployeeNo(req.body.employeeNo),
      firstName: req.body.firstName.trim(),
      surname: req.body.surname.trim(),
      middleName: req.body.middleName,
      gender: req.body.gender,
      dateOfBirth: req.body.dateOfBirth ? toDate(req.body.dateOfBirth) : null,
      districtOfOrigin: req.body.districtOfOrigin,
      village: req.body.village,
      traditionalAuthority: req.body.traditionalAuthority,
      nationalId: req.body.nationalId,
      nationalIdExpiryDate: req.body.nationalIdExpiryDate ? toDate(req.body.nationalIdExpiryDate) : null,
      contactNumber: req.body.contactNumber,
      dateOfEmployment: req.body.dateOfEmployment ? toDate(req.body.dateOfEmployment) : null,
      position: req.body.position,
      department: req.body.department,
      locationId: toInt(req.body.locationId),
      employmentType: req.body.employmentType,
      status: req.body.status,
      notes: req.body.notes,
    });

    return res.status(201).json({ success: true, data: employee });
  } catch (err) {
    if (isEmployeeNoUniqueError(err)) {
      return res.status(409).json({
        success: false,
        error: 'Employee number already exists. Use a different employee number or leave it blank.',
      });
    }
    console.error('[BO][EMPLOYEES] createEmployee error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create employee' });
  }
}

async function updateEmployee(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid employee id' });

    const employee = await employeesService.updateEmployee(id, {
      employeeNo: normalizeEmployeeNo(req.body.employeeNo),
      firstName: req.body.firstName,
      surname: req.body.surname,
      middleName: req.body.middleName,
      gender: req.body.gender,
      dateOfBirth: req.body.dateOfBirth ? toDate(req.body.dateOfBirth) : undefined,
      districtOfOrigin: req.body.districtOfOrigin,
      village: req.body.village,
      traditionalAuthority: req.body.traditionalAuthority,
      nationalId: req.body.nationalId,
      nationalIdExpiryDate: req.body.nationalIdExpiryDate ? toDate(req.body.nationalIdExpiryDate) : undefined,
      contactNumber: req.body.contactNumber,
      dateOfEmployment: req.body.dateOfEmployment ? toDate(req.body.dateOfEmployment) : undefined,
      position: req.body.position,
      department: req.body.department,
      locationId: req.body.locationId !== undefined ? toInt(req.body.locationId) : undefined,
      employmentType: req.body.employmentType,
      status: req.body.status,
      notes: req.body.notes,
    });

    return res.json({ success: true, data: employee });
  } catch (err) {
    if (isEmployeeNoUniqueError(err)) {
      return res.status(409).json({
        success: false,
        error: 'Employee number already exists. Use a different employee number or leave it blank.',
      });
    }
    console.error('[BO][EMPLOYEES] updateEmployee error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update employee' });
  }
}

async function getEmployeeById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid employee id' });

    const employee = await employeesService.getEmployeeById(id);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

    return res.json({ success: true, data: employee });
  } catch (err) {
    console.error('[BO][EMPLOYEES] getEmployeeById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch employee' });
  }
}

async function listEmployees(req, res) {
  try {
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, EMPLOYEE_SORT_FIELDS, 'createdAt', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const filters = {
      search: req.query.search ? String(req.query.search).trim() : null,
      status: req.query.status ? String(req.query.status).trim() : null,
      department: req.query.department ? String(req.query.department).trim() : null,
      locationId: toInt(req.query.locationId),
    };

    const { data, total } = await employeesService.listEmployees({
      ...filters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    });

    return res.json(listResponse({
      data,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      filters,
    }));
  } catch (err) {
    console.error('[BO][EMPLOYEES] listEmployees error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list employees' });
  }
}

async function createSalaryStructure(req, res) {
  try {
    const employeeId = toInt(req.params.id);
    if (!employeeId) return res.status(400).json({ success: false, error: 'Invalid employee id' });

    const agreedSalaryPerMonth = toNumber(req.body.agreedSalaryPerMonth);
    const effectiveFrom = toDate(req.body.effectiveFrom);

    if (!Number.isFinite(agreedSalaryPerMonth)) {
      return res.status(400).json({ success: false, error: 'agreedSalaryPerMonth is required and must be numeric' });
    }
    if (!effectiveFrom) {
      return res.status(400).json({ success: false, error: 'effectiveFrom is required and must be valid' });
    }

    const salary = await employeesService.createSalaryStructure({
      employeeId,
      agreedSalaryPerMonth,
      annualIncrementAmount: toNumber(req.body.annualIncrementAmount, 0),
      salaryAfterIncrement: req.body.salaryAfterIncrement !== undefined ? toNumber(req.body.salaryAfterIncrement) : null,
      currency: req.body.currency,
      effectiveFrom,
      effectiveTo: req.body.effectiveTo ? toDate(req.body.effectiveTo) : null,
      isCurrent: req.body.isCurrent !== undefined ? !!req.body.isCurrent : true,
    });

    return res.status(201).json({ success: true, data: salary });
  } catch (err) {
    console.error('[BO][EMPLOYEES] createSalaryStructure error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create salary structure' });
  }
}

async function updateSalaryStructure(req, res) {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid salary structure id' });

    const salary = await employeesService.updateSalaryStructure(id, {
      agreedSalaryPerMonth: req.body.agreedSalaryPerMonth !== undefined ? toNumber(req.body.agreedSalaryPerMonth) : undefined,
      annualIncrementAmount: req.body.annualIncrementAmount !== undefined ? toNumber(req.body.annualIncrementAmount) : undefined,
      salaryAfterIncrement: req.body.salaryAfterIncrement !== undefined ? toNumber(req.body.salaryAfterIncrement) : undefined,
      currency: req.body.currency,
      effectiveFrom: req.body.effectiveFrom ? toDate(req.body.effectiveFrom) : undefined,
      effectiveTo: req.body.effectiveTo ? toDate(req.body.effectiveTo) : undefined,
      isCurrent: req.body.isCurrent !== undefined ? !!req.body.isCurrent : undefined,
    });

    return res.json({ success: true, data: salary });
  } catch (err) {
    console.error('[BO][EMPLOYEES] updateSalaryStructure error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update salary structure' });
  }
}

async function getSalaryHistory(req, res) {
  try {
    const employeeId = toInt(req.params.id);
    if (!employeeId) return res.status(400).json({ success: false, error: 'Invalid employee id' });

    const sort = parseSort(req.query, SALARY_SORT_FIELDS, 'effectiveFrom', 'desc');
    if (sort.error) return res.status(400).json({ success: false, error: sort.error });

    const data = await employeesService.getEmployeeSalaryHistory(employeeId);

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][EMPLOYEES] getSalaryHistory error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch salary history' });
  }
}

async function getCurrentSalary(req, res) {
  try {
    const employeeId = toInt(req.params.id);
    if (!employeeId) return res.status(400).json({ success: false, error: 'Invalid employee id' });

    const data = await employeesService.getCurrentSalary(employeeId);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[BO][EMPLOYEES] getCurrentSalary error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch current salary' });
  }
}

async function importEmployees(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const result = await importsService.importEmployees(records);
    return res.json({ success: true, data: result, importedCount: result.inserted + result.updated });
  } catch (err) {
    console.error('[BO][EMPLOYEES] importEmployees error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import employees' });
  }
}

async function importSalaryStructures(req, res) {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ success: false, error: 'records array is required' });

    const result = await importsService.importSalaryStructures(records);
    return res.json({ success: true, data: result, importedCount: result.inserted + result.updated });
  } catch (err) {
    console.error('[BO][EMPLOYEES] importSalaryStructures error:', err);
    return res.status(500).json({ success: false, error: 'Failed to import salary structures' });
  }
}

module.exports = {
  createEmployee,
  updateEmployee,
  getEmployeeById,
  listEmployees,
  createSalaryStructure,
  updateSalaryStructure,
  getSalaryHistory,
  getCurrentSalary,
  importEmployees,
  importSalaryStructures,
};
