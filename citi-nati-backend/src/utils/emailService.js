const sgMail = require('@sendgrid/mail');

/**
 * Email Service - Handles all email operations using SendGrid
 * Centralized email sending with professional templates
 */

// Configuration
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'renewableenergyh@gmail.com';

// Initialize SendGrid
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('[SENDGRID] ✅ API key configured successfully');
  console.log('[SENDGRID] FROM_EMAIL env:', process.env.FROM_EMAIL);
  console.log('[SENDGRID] FROM_EMAIL used:', FROM_EMAIL);
} else {
  console.error('[SENDGRID] ❌ SENDGRID_API_KEY not found in environment variables');
}

/**
 * Generic Email Sending Function
 * All emails go through this function
 */
const sendEmail = async (to, subject, html) => {
  try {
    if (!SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured');
    }

    const msg = {
      to,
      from: FROM_EMAIL,
      subject,
      html,
    };

    console.log(`[EMAIL] Sending from: ${FROM_EMAIL}`);
    const result = await sgMail.send(msg);
    console.log(`[EMAIL] ✅ Email sent successfully to: ${to}`);
    return { success: true, messageId: result[0]?.headers?.['x-message-id'] };
  } catch (err) {
    console.error(`[EMAIL] ❌ Error sending email to ${to}:`, err.message);
    if (err.response) {
      console.error(`[EMAIL] SendGrid Error Details:`, err.response.body);
    }
    return { success: false, error: err.message };
  }
};

/**
 * Send Email Verification Code (Registration)
 * Code expires in 10 minutes
 */
