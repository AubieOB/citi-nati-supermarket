const { createMessage } = require('../controllers/admin-messages.controller.js');
const { enrichProductStock, DEFAULT_LOW_STOCK_THRESHOLD } = require('./stockResolver');

const DEFAULT_SYSTEM_ALERT_RECURRENCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const parsedSystemAlertRecurrenceWindowMs = Number(process.env.SYSTEM_ALERT_RECURRENCE_WINDOW_MS || DEFAULT_SYSTEM_ALERT_RECURRENCE_WINDOW_MS);
const SYSTEM_ALERT_RECURRENCE_WINDOW_MS = Number.isFinite(parsedSystemAlertRecurrenceWindowMs) && parsedSystemAlertRecurrenceWindowMs > 0
  ? parsedSystemAlertRecurrenceWindowMs
  : DEFAULT_SYSTEM_ALERT_RECURRENCE_WINDOW_MS;

/**
 * Admin Message Service
 * Creates admin inbox messages for various system events
 */

/**
 * Create message when new user registers
 */
const notifyNewUserRegistration = async (user) => {
  try {
    await createMessage(
      'new_user',
      'New User Registration',
      `User "${user.name}" (${user.email}) has registered successfully.`
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying new user:', error);
  }
};

/**
 * Create message when payment is successful
 */
const notifyPaymentSuccess = async (order, paymentDetails) => {
  try {
    const amount = order.total || 0;
    const paymentRef = order.paymentReference || 'N/A';
    
    await createMessage(
      'payment_success',
      'Payment Confirmation',
      `Payment of MWK ${amount.toFixed(2)} for Order #${order.id} confirmed${paymentRef ? `. Reference: ${paymentRef}` : ''}.`
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying payment success:', error);
  }
};

/**
 * Create message when order is placed
 */
const notifyOrderPlaced = async (order, itemCount) => {
  try {
    const amount = order.total || 0;
    
    await createMessage(
      'order_placed',
      'New Order',
      `Order #${order.id} placed. Total: MWK ${amount.toFixed(2)}. Items: ${itemCount}.`
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying order placed:', error);
  }
};

/**
 * Create message when driver is assigned
 */
const notifyDriverAssigned = async (order, driver) => {
  try {
    const driverName = driver?.name || 'Unknown Driver';
    let message = `Driver "${driverName}" assigned to Order #${order.id}.`;
    
    if (driver?.phone) {
      message += ` Phone: ${driver.phone}`;
    }
    
    await createMessage(
      'driver_assigned',
      'Driver Assigned',
      message
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying driver assigned:', error);
  }
};

/**
 * Create message when order is completed
 */
const notifyOrderCompleted = async (order) => {
  try {
    await createMessage(
      'order_completed',
      'Order Completed',
      `Order #${order.id} has been delivered successfully.`
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying order completed:', error);
  }
};

/**
 * Create message when payment fails
 */
const notifyPaymentFailed = async (order, reason) => {
  try {
    const reasonText = reason || 'Payment processing failed';
    
    await createMessage(
      'payment_failed',
      'Payment Failed',
      `Payment attempt for Order #${order.id} failed. Error: ${reasonText}. Contact customer.`
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying payment failed:', error);
  }
};

/**
 * Create system alert message
 */
const createSystemAlert = async (title, message, options = {}) => {
  try {
    await createMessage('system', title, message, {
      sourceModule: 'system',
      recurrenceWindowMs: SYSTEM_ALERT_RECURRENCE_WINDOW_MS,
      ...options,
    });
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error creating system alert:', error);
  }
};

/**
 * Create message for low stock or out of stock warning
 * ✅ Supports POS products even without images (sourceCode products)
 * Uses per-product threshold against effective stock.
 */
const notifyLowStock = async (product) => {
  try {
    const stock = enrichProductStock(product);
    const entityId = stock.id || stock.sourceCode || stock.barcode || stock.name;
    const branchCode = stock.branchCode || stock.locationCode || stock.locationId || null;
    const sourceModule = stock.sourceCode ? 'pos_inventory' : 'inventory';
    const commonOptions = {
      sourceModule,
      entityType: 'product',
      entityId: entityId != null ? String(entityId) : null,
      branchCode: branchCode != null ? String(branchCode) : null,
      recurrenceWindowMs: SYSTEM_ALERT_RECURRENCE_WINDOW_MS,
      errorCode: stock.stock_status,
      dedupeKey: [
        'system',
        sourceModule,
        'product',
        entityId != null ? String(entityId) : '',
        branchCode != null ? String(branchCode) : '',
        stock.stock_status || '',
      ].join('|').toLowerCase(),
      statusMetadata: {
        stockStatus: stock.stock_status,
        effectiveStock: stock.effective_stock,
        lowStockThreshold: stock.low_stock_threshold,
        sourceCode: stock.sourceCode || null,
      },
    };

    // Build message with POS indicator if applicable
    const isPOSProduct = !!stock.sourceCode;
    const posIndicator = isPOSProduct ? ' [POS]' : '';
    
    if (stock.stock_status === 'out_of_stock') {
      // Out of stock notification - Works for all products including POS without images
      await createMessage(
        'system',
        `Out of Stock Alert${posIndicator}`,
        `Product "${stock.name}"${posIndicator} is now out of stock.${isPOSProduct ? ` (POS Code: ${stock.sourceCode})` : ''}`,
        commonOptions
      );
    } else if (stock.stock_status === 'low_stock') {
      // Low stock notification - Works for all products including POS without images
      await createMessage(
        'system',
        `Low Stock Alert${posIndicator}`,
        `Product "${stock.name}"${posIndicator} stock is running low (${stock.effective_stock} units remaining, threshold ${stock.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD}).${isPOSProduct ? ` (POS Code: ${stock.sourceCode})` : ''}`,
        commonOptions
      );
    }
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying low stock:', error);
  }
};

/**
 * Create message when refund is required (payment succeeded but fulfillment failed)
 */
const notifyRefundRequired = async (order, reason) => {
  try {
    const reasonText = reason || 'Order could not be fulfilled after payment received';
    const message = `🚨 REFUND REQUIRED\nOrder #${order.id} for ${order.user?.name || 'Unknown'} (${order.user?.email || 'N/A'})\nAmount: MWK ${order.total?.toFixed(2) || '0'}\nReason: ${reasonText}\n\nTransaction Ref: ${order.paymentReference || 'unknown'}\n\nAction: Review in Refunds panel and process through PayChangu dashboard.`;
    
    await createMessage(
      'refund_required',
      '⚠️ Refund Pending - Manual Processing Required',
      message,
      {
        sourceModule: 'refunds',
        entityType: 'order',
        entityId: order?.id != null ? String(order.id) : null,
        errorCode: 'refund_required',
        dedupeKey: `refund_required|refunds|order|${order?.id != null ? String(order.id) : 'unknown'}|refund_required`,
        statusMetadata: {
          paymentReference: order?.paymentReference || null,
          orderTotal: order?.total ?? null,
        },
      }
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying refund required:', error);
  }
};

const notifySupportTicketCreated = async (ticket) => {
  try {
    const subject = ticket?.subject || 'New Support Ticket';
    const userName = ticket?.user?.name || ticket?.userName || 'Unknown User';
    const userEmail = ticket?.user?.email || ticket?.userEmail || 'N/A';
    const preview = String(ticket?.message || '').trim();
    const clippedPreview = preview.length > 140 ? `${preview.slice(0, 140)}...` : preview;

    await createMessage(
      'support_ticket',
      `New Support Ticket: ${subject}`,
      `From: ${userName} (${userEmail})${clippedPreview ? `\n${clippedPreview}` : ''}`,
      {
        sourceModule: 'support',
        entityType: 'support_ticket',
        entityId: ticket?.id != null ? String(ticket.id) : null,
        errorCode: 'support_ticket_open',
        dedupeKey: `support_ticket|support|ticket|${ticket?.id != null ? String(ticket.id) : 'unknown'}|open`,
        statusMetadata: {
          priority: ticket?.priority || null,
          status: ticket?.status || null,
          userId: ticket?.user?.id || ticket?.userId || null,
        },
      }
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying support ticket created:', error);
  }
};

module.exports = {
  notifyNewUserRegistration,
  notifyPaymentSuccess,
  notifyOrderPlaced,
  notifyDriverAssigned,
  notifyOrderCompleted,
  notifyPaymentFailed,
  notifyLowStock,
  createSystemAlert,
  notifyRefundRequired,
  notifySupportTicketCreated,
};
