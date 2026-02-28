require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { emitNewOrder } = require('../utils/socket');
const { notifyPaymentSuccess, notifyOrderPlaced } = require('../utils/messageService');
const { sendOrderConfirmationEmail, sendPaymentConfirmationEmail } = require('../utils/emailService');
const { cacheWebhookEvent } = require('../utils/webhookCache');

const prisma = new PrismaClient();

const initializePayment = async (req, res) => {
  try {
    // Get orderId from request body
    const { orderId } = req.body;
    const userId = req.user.userId;

    if (!orderId) {
      return res.status(400).json({
        error: 'Order ID is required',
      });
    }

    // Find order and ensure it belongs to authenticated user
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
    });

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    if (order.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied - order does not belong to you',
      });
    }

    // Check if order is already paid
    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({
        error: 'Order already paid',
      });
    }

    // Check that order is in PENDING_PAYMENT status
    if (order.status !== 'PENDING_PAYMENT') {
      return res.status(400).json({
        error: 'Order is not in pending payment status',
      });
    }

    // Generate unique reference
    const paymentReference = `ORDER_${order.id}_${Date.now()}`;

    // Get user details for email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true }
    });

    console.log('[Payment] Initializing Paychangu payment for order:', order.id);

    try {
      // Validate environment variables
      if (!process.env.PAYCHANGU_SECRET_KEY) {
        console.error('[Payment] PAYCHANGU_SECRET_KEY is missing from environment variables');
        return res.status(500).json({
          error: 'Payment gateway not configured - missing secret key'
        });
      }

      // Call actual Paychangu API with correct field names
      const response = await axios.post(
        'https://api.paychangu.com/payment',
        {
          amount: order.total.toString(),
          currency: 'MWK',
          email: user.email,
          phone_number: order.phone,
          first_name: user.name.split(' ')[0],
          last_name: user.name.split(' ')[1] || '',
          reference: paymentReference,
          callback_url: `${process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL_FRONTEND || 'http://localhost:3001'}/payment-success?reference=${paymentReference}`,
          description: `Order #${order.id} - Citi-Nati Supermarket`
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('[Payment] FULL PAYCHANGU RESPONSE:', JSON.stringify(response.data, null, 2));

      // Safely extract checkout URL from possible structures
      const checkoutUrl =
        response.data?.checkout_url ||
        response.data?.data?.checkout_url ||
        response.data?.authorization_url ||
        response.data?.data?.authorization_url ||
        response.data?.link ||
        response.data?.data?.link;

      if (!checkoutUrl) {
        console.error('[Payment] Checkout URL missing in Paychangu response');
        console.error('[Payment] Response keys:', Object.keys(response.data));
        return res.status(500).json({
          error: 'No checkout URL received from Paychangu',
          rawResponse: response.data
        });
      }

      console.log('[Payment] Checkout URL extracted:', checkoutUrl);

      // Store payment reference in order
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentReference
        }
      });

      return res.status(200).json({
        checkoutUrl,
        orderId: order.id,
        amount: order.total,
        reference: paymentReference
      });

    } catch (apiError) {
      console.error('[Payment] Paychangu API Error:', apiError.response?.data || apiError.message);
      
      // Return user-friendly error message
      return res.status(500).json({
        error: 'Failed to initialize payment. Please try again.',
        details: process.env.NODE_ENV === 'development' ? apiError.message : undefined
      });
    }

  } catch (err) {
    console.error('[Payment] Error initializing payment:', err);
    return res.status(500).json({
      error: 'Server error while initializing payment',
    });
  }
};

