const express = require('express');
const { getDeliveryZoneOptions } = require('../controllers/deliveryZone.controller');

const router = express.Router();

router.get('/options', getDeliveryZoneOptions);

module.exports = router;
