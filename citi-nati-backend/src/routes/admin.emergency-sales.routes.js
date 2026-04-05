const express = require('express');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const {
  lookupEmergencyProducts,
  createEmergencySale,
  listEmergencySales,
  getEmergencySaleById,
  retryEmergencySaleSync,
} = require('../controllers/emergencySales.controller');

const router = express.Router();

router.use(verifyTokenMiddleware, verifyAdmin);

router.get('/lookup', lookupEmergencyProducts);
router.post('/', createEmergencySale);
router.get('/', listEmergencySales);
router.get('/:id', getEmergencySaleById);
router.post('/:id/retry-sync', retryEmergencySaleSync);

module.exports = router;
