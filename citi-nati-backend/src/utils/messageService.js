const { createMessage } = require('../controllers/admin-messages.controller.js');

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
const createSystemAlert = async (title, message) => {
  try {
    await createMessage('system', title, message);
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error creating system alert:', error);
  }
};

/**
 * Create message for low stock or out of stock warning
 */
const notifyLowStock = async (product) => {
  try {
    if (product.stock === 0) {
      // Out of stock notification
      await createMessage(
        'system',
        'Out of Stock Alert',
        `Product "${product.name}" is now out of stock.`
      );
    } else if (product.stock <= 10) {
      // Low stock notification
      await createMessage(
        'system',
        'Low Stock Alert',
        `Product "${product.name}" stock is running low (${product.stock} units remaining).`
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
      order.id // reference_id
    );
  } catch (error) {
    console.error('[MESSAGE SERVICE] Error notifying refund required:', error);
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
};