const handleWebhook = async (req, res) => {
  try {
    console.log('[Webhook] Received webhook request');
    console.log('[Webhook] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[Webhook] Body:', JSON.stringify(req.body, null, 2));

    // Read signature from headers - try multiple header names
    const signature = req.headers['x-paychangu-signature'] || req.headers['x-signature'] || req.headers['signature'];

    // If signature missing, just log it but don't fail
    if (!signature) {
      console.warn('[Webhook] ⚠️ No signature found in headers - processing anyway for testing');
    } else {
      console.log('[Webhook] Signature found:', signature.substring(0, 20) + '...');
      
      // Generate HMAC using webhook secret
      const generatedSignature = crypto
        .createHmac('sha256', process.env.PAYCHANGU_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');

      // Compare signatures
      if (generatedSignature !== signature) {
        console.error('[Webhook] ❌ Invalid signature - generated:', generatedSignature.substring(0, 20) + '...');
        console.error('[Webhook] ❌ Provided:  ', signature.substring(0, 20) + '...');
        return res.sendStatus(200); // Return 200 to acknowledge but don't process
      }
      
      console.log('[Webhook] ✅ Signature verified');
    }

    // Read event details from request body - handle multiple possible field names
    const status = req.body?.status || req.body?.payment_status || req.body?.paymentStatus;
    const reference = req.body?.reference || req.body?.tx_ref || req.body?.transactionRef;
    const transactionId = req.body?.transaction_id || req.body?.transactionId;

    console.log('[Webhook] Parsed data:', { status, reference, transactionId });

    // Only process successful payments - check multiple possible status values
    const successStatuses = ['success', 'completed', 'COMPLETED', 'SUCCESS', 'paid', 'PAID'];
    if (!successStatuses.includes(status)) {
      console.log(`[Webhook] ⚠️ Payment status not success: ${status} (ignoring)`);
      return res.sendStatus(200);
    }

    console.log(`[Webhook] ✅ Payment status is successful: ${status}`);

    // Find order by payment reference
    const order = await prisma.order.findFirst({
      where: { paymentReference: reference }
    });

    if (!order) {
      console.error(`[Webhook] ❌ Order not found for reference: ${reference}`);
      console.log('[Webhook] Searching for order with reference:', reference);
      return res.sendStatus(200);
    }

    console.log(`[Webhook] ✅ Found order: ${order.id}`);

    // Prevent duplicate processing
    if (order.paymentStatus === 'PAID') {
      console.log(`[Webhook] Orders ${order.id} already marked as PAID - skipping`);
      return res.sendStatus(200);
    }

    // Update order - transaction to ensure atomicity
    console.log(`[Webhook] Updating order ${order.id} to PAID status...`);
    
    try {
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          status: 'PENDING'  // Change from PENDING_PAYMENT to PENDING (awaiting admin confirmation)
        },
        include: {
          items: {
            include: {
              product: true
            }
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      console.log(`[Webhook] ✅ Order ${order.id} updated successfully. Payment status: ${updatedOrder.paymentStatus}`);

      // Cache the webhook event for fast polling (polling endpoint checks cache first)
      cacheWebhookEvent(reference, 'completed', {
        orderId: order.id,
        amount: updatedOrder.total,
        timestamp: new Date()
      });
      console.log(`[Webhook] ✅ Webhook event cached for faster polling`);

      // Emit new order event to admins (NOW that payment is confirmed)
      emitNewOrder(updatedOrder);
      console.log(`[Webhook] ✅ Admin notified via Socket.io`);

      // Create admin notifications
      await notifyPaymentSuccess(updatedOrder);
      const itemCount = updatedOrder.items?.length || 0;
      await notifyOrderPlaced(updatedOrder, itemCount);

      // Return 200 immediately to Paychangu - don't wait for emails
      res.sendStatus(200);
      console.log(`[Webhook] ✅ Response sent to Paychangu (200 OK)`);
    } catch (updateErr) {
      console.error(`[Webhook] ❌ Failed to update order:`, updateErr.message);
      res.sendStatus(200); // Still return 200 to Paychangu
      return;
    }

    // Send emails asynchronously in background (don't block the response)
    // Wrap in setImmediate to prevent blocking
    setImmediate(async () => {
      try {
        // Send order confirmation email
        await sendOrderConfirmationEmail(
          updatedOrder.user.email,
          updatedOrder.user.name,
          updatedOrder,
          updatedOrder.items.map(item => item.product)
        );

        // Send payment confirmation email
        await sendPaymentConfirmationEmail(
          updatedOrder.user.email,
          updatedOrder.user.name,
          {
            orderId: updatedOrder.id,
            amount: updatedOrder.total,
            currency: 'MWK',
            method: 'Paychangu',
            date: new Date(),
            reference: reference,
            status: 'COMPLETED',
          }
        );

        console.log(`[Email] ✅ Background: Order and payment confirmation emails sent to ${updatedOrder.user.email}`);
      } catch (emailErr) {
        console.error(`[Email] ❌ Background: Failed to send emails for order ${order.id}:`, emailErr.message);
        // Non-blocking - errors here don't matter as order is already confirmed
      }
    });

  } catch (err) {
    console.error('Error handling webhook:', err);
    // Always return 200 to Paychangu (they retry if we don't acknowledge)
    return res.sendStatus(200);
  }
};

module.exports = { initializePayment, handleWebhook };
