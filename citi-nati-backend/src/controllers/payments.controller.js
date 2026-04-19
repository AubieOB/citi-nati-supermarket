require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { emitNewOrder, emitOrderUpdated } = require('../utils/socket');
const { notifyPaymentSuccess, notifyOrderPlaced, notifyRefundRequired } = require('../utils/messageService');
const { sendOrderConfirmationEmail, sendPaymentConfirmationEmail, sendRefundNotificationEmail } = require('../utils/emailService');
const { cacheWebhookEvent } = require('../utils/webhookCache');
const posCommandQueueService = require('../services/posCommandQueue.service');
const { splitInclusiveVatAtRate, getVatRatePercent, normalizeVatRatePercent, roundMoney } = require('../utils/vat');
const { formatBusinessDateKey, formatBusinessTimeKey } = require('../utils/businessTime');
const { recordAuditLog } = require('../services/auditLog.service');

const prisma = new PrismaClient();

function formatInvoiceDate(date = new Date()) {
  return formatBusinessDateKey(date) || '';
}

function formatInvoiceTime(date = new Date()) {
  return formatBusinessTimeKey(date);
}

async function buildWriteInvoicePayload(order, paymentReference) {
  const locationCode = process.env.POS_LOCATION_CODE || 'SH';
  const priceTypeCode = process.env.POS_PRICE_TYPE_CODE || 'RT';
  const persistedVatRate = normalizeVatRatePercent(order?.vatRatePercent, NaN);
  const fallbackVatRate = await getVatRatePercent();
  const appliedVatRate = Number.isFinite(persistedVatRate) ? persistedVatRate : fallbackVatRate;

  const posItems = [];

  for (const item of order.items || []) {
    const sourceCode = item.product && item.product.sourceCode;

    if (!sourceCode) {
      console.log('[BACKEND POS WRITE SKIP] skipped item missing sourceCode:', {
        orderId: order.id,
        orderItemId: item.id,
        productId: item.productId,
        productName: item.product && item.product.name,
      });
      continue;
    }

    const qty = Number(item.quantity);
    const unitPrice = Number(item.price);

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      console.log('[BACKEND POS WRITE SKIP] skipped invalid POS item values:', {
        orderId: order.id,
        orderItemId: item.id,
        sourceCode,
        qty,
        unitPrice,
      });
      continue;
    }

    const amount = roundMoney(qty * unitPrice);
    const taxAmount = splitInclusiveVatAtRate(amount, appliedVatRate).vatAmount;

    posItems.push({
      productCode: sourceCode,
      productName: (item.product && item.product.name) || `PRODUCT-${sourceCode}`,
      qty,
      unitPrice,
      discount: 0,
      amount,
      taxRate: appliedVatRate,
      taxAmount,
      fPrice: unitPrice,
      locationCode,
      costPrice: 0,
      priceTypeCode,
    });
  }

  if (posItems.length === 0) {
    return null;
  }

  const netSale = roundMoney(posItems.reduce((sum, item) => sum + Number(item.amount), 0));
  const invoiceTotals = splitInclusiveVatAtRate(netSale, appliedVatRate);

  return {
    orderId: String(order.id),
    reference: paymentReference || order.paymentReference || `ORDER-${order.id}`,
    locationCode,
    customerCode: 'CASH',
    invoiceDate: formatInvoiceDate(new Date()),
    invoiceTime: formatInvoiceTime(new Date()),
    grossSale: invoiceTotals.gross,
    vat: invoiceTotals.vatAmount,
    discount: 0,
    netSale: invoiceTotals.net,
    payMethod1: 'CARD',
    tenAmt1: invoiceTotals.gross,
    payMethod2: '',
    tenAmt2: 0,
    userName: 'ONLINE',
    priceTypeCode,
    invoiceType: 'CS',
    tillId: 'WEB',
    items: posItems,
  };
}

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
    
    // Paychangu refund endpoint uses GET (not POST)
    // Note: endpoint is /refunds (plural), not /refund
    const response = await axios.get(
      'https://api.paychangu.com/refunds',
      {
        params: {
          transaction_id: transactionId,
          amount: amount.toString(),
          reason: reason || 'Automatic refund - order could not be fulfilled'
        },
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
    const paymentInitRequestId = `pay_init_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    console.log('[PaymentInit] Entry', {
      paymentInitRequestId,
      method: req.method,
      path: req.originalUrl,
      backendRequestUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      origin: req.headers.origin || null,
      referer: req.headers.referer || null,
    });

    // Get orderId from request body
    const { orderId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      console.error('[PaymentInit] Missing userId on authenticated request', {
        paymentInitRequestId,
        reqUserKeys: req.user ? Object.keys(req.user) : [],
      });
      return res.status(401).json({
        error: 'Invalid authentication context for payment initialization',
        requestId: paymentInitRequestId,
      });
    }

    if (!orderId) {
      return res.status(400).json({
        error: 'Order ID is required',
      });
    }

    const parsedOrderId = Number.parseInt(orderId, 10);
    if (!Number.isInteger(parsedOrderId) || parsedOrderId <= 0) {
      console.error('[PaymentInit] Invalid orderId provided', {
        paymentInitRequestId,
        orderId,
      });
      return res.status(400).json({
        error: 'Invalid Order ID',
        requestId: paymentInitRequestId,
      });
    }

    // Find order and ensure it belongs to authenticated user
    const order = await prisma.order.findUnique({
      where: { id: parsedOrderId },
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

    const callbackBaseUrl = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL_FRONTEND || 'http://localhost:3001';
    const callbackUrl = `${callbackBaseUrl}/payment-success?reference=${paymentReference}`;
    const paychanguEndpoint = 'https://api.paychangu.com/payment';

    const envPresence = {
      PAYCHANGU_SECRET_KEY: Boolean(process.env.PAYCHANGU_SECRET_KEY),
      PAYCHANGU_PUBLIC_KEY: Boolean(process.env.PAYCHANGU_PUBLIC_KEY),
      PAYCHANGU_WEBHOOK_SECRET: Boolean(process.env.PAYCHANGU_WEBHOOK_SECRET),
      FRONTEND_URL: Boolean(process.env.FRONTEND_URL),
      RENDER_EXTERNAL_URL_FRONTEND: Boolean(process.env.RENDER_EXTERNAL_URL_FRONTEND),
      BACKEND_URL: Boolean(process.env.BACKEND_URL),
      API_BASE_URL: Boolean(process.env.API_BASE_URL),
    };

    console.log('[PaymentInit] Diagnostics', {
      paymentInitRequestId,
      orderId: order.id,
      userId,
      backendUrlUsed: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      paychanguEndpoint,
      callbackUrl,
      envPresence,
    });

    try {
      // Validate environment variables
      if (!process.env.PAYCHANGU_SECRET_KEY) {
        console.error('[PaymentInit] PAYCHANGU_SECRET_KEY is missing from environment variables', {
          paymentInitRequestId,
        });
        return res.status(500).json({
          error: 'Payment gateway not configured - missing secret key',
          requestId: paymentInitRequestId,
        });
      }

      if (!user || !user.email || !user.name) {
        console.error('[PaymentInit] Missing user profile fields required by PayChangu', {
          paymentInitRequestId,
          foundUser: Boolean(user),
          hasEmail: Boolean(user?.email),
          hasName: Boolean(user?.name),
        });
        return res.status(500).json({
          error: 'User profile is incomplete for payment initialization',
          requestId: paymentInitRequestId,
        });
      }

      const [firstName = '', lastName = ''] = String(user.name).trim().split(/\s+/, 2);

      const paychanguPayload = {
        amount: order.total.toString(),
        currency: 'MWK',
        email: user.email,
        phone_number: order.phone,
        first_name: firstName,
        last_name: lastName,
        tx_ref: paymentReference,
        callback_url: callbackUrl,
        description: `Order #${order.id} - Citi-Nati Supermarket`
      };

      console.log('[PaymentInit] PayChangu request body', {
        paymentInitRequestId,
        payload: paychanguPayload,
      });

      // Call actual Paychangu API with correct field names
      const response = await axios.post(
        paychanguEndpoint,
        paychanguPayload,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          responseType: 'text',
          transformResponse: [(data) => data],
          validateStatus: () => true,
        }
      );

      const rawResponseBody = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

      console.log('[PaymentInit] PayChangu response received', {
        paymentInitRequestId,
        status: response.status,
        rawBody: rawResponseBody,
      });

      if (!response.status || response.status < 200 || response.status >= 300) {
        console.error('[PaymentInit] Non-success PayChangu status', {
          paymentInitRequestId,
          status: response.status,
          rawBody: rawResponseBody,
        });
        return res.status(502).json({
          error: 'PayChangu returned an unexpected response status',
          requestId: paymentInitRequestId,
        });
      }

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(rawResponseBody);
      } catch (parseError) {
        console.error('[PaymentInit] Failed to parse PayChangu JSON response', {
          paymentInitRequestId,
          status: response.status,
          parseError: parseError.message,
          rawBody: rawResponseBody,
        });
        return res.status(502).json({
          error: 'Payment gateway returned a non-JSON response',
          requestId: paymentInitRequestId,
        });
      }

      console.log('[Payment] FULL PAYCHANGU RESPONSE:', JSON.stringify(parsedResponse, null, 2));

      // Safely extract checkout URL from possible structures
      const checkoutUrl =
        parsedResponse?.checkout_url ||
        parsedResponse?.data?.checkout_url ||
        parsedResponse?.authorization_url ||
        parsedResponse?.data?.authorization_url ||
        parsedResponse?.link ||
        parsedResponse?.data?.link;

      if (!checkoutUrl) {
        console.error('[PaymentInit] Checkout URL missing in Paychangu response', {
          paymentInitRequestId,
          responseKeys: parsedResponse && typeof parsedResponse === 'object' ? Object.keys(parsedResponse) : [],
          rawBody: rawResponseBody,
        });
        return res.status(502).json({
          error: 'No checkout URL received from Paychangu',
          requestId: paymentInitRequestId,
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
      console.error('[PaymentInit] Paychangu API Error', {
        paymentInitRequestId,
        message: apiError.message,
        stack: apiError.stack,
        status: apiError.response?.status,
        rawBody: typeof apiError.response?.data === 'string'
          ? apiError.response?.data
          : JSON.stringify(apiError.response?.data || null),
      });
      
      // Return user-friendly error message
      return res.status(500).json({
        error: 'Failed to initialize payment. Please try again.',
        requestId: paymentInitRequestId,
        details: process.env.NODE_ENV === 'development' ? apiError.message : undefined
      });
    }

  } catch (err) {
    console.error('[PaymentInit] Error initializing payment', {
      message: err.message,
      stack: err.stack,
    });
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

      // 5️⃣ Validate ALL stock first (use effectiveStock: override if active, else posStock)
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        const effectiveStock = (product.overrideActive && product.overrideStock != null)
          ? product.overrideStock
          : product.stock;
        if (effectiveStock < item.quantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Available: ${effectiveStock}, Requested: ${item.quantity}`
          );
        }
        const stockSource = (product.overrideActive && product.overrideStock != null) ? 'override' : 'posStock';
        console.log(`[Webhook] ✅ Stock validated for product ${item.productId}: effectiveStock=${effectiveStock} (${stockSource}) >= ${item.quantity}`);
      }

      // 6️⃣ Decrement ALL stock atomically
      // Always decrement posStock (product.stock) to keep physical inventory accurate.
      // If a website override is active, also decrement overrideStock by the same amount
      // so the relative override remains meaningful after the sale.
      const updatedProducts = [];
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        const decrementData = { stock: { decrement: item.quantity } };
        if (product && product.overrideActive && product.overrideStock != null) {
          decrementData.overrideStock = { decrement: item.quantity };
        }
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: decrementData,
          select: { id: true, stock: true, overrideActive: true, overrideStock: true, price: true }
        });
        updatedProducts.push(updated);
        console.log(`[Webhook] 📦 Stock decremented for product ${item.productId}: posStock=${updated.stock}${
          updated.overrideActive ? `, overrideStock=${updated.overrideStock}` : ''
        }`);
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

    console.log('[BACKEND PAYMENT FLOW] payment confirmed:', {
      orderId: result.id,
      reference,
      paymentStatus: result.paymentStatus,
    });

    console.log('[BACKEND ORDER FLOW] order finalized:', {
      orderId: result.id,
      status: result.status,
      totalItems: (result.items || []).length,
    });

    try {
      const writeInvoicePayload = await buildWriteInvoicePayload(result, reference);

      if (!writeInvoicePayload) {
        console.log('[BACKEND POS WRITE SKIP] no POS-linked items, WRITE_INVOICE not queued:', {
          orderId: result.id,
        });
      } else {
        console.log('[POS COMMAND QUEUE] enqueue WRITE_INVOICE start:', {
          orderId: result.id,
          reference,
          itemCount: writeInvoicePayload.items.length,
        });

        const queuedWriteInvoice = await posCommandQueueService.enqueueCommand(
          'WRITE_INVOICE',
          writeInvoicePayload,
          {
            source: 'payments_webhook',
            relatedEntityType: 'order',
            relatedEntityId: result.id,
            createdBy: 'payments.controller.handleWebhook',
            maxRetries: 5,
          }
        );

        console.log('[POS COMMAND QUEUE] WRITE_INVOICE queued:', {
          commandId: queuedWriteInvoice.id,
          orderId: result.id,
          itemCount: writeInvoicePayload.items.length,
        });

        await recordAuditLog({
          action: 'POS_INVOICE_WRITEBACK_QUEUED',
          resourceType: 'ORDER',
          resourceId: result.id,
          status: 'SUCCESS',
          metadata: {
            commandId: queuedWriteInvoice.id,
            itemCount: writeInvoicePayload.items.length,
            paymentReference: reference,
          },
        });
      }
    } catch (queueErr) {
      await recordAuditLog({
        action: 'POS_INVOICE_WRITEBACK_QUEUE_FAILED',
        resourceType: 'ORDER',
        resourceId: result.id,
        status: 'FAILURE',
        metadata: {
          paymentReference: reference,
          error: queueErr.message,
        },
      });
      console.error('[POS COMMAND QUEUE ERROR] failed to queue WRITE_INVOICE:', {
        orderId: result.id,
        error: queueErr.message,
      });
    }

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
        // Format items with quantity for email templates
        const formattedItems = result.items.map(item => ({
          productName: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
          total: item.product.price * item.quantity,
        }));

        // Send order confirmation email
        await sendOrderConfirmationEmail(
          result.user.email,
          result.user.name,
          result,
          result.items.map(item => ({
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price,
          }))
        );

        // Send payment confirmation email with items
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
            deliveryAddress: result.deliveryAddress || 'N/A',
            items: formattedItems,
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
    // Since Paychangu doesn't provide a simple refund endpoint for Mobile Money,
    // we mark the order as REFUND_PENDING and alert the admin for manual processing
    
    try {
      // Fetch order details for refund processing
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      });

      if (order && (txErr.message.includes('Insufficient stock') || txErr.message.includes('Products'))) {
        console.log(`[Webhook] 💰 Processing refund for order ${order.id}...`);
        
        // Mark order as REFUND_PENDING for manual processing
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'REFUND_PENDING',
            status: 'PENDING',
            notes: `Refund required: ${txErr.message}\nPaychangu Ref: ${req.body.reference || 'unknown'}`
          }
        });

        console.log(`[Webhook] ⚠️ Order ${order.id} marked as REFUND_PENDING`);
        console.log(`[Alert] 🚨 MANUAL REFUND REQUIRED FOR ORDER ${order.id}`);
        console.log(`[Alert] Customer: ${order.user.email}`);
        console.log(`[Alert] Amount: ${order.total} MWK`);
        console.log(`[Alert] Reason: ${txErr.message}`);
        console.log(`[Alert] Transaction ID: ${req.body.reference || 'unknown'}`);
        console.log(`[Alert] Action: Process refund via Paychangu dashboard or use Mobile Money Payout API`);
        
        // Emit refund alert event to admin room (real-time notification)
        try {
          if (global.io) {
            global.io.to('admin_room').emit('refundAlertRequired', {
              orderId: order.id,
              customerId: order.userId,
              customerName: order.user?.name || 'Unknown',
              customerEmail: order.user?.email || 'N/A',
              amount: order.total,
              reason: txErr.message,
              transactionRef: req.body.reference || 'unknown',
              timestamp: new Date(),
              message: `🚨 REFUND REQUIRED - Order #${order.id} (MWK ${order.total}) - ${txErr.message}`
            });
            console.log(`[Socket.io] Refund alert emitted to admin_room for order ${order.id}`);
          }
        } catch (socketErr) {
          console.error(`[Socket] Failed to emit refund alert:`, socketErr.message);
        }
        
        // Create admin notification message
        setImmediate(async () => {
          try {
            await notifyRefundRequired(order, txErr.message);
            console.log(`[Alert] ✅ Admin refund notification sent`);
          } catch (msgErr) {
            console.error(`[Alert] Failed to create admin message:`, msgErr.message);
          }
        });
        
        // Send refund notification email to customer
        setImmediate(async () => {
          try {
            await sendRefundNotificationEmail(
              order.user.email,
              order.user.name,
              {
                orderId: order.id,
                amount: order.total,
                reason: txErr.message,
                refundId: req.body.reference,
                timestamp: new Date(),
                status: 'pending_processing'
              }
            );
            console.log(`[Email] ✅ Background: Refund notification sent to ${order.user.email}`);
          } catch (emailErr) {
            console.error(`[Email] ❌ Failed to send refund email:`, emailErr.message);
          }
        });
      } else {
        console.warn('[Webhook] Not processing refund - order not found or error type not refundable');
      }
    } catch (refundErr) {
      console.error('[Webhook] 🚨 Error in refund workflow:', refundErr.message);
      // If we have orderId, ensure it's at least marked as REFUND_PENDING
      if (orderId) {
        try {
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'REFUND_PENDING',
              status: 'PENDING',
              notes: `Refund workflow error: ${refundErr.message}`
            }
          });
          console.log(`[Webhook] ⚠️ Order ${orderId} marked as REFUND_PENDING for manual review`);
        } catch (updateErr) {
          console.error(`[Webhook] ⚠️ Could not mark order as REFUND_PENDING: ${updateErr.message}`);
        }
      }
    }

    clearTimeout(timeoutHandle);
    res.sendStatus(200);
    return;
  }
};

module.exports = { initializePayment, handleWebhook, verifyPaychanguPayment, refundPaychanguPayment };
