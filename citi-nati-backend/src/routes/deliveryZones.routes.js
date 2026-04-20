const express = require('express');
const { getDeliveryLocationMaster, getDeliveryZoneOptions } = require('../controllers/deliveryZone.controller');

const router = express.Router();

router.get('/master', getDeliveryLocationMaster);
router.get('/options', getDeliveryZoneOptions);

module.exports = router;
