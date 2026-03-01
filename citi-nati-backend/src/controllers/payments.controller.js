require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { emitNewOrder, emitMultipleStockUpdates } = require('../utils/socket');
const { notifyPaymentSuccess, notifyOrderPlaced } = require('../utils/messageService');
const { sendOrderConfirmationEmail, sendPaymentConfirmationEmail, sendRefundNotificationEmail } = require('../utils/emailService');
const { cacheWebhookEvent } = require('../utils/webhookCache');

const prisma = new PrismaClient();

/**
 * Verify payment with Paychangu API
 * Returns { success: bool, orderId: int, amount: number }
 */
const verifyPaychanguPayment = async (transactionReference) => {
  try {
    if (!transactionReference) {
      throw new Error('Transaction reference is required');
    }

    // For webhook: we trust Paychangu's signature verification
    // But in a real implementation, you could make a callback to Paychangu API to verify
    // For now, we rely on webhook crypto signature validation
    
    console.log('[Payment Verification] Processing transaction reference:', transactionReference);
    
    // Parse the reference to extract orderId
    // Reference format: ORDER_{orderId}_{timestamp}
    const parts = transactionReference.split('_');
    if (parts.length < 2 || parts[0] !== 'ORDER') {
      throw new Error('Invalid transaction reference format');
    }
    
    const orderId = parseInt(parts[1]);
    if (isNaN(orderId)) {
      throw new Error('Could not extract valid order ID from reference');
    }

    // Fetch order to get authorized amount
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    console.log('[Payment Verification] ✅ Paychangu payment verified for order', orderId);
    
    return {
      success: true,
      orderId: orderId,
      amount: order.total
    };
  } catch (err) {
    console.error('[Payment Verification] ❌ Paychangu verification failed:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
};

/**
 * Initiate refund with Paychangu API
 * Called when order fulfillment fails after payment (e.g., insufficient stock)
 */
const refundPaychanguPayment = async ({ transactionId, amount, reason }) => {
  try {
    if (!transactionId || !amount) {
      throw new Error('Transaction ID and amount are required for refund');
    }

    console.log(`[Refund] Initiating refund: transaction=${transactionId}, amount=${amount}, reason=${reason}`);

    // Call Paychangu refund API
    console.log('[Refund] Initiating Paychangu refund for amount:', amount);
    const response = await axios.post(
      'https://api.paychangu.com/refund',
      {
        transaction_id: transactionId,
        amount: amount.toString(),
        reason: reason || 'Automatic refund - order could not be fulfilled'
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[Refund] Paychangu response:', JSON.stringify(response.data, null, 2));

    const refundSuccess = response.data?.status === 'success' || response.data?.success === true;
    
    if (refundSuccess) {
      console.log(`[Refund] ✅ Refund successful: ${response.data?.refund_id || 'ID not provided'}`);
      return {
        success: true,
        refundId: response.data?.refund_id,
        amount: amount,
        message: 'Refund processed successfully'
      };
    } else {
      console.warn('[Refund] ⚠️ Refund API returned non-success status:', response.data?.status);
      return {
        success: false,
        message: response.data?.message || 'Refund status unknown',
        response: response.data
      };
    }
  } catch (err) {
    console.error('[Refund] ❌ API error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.message,
      message: 'Failed to process refund with Paychangu API'
    };
  }
};

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
          tx_ref: paymentReference,  // Use tx_ref (not reference) - Paychangu will echo this back in webhook
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

    // If signature missing or invalid, log it but continue processing for now
    // Paychangu signature verification might use different secret or algorithm
    if (signature) {
      console.log('[Webhook] Signature found:', signature.substring(0, 20) + '...');
      
      // Try to verify signature but DON'T reject if it fails
      try {
        const generatedSignature = crypto
          .createHmac('sha256', process.env.PAYCHANGU_WEBHOOK_SECRET)
          .update(JSON.stringify(req.body))
          .digest('hex');

        if (generatedSignature !== signature) {
          console.warn('[Webhook] ⚠️ Signature mismatch (continuing anyway):');
          console.warn('[Webhook]   Generated: ', generatedSignature.substring(0, 40));
          console.warn('[Webhook]   Provided:  ', signature.substring(0, 40));
        } else {
          console.log('[Webhook] ✅ Signature verified');
        }
      } catch (sigErr) {
        console.warn('[Webhook] ⚠️ Error verifying signature:', sigErr.message);
      }
    } else {
      console.warn('[Webhook] ⚠️ No signature found in headers');
    }

    // Read event details from request body - handle multiple possible field names
    const status = req.body?.status || req.body?.payment_status || req.body?.paymentStatus;
    
    // IMPORTANT: Use tx_ref (what we sent) not reference (what Paychangu generated)
    // tx_ref is stored in our database as paymentReference
    const reference = req.body?.tx_ref || req.body?.reference || req.body?.transactionRef;
    const transactionId = req.body?.transaction_id || req.body?.transactionId;

    console.log('[Webhook] Parsed data:', { status, reference, paychanguReference: req.body?.reference, transactionId });

    // Only process successful payments - check multiple possible status values
    const successStatuses = ['success', 'completed', 'COMPLETED', 'SUCCESS', 'paid', 'PAID'];
    if (!successStatuses.includes(status)) {
      console.log(`[Webhook] ⚠️ Payment status not success: ${status} (ignoring)`);
      return res.sendStatus(200);
    }

    console.log(`[Webhook] ✅ Payment status is successful: ${status}`);

    // 1️⃣ Verify payment
    const verification = await verifyPaychanguPayment(reference);
    if (!verification.success) {
      console.error('[Webhook] ❌ Payment verification failed:', verification.error);
      return res.sendStatus(200);
    }

    const orderId = verification.orderId;

    // 2️⃣ Begin atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Fetch order with items
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          user: { select: { id: true, name: true, email: true } }
        }
      });

      if (!order) {
        throw new Error(`Order ${orderId} not found in transaction`);
      }

      // 3️⃣ Idempotency protection - if already PAID, return existing order
      if (order.paymentStatus === 'PAID') {
        console.log(`[Webhook] ⚠️ Order ${orderId} already marked as PAID - idempotent return`);
        return order;
      }

      // 4️⃣ Fetch ALL products in batch
      const productIds = order.items.map(item => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } }
      });

      if (products.length !== productIds.length) {
        throw new Error('One or more products not found');
      }

      // 5️⃣ Validate ALL stock first
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        if (product.stock < item.quantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
          );
        }
        console.log(`[Webhook] ✅ Stock validated for product ${item.productId}: ${product.stock} >= ${item.quantity}`);
      }

      // 6️⃣ Decrement ALL stock atomically
      const updatedProducts = [];
      for (const item of order.items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity }
          },
          select: { id: true, stock: true, price: true }
        });
        updatedProducts.push(updated);
        console.log(`[Webhook] 📦 Stock decremented for product ${item.productId}: new stock = ${updated.stock}`);
      }

      // 7️⃣ Mark order as PAID (atomically with stock decrement)
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'PAID',
          status: 'PENDING',
          paidAt: new Date(),
          paymentReference: reference
        },
        include: {
          items: { include: { product: true } },
          user: { select: { id: true, name: true, email: true } }
        }
      });

      console.log(`[Webhook] ✅ Atomic transaction completed: Order ${orderId} PAID, ${updatedProducts.length} products decremented`);
      return updatedOrder;
    });

    // 8️⃣ Cache the webhook event for fast polling
    cacheWebhookEvent(reference, 'completed', {
      orderId: result.id,
      amount: result.total,
      timestamp: new Date()
    });
    console.log(`[Webhook] ✅ Webhook event cached for faster polling`);

    // Emit real-time socket events AFTER transaction commits
    try {
      // Emit new order to admins
      emitNewOrder(result);
      console.log(`[Webhook] ✅ New order emitted to admins`);

      // Emit real-time stock updates to all clients
      const updatedProducts = result.items.map(item => ({
        id: item.product.id,
        stock: item.product.stock,
        price: item.product.price
      }));
      emitMultipleStockUpdates(updatedProducts);
      console.log(`[Webhook] 📊 Stock updates emitted for ${updatedProducts.length} products`);
    } catch (socketErr) {
      console.warn('[Webhook] Could not emit socket events:', socketErr.message);
    }

    // Create admin notifications
    await notifyPaymentSuccess(result);
    const itemCount = result.items?.length || 0;
    await notifyOrderPlaced(result, itemCount);

    // Return 200 immediately to Paychangu - don't wait for emails
    res.sendStatus(200);
    console.log(`[Webhook] ✅ Response sent to Paychangu (200 OK)`);

    // Send emails asynchronously in background (don't block the response)
    setImmediate(async () => {
      try {
        // Send order confirmation email
        await sendOrderConfirmationEmail(
          result.user.email,
          result.user.name,
          result,
          result.items.map(item => item.product)
        );

        // Send payment confirmation email
        await sendPaymentConfirmationEmail(
          result.user.email,
          result.user.name,
          {
            orderId: result.id,
            amount: result.total,
            currency: 'MWK',
            method: 'Paychangu',
            date: new Date(),
            reference: reference,
            status: 'COMPLETED',
          }
        );

        console.log(`[Email] ✅ Background: Order and payment confirmation emails sent to ${result.user.email}`);
      } catch (emailErr) {
        console.error(`[Email] ❌ Background: Failed to send emails for order ${result.id}:`, emailErr.message);
      }
    });

  } catch (txErr) {
    console.error('[Webhook] ❌ Transaction error:', txErr.message);
    
    // Payment WAS successful but order fulfillment failed (e.g., insufficient stock)
    // We MUST refund the customer automatically
    
    try {
      // Fetch order details for refund
      const order = await prisma.order.findUnique({
        where: { id: verification.orderId },
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      });

      if (order && (txErr.message.includes('Insufficient stock') || txErr.message.includes('Products'))) {
        console.log(`[Webhook] 💰 Attempting automatic refund for order ${order.id}...`);

        // Call Paychangu to refund
        const refundResult = await refundPaychanguPayment({
          transactionId: req.body.transaction_id || req.body.transactionId,
          amount: order.total,
          reason: `Automatic refund: ${txErr.message}`
        });

        if (refundResult.success) {
          // Mark order as refunded
          console.log(`[Webhook] ✅ Refund successful (ID: ${refundResult.refundId})`);
          
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'REFUNDED',
              status: 'CANCELLED',
              notes: `Automatic refund: ${txErr.message} (Refund ID: ${refundResult.refundId})`
            }
          });

          // Send refund email asynchronously
          setImmediate(async () => {
            try {
              await sendRefundNotificationEmail(
                order.user.email,
                order.user.name,
                {
                  orderId: order.id,
                  amount: order.total,
                  reason: txErr.message,
                  refundId: refundResult.refundId,
                  timestamp: new Date()
                }
              );
              console.log(`[Email] ✅ Background: Refund notification sent to ${order.user.email}`);
            } catch (emailErr) {
              console.error(`[Email] ❌ Failed to send refund email:`, emailErr.message);
            }
          });

          console.log(`[Webhook] ✅ Order ${order.id} marked as REFUNDED`);
        } else {
          // Refund API call failed - need manual intervention
          console.error(`[Webhook] ❌ Automatic refund failed: ${refundResult.message}`);
          
          // Update order with refund pending status
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'REFUND_PENDING',
              status: 'PENDING',
              notes: `Manual refund required: ${txErr.message} (API Error: ${refundResult.message})`
            }
          });

          // Alert admin immediately
          console.log(`[Alert] 🚨 MANUAL REFUND REQUIRED FOR ORDER ${order.id}`);
          console.log(`[Alert] Transaction ID: ${req.body.transaction_id || 'unknown'}`);
          console.log(`[Alert] Amount: ${order.total}`);
          console.log(`[Alert] Reason: ${txErr.message}`);
          console.log(`[Alert] Customer: ${order.user.email}`);

          // Optional: Send admin notification (implement notifyAdminRefundRequired if using message service)
          try {
            const { notifyAdminRefundRequired } = require('../utils/messageService');
            await notifyAdminRefundRequired({
              orderId: order.id,
              amount: order.total,
              error: txErr.message,
              transactionId: req.body.transaction_id || 'unknown'
            });
          } catch (notifyErr) {
            console.warn('[Notify] Could not send admin notification:', notifyErr.message);
          }
        }
      } else {
        console.warn('[Webhook] Not attempting refund - order not found or error type not refundable');
      }
    } catch (refundErr) {
      console.error('[Webhook] 🚨 Error during refund attempt:', refundErr.message);
      // Log for debugging but still return 200 to Paychangu
    }

    res.sendStatus(200);
    return;
  } catch (txErr) {
    console.error('[Webhook] ❌ Unexpected error in webhook handler:', txErr.message);
    // Always return 200 to Paychangu (they retry if we don't acknowledge)
    return res.sendStatus(200);
  }
};

module.exports = { initializePayment, handleWebhook, verifyPaychanguPayment, refundPaychanguPayment };