const sendVerificationEmail = async (email, code) => {
  try {
    console.log('[EMAIL] Attempting to send verification email to:', email);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #5B4B8A; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Citi-Nati Supermarket</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Verify Your Email</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Thank you for registering with Citi-Nati Supermarket! Use the code below to verify your email address and complete your registration.
          </p>
          <div style="background-color: #fff; border: 2px solid #5B4B8A; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <p style="color: #999; margin: 0; font-size: 12px;">Verification Code</p>
            <p style="color: #5B4B8A; font-size: 36px; font-weight: bold; margin: 10px 0; letter-spacing: 5px;">${code}</p>
            <p style="color: #999; margin: 10px 0; font-size: 12px;">This code expires in 10 minutes</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            If you didn't register for this account, please ignore this email or contact support.
          </p>
        </div>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
          <p style="margin: 0;">© 2026 Citi-Nati Supermarket. All rights reserved.</p>
          <p style="margin: 5px 0 0 0;">This is an automated email, please do not reply.</p>
        </div>
      </div>
    `;

    return await sendEmail(email, 'Verify Your Citi-Nati Account', html);
  } catch (err) {
    console.error('[EMAIL] ❌ Error in sendVerificationEmail:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Send Password Reset Code
 * Code expires in 15 minutes
 */
const sendPasswordResetEmail = async (email, code) => {
  try {
    console.log('[EMAIL] Attempting to send password reset email to:', email);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #5B4B8A; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Citi-Nati Supermarket</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Reset Your Password</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            We received a request to reset your Citi-Nati Supermarket account password. Use the code below to reset your password.
          </p>
          <div style="background-color: #fff; border: 2px solid #5B4B8A; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <p style="color: #999; margin: 0; font-size: 12px;">Reset Code</p>
            <p style="color: #5B4B8A; font-size: 36px; font-weight: bold; margin: 10px 0; letter-spacing: 5px;">${code}</p>
            <p style="color: #999; margin: 10px 0; font-size: 12px;">This code expires in 15 minutes</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            If you didn't request a password reset, please ignore this email or contact support immediately.
          </p>
        </div>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
          <p style="margin: 0;">© 2026 Citi-Nati Supermarket. All rights reserved.</p>
          <p style="margin: 5px 0 0 0;">This is an automated email, please do not reply.</p>
        </div>
      </div>
    `;

    return await sendEmail(email, 'Reset Your Citi-Nati Password', html);
  } catch (err) {
    console.error('[EMAIL] ❌ Error in sendPasswordResetEmail:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Send Order Confirmation Email
 * Sent when order is successfully placed
 */
const sendOrderConfirmationEmail = async (email, userName, order, products) => {
  try {
    console.log('[EMAIL] Attempting to send order confirmation email to:', email);

    const productRows = products
      .map(
        (p) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${p.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${p.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">MWK ${(p.price * p.quantity).toLocaleString()}</td>
      </tr>
    `,
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #5B4B8A; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Citi-Nati Supermarket</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Order Confirmation</h2>
          <p style="color: #666;">Hi ${userName},</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Thank you for your order! We've received it and will process it shortly.
          </p>
          <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; margin: 0;"><strong>Order Number:</strong> #${order.id}</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #5B4B8A; color: white;">
                <th style="padding: 10px; text-align: left;">Product</th>
                <th style="padding: 10px; text-align: center;">Qty</th>
                <th style="padding: 10px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${productRows}
            </tbody>
          </table>
          <div style="text-align: right; padding-top: 15px; border-top: 2px solid #5B4B8A;">
            <p style="color: #333; font-size: 18px; font-weight: bold;"><strong>Total: MWK ${order.total.toLocaleString()}</strong></p>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            We'll send you another email when your order is out for delivery. You can track your order status in your account dashboard.
          </p>
        </div>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
          <p style="margin: 0;">© 2026 Citi-Nati Supermarket. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendEmail(email, `Order Confirmation - #${order.id}`, html);
  } catch (err) {
    console.error('[EMAIL] ❌ Error in sendOrderConfirmationEmail:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Send Payment Confirmation Email
 * Sent when payment is successfully processed
 */
const sendPaymentConfirmationEmail = async (email, userName, paymentDetails) => {
  try {
    console.log('[EMAIL] Attempting to send payment confirmation email to:', email);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #5B4B8A; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Citi-Nati Supermarket</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Payment Confirmed</h2>
          <p style="color: #666;">Hi ${userName},</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Your payment has been successfully processed.
          </p>
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #155724; margin: 0;">✓ Payment Received</p>
          </div>
          <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; margin: 0;"><strong>Amount:</strong> MWK ${paymentDetails.amount?.toLocaleString() || 'N/A'}</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Reference:</strong> ${paymentDetails.reference || 'N/A'}</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            Thank you for shopping with Citi-Nati Supermarket!
          </p>
        </div>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
          <p style="margin: 0;">© 2026 Citi-Nati Supermarket. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendEmail(email, 'Payment Confirmation', html);
  } catch (err) {
    console.error('[EMAIL] ❌ Error in sendPaymentConfirmationEmail:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Send Driver Assigned Email
 * Sent when a driver is assigned to the order
 */
const sendDriverAssignedEmail = async (email, userName, driverInfo, orderDetails) => {
  try {
    console.log('[EMAIL] Attempting to send driver assigned email to:', email);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #5B4B8A; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Citi-Nati Supermarket</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Your Order is On The Way!</h2>
          <p style="color: #666;">Hi ${userName},</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Great news! Your order has been assigned to a driver and is on its way to you.
          </p>
          <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; margin: 0;"><strong>Driver Name:</strong> ${driverInfo.name || 'N/A'}</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Driver Phone:</strong> ${driverInfo.phone || 'N/A'}</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Order ID:</strong> #${orderDetails.id}</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            You'll receive another notification when your order is about to arrive.
          </p>
        </div>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
          <p style="margin: 0;">© 2026 Citi-Nati Supermarket. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendEmail(email, 'Your Order is On The Way!', html);
  } catch (err) {
    console.error('[EMAIL] ❌ Error in sendDriverAssignedEmail:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Send Delivery Status Email
 * Sent when order is marked as delivered
 */
const sendDeliveryStatusEmail = async (email, userName, orderDetails, status) => {
  try {
    console.log('[EMAIL] Attempting to send delivery status email to:', email);

    const statusMessages = {
      delivered: 'Your Order Has Been Delivered',
      in_transit: 'Your Order is On The Way',
      cancelled: 'Your Order Has Been Cancelled',
    };

    const subject = statusMessages[status?.toLowerCase()] || `Order Update - ${status}`;
    const isDelivered = status?.toLowerCase() === 'delivered';
    const receiptUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/orders/${orderDetails.id}/receipt`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #5B4B8A; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Citi-Nati Supermarket</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Order Update</h2>
          <p style="color: #666;">Hi ${userName},</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            ${isDelivered ? '✓ Your order has been successfully delivered!' : status?.toLowerCase().includes('cancelled') ? 'Your order has been cancelled.' : 'Your order is on its way!'}
          </p>
          <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; margin: 0;"><strong>Order ID:</strong> #${orderDetails.id}</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Status:</strong> ${status.toUpperCase()}</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Delivery Address:</strong> ${orderDetails.deliveryAddress || 'N/A'}</p>
            ${orderDetails.totalPrice ? `<p style="color: #999; font-size: 12px; margin: 5px 0;"><strong>Total Amount:</strong> MWK ${orderDetails.totalPrice.toLocaleString()}</p>` : ''}
          </div>
          
          ${isDelivered ? `
            <div style="margin: 20px 0; padding: 15px; background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
              <p style="color: #2e7d32; font-size: 14px; margin: 0 0 10px 0;"><strong>📄 Download Your Receipt</strong></p>
              <p style="color: #555; font-size: 13px; margin: 0 0 15px 0;">Keep a copy of your receipt for your records and warranty information.</p>
              <a href="${receiptUrl}" style="display: inline-block; background-color: #4caf50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Download Receipt</a>
            </div>
          ` : ''}
          
          <p style="color: #666; font-size: 14px;">
            Thank you for choosing Citi-Nati Supermarket!
          </p>
        </div>
        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
          <p style="margin: 0;">© 2026 Citi-Nati Supermarket. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendEmail(email, subject, html);
  } catch (err) {
    console.error('[EMAIL] ❌ Error in sendDeliveryStatusEmail:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendPaymentConfirmationEmail,
  sendDriverAssignedEmail,
  sendDeliveryStatusEmail,
};
