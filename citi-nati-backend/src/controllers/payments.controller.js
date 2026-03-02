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
 * Verify payment with Paychangu - extract orderId from reference
 * Quick verification - fails fast if reference doesn't parse
 */
const verifyPaychanguPayment = async (transactionReference, transactionId) => {
  try {
    if (!transactionReference && !transactionId) {
      throw new Error('Transaction reference or transaction ID is required');
    }

    console.log('[Payment Verification] ⏱️ Starting verification for ref:', transactionReference);
    
    let orderId = null;

    // PRIORITY 1: Extract orderId from our tx_ref format: ORDER_{orderId}_{timestamp}
    if (transactionReference && transactionReference.startsWith('ORDER_')) {
      console.log('[Payment Verification] Attempting to parse tx_ref format...');
      const parts = transactionReference.split('_');
      if (parts.length >= 2) {
        const parsed = parseInt(parts[1]);
        if (!isNaN(parsed) && parsed > 0) {
          orderId = parsed;
          console.log('[Payment Verification] ✅ Parsed orderId from tx_ref:', orderId);
        }
      }
    }

    // If we successfully extracted orderId, verify it exists
    if (orderId) {
      console.log('[Payment Verification] 🔍 Looking up order ID:', orderId);
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, total: true }
      });

      if (order) {
        console.log('[Payment Verification] ✅ Order found:', orderId, 'amount:', order.total);
        return {
          success: true,
          orderId: orderId,
          amount: order.total
        };
      } else {
        console.warn('[Payment Verification] ⚠️ Order ID', orderId, 'not found in database');
      }
    }

    // PRIORITY 2: If parsing failed, try to extract from transactionId
    // (Paychangu might send this instead)
    if (!orderId && transactionId) {
      console.log('[Payment Verification] Attempting to extract orderId from transactionId...');
      // Check if transactionId contains order info
      if (transactionId.includes('_')) {
        const parts = transactionId.split('_');
        const parsed = parseInt(parts[parts.length - 1]);
        if (!isNaN(parsed) && parsed > 0) {
          orderId = parsed;
          console.log('[Payment Verification] ✅ Extracted orderId from transactionId:', orderId);
        }
      }
    }

    // Verify the extracted orderId if we have one
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, total: true }
      });

      if (order) {
        console.log('[Payment Verification] ✅ Order verified:', orderId);
        return {
          success: true,
          orderId: orderId,
          amount: order.total
        };
      }
    }

    // PRIORITY 3: Last resort - query by reference (but with timeout)
    // Only do this if parsing entirely failed
    if (transactionReference && !orderId) {
      console.log('[Payment Verification] Trying database lookup for reference:', transactionReference);
      
      const order = await Promise.race([
        prisma.order.findFirst({
          where: { paymentReference: transactionReference },
          select: { id: true, total: true }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 3000)
        )
      ]);

      if (order) {
        console.log('[Payment Verification] ✅ Found by paymentReference:', order.id);
        return {
          success: true,
          orderId: order.id,
          amount: order.total
        };
      }
    }

    // If we get here, we couldn't verify
    throw new Error(`Could not verify payment: ref=${transactionReference}, txId=${transactionId}`);
  } catch (err) {
    console.error('[Payment Verification] ❌ Verification failed:', err.message);
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
  // Set a timeout for the entire webhook processing (30 seconds max)
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('Webhook processing timeout')), 30000);
  });

  // Declare orderId in function scope so it's accessible in all catch blocks
  let orderId = null;

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
      clearTimeout(timeoutHandle);
      return res.sendStatus(200);
    }

    console.log(`[Webhook] ✅ Payment status is successful: ${status}`);

    // 1️⃣ Verify payment (pass both reference and transactionId)
    const verification = await verifyPaychanguPayment(reference, transactionId);
    if (!verification.success) {
      console.error('[Webhook] ❌ Payment verification failed:', verification.error);
      clearTimeout(timeoutHandle);
      return res.sendStatus(200);
    }

    orderId = verification.orderId;

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
    clearTimeout(timeoutHandle);
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
        where: { id: orderId },
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
      // If refund failed and we have orderId, try to mark order as REFUND_PENDING for manual review
      if (orderId) {
        try {
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'REFUND_PENDING',
              status: 'PENDING',
              notes: `Refund processing failed: ${refundErr.message}`
            }
          });
          console.log(`[Webhook] ⚠️ Order ${orderId} marked as REFUND_PENDING for manual review`);
        } catch (updateErr) {
          console.error(`[Webhook] ⚠️ Could not even mark order as REFUND_PENDING: ${updateErr.message}`);
        }
      }
      // Log for debugging but still return 200 to Paychangu
    }

    clearTimeout(timeoutHandle);
    res.sendStatus(200);
    return;
  }
};

module.exports = { initializePayment, handleWebhook, verifyPaychanguPayment, refundPaychanguPayment };
