'use strict';

const express = require('express');
const {
  createExpenseCategory,
  updateExpenseCategory,
  listExpenseCategories,
  deleteExpenseCategory,
  createExpense,
  updateExpense,
  getExpenseById,
  listExpenses,
  deleteExpense,
  getExpenseSummary,
  seedDefaultCategories,
  importExpenseCategories,
  importExpenses,
} = require('../../controllers/business-operations/expenses.controller');

const router = express.Router();

router.post('/categories/seed-defaults', seedDefaultCategories);
router.post('/categories/import', importExpenseCategories);
router.post('/import', importExpenses);

router.post('/categories', createExpenseCategory);
router.put('/categories/:id', updateExpenseCategory);
router.delete('/categories/:id', deleteExpenseCategory);
router.get('/categories', listExpenseCategories);

router.post('/', createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);
router.get('/summary/overview', getExpenseSummary);
router.get('/:id', getExpenseById);
router.get('/', listExpenses);

module.exports = router;
