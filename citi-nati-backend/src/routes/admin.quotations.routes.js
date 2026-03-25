const express = require('express');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const {
  createQuotation,
  listQuotations,
  getQuotation,
  updateQuotation,
  deleteQuotation,
} = require('../controllers/quotation.controller');

const router = express.Router();

router.use(verifyTokenMiddleware, verifyAdmin);

router.get('/', listQuotations);
router.post('/', createQuotation);
router.get('/:id', getQuotation);
router.put('/:id', updateQuotation);
router.delete('/:id', deleteQuotation);

module.exports = router;
