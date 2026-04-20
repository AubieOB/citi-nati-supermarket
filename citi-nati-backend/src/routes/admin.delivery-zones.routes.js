const express = require('express');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const {
  getAdminDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  setDeliveryZoneActive,
  deleteDeliveryZone,
} = require('../controllers/deliveryZone.controller');

const router = express.Router();

router.use(verifyTokenMiddleware, verifyAdmin);

router.get('/', getAdminDeliveryZones);
router.post('/', createDeliveryZone);
router.put('/:id', updateDeliveryZone);
router.patch('/:id/active', setDeliveryZoneActive);
router.delete('/:id', deleteDeliveryZone);

module.exports = router;
