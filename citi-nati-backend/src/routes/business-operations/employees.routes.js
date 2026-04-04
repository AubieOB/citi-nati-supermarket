'use strict';

const express = require('express');
const {
  createEmployee,
  updateEmployee,
  getEmployeeById,
  listEmployees,
  deleteEmployee,
  createSalaryStructure,
  updateSalaryStructure,
  getSalaryHistory,
  getCurrentSalary,
  importEmployees,
  importSalaryStructures,
} = require('../../controllers/business-operations/employees.controller');

const router = express.Router();

router.post('/import', importEmployees);
router.post('/salary-structures/import', importSalaryStructures);

router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);
router.get('/:id', getEmployeeById);
router.get('/', listEmployees);

router.post('/:id/salary-structures', createSalaryStructure);
router.put('/salary-structures/:id', updateSalaryStructure);
router.get('/:id/salary-structures', getSalaryHistory);
router.get('/:id/salary/current', getCurrentSalary);

module.exports = router;
