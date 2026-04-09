'use strict';

const express = require('express');
const {
  createGoodsIntake,
  updateGoodsIntake,
  deleteGoodsIntake,
  getGoodsIntakeById,
  listGoodsIntakes,
} = require('../../controllers/business-operations/goodsIntake.controller');

const router = express.Router();

router.post('/', createGoodsIntake);
router.put('/:id', updateGoodsIntake);
router.delete('/:id', deleteGoodsIntake);
router.get('/:id', getGoodsIntakeById);
router.get('/', listGoodsIntakes);

module.exports = router;
