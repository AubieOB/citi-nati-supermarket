'use strict';

const express = require('express');
const {
  createGoodsIntake,
  updateGoodsIntake,
  deleteGoodsIntake,
  getGoodsIntakeById,
  listGoodsIntakes,
  lookupGoodsIntakeProducts,
  getGoodsIntakeLineStock,
  transferToPOS,
} = require('../../controllers/business-operations/goodsIntake.controller');

const router = express.Router();

router.get('/lookup-products', lookupGoodsIntakeProducts);
router.post('/line-stock', getGoodsIntakeLineStock);
router.post('/', createGoodsIntake);
router.put('/:id', updateGoodsIntake);
router.post('/:id/transfer-to-pos', transferToPOS);
router.delete('/:id', deleteGoodsIntake);
router.get('/:id', getGoodsIntakeById);
router.get('/', listGoodsIntakes);

module.exports = router;
