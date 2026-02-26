const express = require('express');
const { initializePayment, handleWebhook } = require('../controllers/payments.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

// POST /api/payments/initialize - Initialize payment (requires authentication)
router.post('/initialize', verifyTokenMiddleware, initializePayment);

// POST /api/payments/webhook - Handle payment webhook (no authentication required)
router.post('/webhook', handleWebhook);

module.exports = router;
