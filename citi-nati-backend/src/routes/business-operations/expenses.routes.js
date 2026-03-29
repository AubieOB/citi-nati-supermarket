'use strict';

const express = require('express');
const {
  createExpenseCategory,
  updateExpenseCategory,
  listExpenseCategories,
  createExpense,
  updateExpense,
  getExpenseById,
  listExpenses,
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
router.get('/categories', listExpenseCategories);

router.post('/', createExpense);
router.put('/:id', updateExpense);
router.get('/:id', getExpenseById);
router.get('/', listExpenses);

module.exports = router;
