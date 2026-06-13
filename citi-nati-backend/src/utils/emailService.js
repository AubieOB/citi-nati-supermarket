/**
 * Email Service - Handles all customer email operations using provider abstraction.
 * All templates share one simple Citi-Nati branded shell.
 */

const fs = require('fs');
const path = require('path');
const mailProvider = require('../services/mailProvider');
const logger = require('../utils/logger');

const BRAND = {
  green: '#12B600',
  greenDark: '#078A00',
  blue: '#0638DC',
  blueDark: '#052AA6',
  text: '#142033',
  muted: '#536278',
  border: '#E0E7F0',
  background: '#F7F9FC',
  surface: '#FFFFFF',
  danger: '#C62828',
};

const LOGO_CID = 'citi-nati-full-logo@citi-nati';
const LOGO_PATH = path.join(__dirname, '..', '..', 'uploads', 'branding', 'citi-nati-full-logo.original.png');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMoney = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `MWK ${numeric.toLocaleString()}` : 'MWK 0';
};

const formatDate = (value = new Date()) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toLocaleDateString() : date.toLocaleDateString();
};

const normalizeItem = (item) => {
  const quantity = Number(item.quantity ?? 0);
  const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
  const subtotal = Number(item.subtotal ?? item.total ?? quantity * unitPrice);
  return {
    name: item.name || item.productName || item.product?.name || 'Item',
    quantity,
    unitPrice,
    subtotal,
  };
};

const renderInfoRows = (rows) =>
  rows
    .filter((row) => row.value !== undefined && row.value !== null && row.value !== '')
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 0;color:${BRAND.muted};font-size:13px;width:38%;">${escapeHtml(row.label)}</td>
          <td style="padding:8px 0;color:${BRAND.text};font-size:13px;font-weight:700;">${escapeHtml(row.value)}</td>
        </tr>
      `,
    )
    .join('');

const renderInfoBox = (rows) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;margin:18px 0;padding:6px 16px;">
    ${renderInfoRows(rows)}
  </table>
`;

const renderItemsTable = (items = []) => {
  const rows = items.map(normalizeItem);

  if (!rows.length) {
    return '';
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:${BRAND.blue};">
          <th align="left" style="padding:10px;color:#ffffff;font-size:12px;">Product</th>
          <th align="center" style="padding:10px;color:#ffffff;font-size:12px;">Qty</th>
          <th align="right" style="padding:10px;color:#ffffff;font-size:12px;">Unit Price</th>
          <th align="right" style="padding:10px;color:#ffffff;font-size:12px;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (item) => `
              <tr>
                <td style="padding:10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;">${escapeHtml(item.name)}</td>
                <td align="center" style="padding:10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;">${escapeHtml(item.quantity)}</td>
                <td align="right" style="padding:10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;">${escapeHtml(formatMoney(item.unitPrice))}</td>
                <td align="right" style="padding:10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;font-weight:700;">${escapeHtml(formatMoney(item.subtotal))}</td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `;
};

const renderTemplate = ({ title, intro, body = '', accent = BRAND.blue }) => {
  const logo = `<img src="cid:${LOGO_CID}" alt="Citi-Nati Supermarket" width="360" style="display:block;width:360px;max-width:94%;height:auto;margin:0 auto;" />`;

  return `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:${BRAND.background};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background};padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 24px 12px;text-align:center;">
                    ${logo}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 26px;">
                    <div style="height:4px;background:${accent};border-radius:999px;margin:10px 0 22px;"></div>
                    <h1 style="margin:0 0 12px;color:${BRAND.text};font-size:22px;line-height:1.3;">${escapeHtml(title)}</h1>
                    ${intro ? `<p style="margin:0 0 16px;color:${BRAND.muted};font-size:15px;line-height:1.65;">${intro}</p>` : ''}
                    ${body}
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 24px;background:#F0F5FF;border-top:1px solid ${BRAND.border};text-align:center;">
                    <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.5;">&copy; ${new Date().getFullYear()} Citi-Nati Supermarket. All rights reserved.</p>
                    <p style="margin:4px 0 0;color:${BRAND.muted};font-size:12px;line-height:1.5;">This is an automated email. Please do not reply.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

/**
 * Generic Email Sending Function
 * Provider is selected via MAIL_PROVIDER environment variable.
 */
const sendEmail = async (to, subject, html) => {
  try {
    const provider = mailProvider.getMailProvider();
    const attachments = getLogoAttachment();
    const result = await provider.send({ to, subject, html, attachments });

    logger.infoLog(`Email sent successfully to: ${to}`, {
      subject,
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (err) {
    logger.errorLog(`Error sending email to ${to}`, {
      subject,
      error: err.message || err.code,
    });

    const safeUserMessage = err?.userMessage || err?.message || 'Email service is temporarily unavailable. Please try again later.';

    return {
      success: false,
      error: err.originalError || err.message,
      errorCode: err.code || 'EMAIL_SEND_FAILED',
      userMessage: safeUserMessage,
    };
  }
};

const getLogoAttachment = () => {
  try {
    if (!fs.existsSync(LOGO_PATH)) {
      logger.warnLog('[EMAIL] Citi-Nati email logo asset is missing', { path: LOGO_PATH });
      return [];
    }

    return [
      {
        filename: 'citi-nati-full-logo.original.png',
        path: LOGO_PATH,
        content: fs.readFileSync(LOGO_PATH).toString('base64'),
        contentType: 'image/png',
        cid: LOGO_CID,
        disposition: 'inline',
      },
    ];
  } catch (err) {
    logger.warnLog('[EMAIL] Failed to attach Citi-Nati email logo', { error: err.message });
    return [];
  }
};

const renderCodeBox = (label, code, expiresText) => `
  <div style="background:${BRAND.surface};border:2px solid ${BRAND.blue};padding:20px;text-align:center;border-radius:8px;margin:20px 0;">
    <p style="color:${BRAND.muted};margin:0;font-size:12px;">${escapeHtml(label)}</p>
    <p style="color:${BRAND.blue};font-size:34px;font-weight:900;margin:10px 0;letter-spacing:5px;">${escapeHtml(code)}</p>
    <p style="color:${BRAND.muted};margin:10px 0 0;font-size:12px;">${escapeHtml(expiresText)}</p>
  </div>
`;

const sendVerificationEmail = async (email, code) => {
  try {
    logger.debugLog('Sending verification email', { email });
    const html = renderTemplate({
      title: 'Verify Your Email',
      intro: 'Thank you for registering with Citi-Nati Supermarket. Use the code below to verify your email address and complete your registration.',
      body: `
        ${renderCodeBox('Verification Code', code, 'This code expires in 10 minutes.')}
        <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;">If you did not register for this account, you can safely ignore this email or contact support.</p>
      `,
    });

    return await sendEmail(email, 'Verify Your Citi-Nati Account', html);
  } catch (err) {
    logger.errorLog('Error in sendVerificationEmail', { error: err.message, email });
    return { success: false, error: err.message };
  }
};

const sendPasswordResetEmail = async (email, code) => {
  try {
    logger.debugLog('Sending password reset email', { email });
    const html = renderTemplate({
      title: 'Reset Your Password',
      intro: 'We received a request to reset your Citi-Nati Supermarket account password. Use the code below to continue.',
      body: `
        ${renderCodeBox('Reset Code', code, 'This code expires in 15 minutes.')}
        <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;">If you did not request a password reset, you can safely ignore this email or contact support.</p>
      `,
    });

    return await sendEmail(email, 'Reset Your Citi-Nati Password', html);
  } catch (err) {
    logger.errorLog('Error in sendPasswordResetEmail', { error: err.message, email });
    return { success: false, error: err.message };
  }
};

const sendOrderConfirmationEmail = async (email, userName, order, products = []) => {
  try {
    logger.debugLog('Sending order confirmation email', { email, orderId: order.id });
    const total = order.finalTotalAmount ?? order.total;
    const html = renderTemplate({
      title: 'Order Confirmed',
      intro: `Hi ${escapeHtml(userName)}, your order has been received and is being processed.`,
      body: `
        ${renderInfoBox([
          { label: 'Order Number', value: `#${order.id}` },
          { label: 'Order Date', value: formatDate(order.createdAt || new Date()) },
          { label: 'Delivery Address', value: order.deliveryAddress },
        ])}
        ${renderItemsTable(products)}
        <p style="text-align:right;color:${BRAND.text};font-size:17px;font-weight:900;margin:16px 0;">Total: ${escapeHtml(formatMoney(total))}</p>
        <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;">We will let you know when delivery begins.</p>
      `,
    });

    return await sendEmail(email, `Order Confirmation - #${order.id}`, html);
  } catch (err) {
    logger.errorLog('Error in sendOrderConfirmationEmail', { error: err.message, email, orderId: order.id });
    return { success: false, error: err.message };
  }
};

const sendPaymentConfirmationEmail = async (email, userName, paymentDetails) => {
  try {
    logger.debugLog('Sending payment confirmation email', { email, orderId: paymentDetails.orderId });
    const html = renderTemplate({
      title: 'Payment Confirmed',
      intro: `Hi ${escapeHtml(userName)}, your payment has been received. Your order is being prepared.`,
      body: `
        ${renderInfoBox([
          { label: 'Order Number', value: `#${paymentDetails.orderId || 'N/A'}` },
          { label: 'Payment Reference', value: paymentDetails.reference || 'N/A' },
          { label: 'Amount Paid', value: formatMoney(paymentDetails.amount) },
          { label: 'Payment Status', value: 'Paid' },
          { label: 'Delivery Address', value: paymentDetails.deliveryAddress || 'N/A' },
        ])}
        ${renderItemsTable(paymentDetails.items || [])}
        <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;">You can track your order from your Citi-Nati account.</p>
      `,
      accent: BRAND.green,
    });

    return await sendEmail(email, 'Payment Confirmation', html);
  } catch (err) {
    logger.errorLog('Error in sendPaymentConfirmationEmail', { error: err.message, email });
    return { success: false, error: err.message };
  }
};

const getDriverPhone = (driverInfo = {}) => {
  const phone = driverInfo.phone || driverInfo.phoneNumber || driverInfo.mobile || driverInfo.user?.phone;
  return phone ? String(phone) : 'Phone not provided';
};

const sendDriverAssignedEmail = async (email, userName, driverInfo, orderDetails) => {
  try {
    logger.debugLog('Sending driver assigned email', { email, orderId: orderDetails.id });
    const html = renderTemplate({
      title: 'Driver Assigned to Your Order',
      intro: `Hi ${escapeHtml(userName)}, a driver has been assigned to your order. Delivery will begin shortly.`,
      body: `
        ${renderInfoBox([
          { label: 'Order Number', value: `#${orderDetails.id}` },
          { label: 'Delivery Status', value: 'Driver assigned' },
          { label: 'Driver Name', value: driverInfo.name || 'Driver assigned' },
          { label: 'Driver Phone', value: getDriverPhone(driverInfo) },
          { label: 'Delivery Address', value: orderDetails.deliveryAddress },
        ])}
        <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;">We will send another update when your driver starts delivery.</p>
      `,
    });

    return await sendEmail(email, 'Driver Assigned to Your Order', html);
  } catch (err) {
    logger.errorLog('Error in sendDriverAssignedEmail', { error: err.message, email });
    return { success: false, error: err.message };
  }
};

const deliveryStatusCopy = {
  in_transit: {
    subject: 'Your Order Is On The Way',
    title: 'Your Order Is On The Way',
    message: 'Your driver has started delivery and is on the way to your address.',
    status: 'Out for delivery',
    accent: BRAND.blue,
  },
  delivered: {
    subject: 'Order Delivered Successfully',
    title: 'Order Delivered Successfully',
    message: 'Your order has been delivered successfully. Thank you for shopping with Citi-Nati.',
    status: 'Delivered',
    accent: BRAND.green,
  },
  failed: {
    subject: 'Delivery Update for Your Order',
    title: 'Delivery Update',
    message: 'We could not complete this delivery. Our team will review the order and follow up.',
    status: 'Delivery issue reported',
    accent: BRAND.danger,
  },
  cancelled: {
    subject: 'Order Cancelled',
    title: 'Order Cancelled',
    message: 'Your order has been cancelled. If you have questions, please contact support.',
    status: 'Cancelled',
    accent: BRAND.danger,
  },
};

const sendDeliveryStatusEmail = async (email, userName, orderDetails, status) => {
  try {
    logger.debugLog('Sending delivery status email', { email, orderId: orderDetails.id, status });
    const normalizedStatus = String(status || '').toLowerCase();
    const copy = deliveryStatusCopy[normalizedStatus] || {
      subject: 'Order Status Updated',
      title: 'Order Status Updated',
      message: 'Your order status has been updated.',
      status: status || 'Updated',
      accent: BRAND.blue,
    };

    const frontendUrl = process.env.FRONTEND_URL || (process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL.replace(':5000', ':3000') : '');
    const dashboardLink = frontendUrl ? `${frontendUrl.replace(/\/+$/, '')}/my-orders` : '';
    const driver = orderDetails.driver || {};
    const html = renderTemplate({
      title: copy.title,
      intro: `Hi ${escapeHtml(userName)}, ${escapeHtml(copy.message)}`,
      body: `
        ${renderInfoBox([
          { label: 'Order Number', value: `#${orderDetails.id}` },
          { label: 'Delivery Status', value: copy.status },
          { label: 'Delivery Address', value: orderDetails.deliveryAddress || 'N/A' },
          { label: 'Driver Name', value: driver.name },
          { label: 'Driver Phone', value: driver.name ? getDriverPhone(driver) : undefined },
          { label: 'Total Amount', value: orderDetails.totalPrice ? formatMoney(orderDetails.totalPrice) : undefined },
        ])}
        ${
          normalizedStatus === 'delivered' && dashboardLink
            ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(dashboardLink)}" style="display:inline-block;background:${BRAND.green};color:#ffffff;padding:11px 18px;text-decoration:none;border-radius:6px;font-weight:800;">View My Orders</a></p>`
            : ''
        }
      `,
      accent: copy.accent,
    });

    return await sendEmail(email, copy.subject, html);
  } catch (err) {
    logger.errorLog('Error in sendDeliveryStatusEmail', { error: err.message, email, orderId: orderDetails.id, status });
    return { success: false, error: err.message };
  }
};

const sendDriverChangedEmail = async (email, userName, oldDriverInfo, newDriverInfo, orderDetails, reason) => {
  try {
    logger.debugLog('Sending driver changed email', { email, orderId: orderDetails.id });
    const html = renderTemplate({
      title: 'Delivery Driver Updated',
      intro: `Hi ${escapeHtml(userName)}, we have updated the driver assigned to your order.`,
      body: `
        ${renderInfoBox([
          { label: 'Order Number', value: `#${orderDetails.id}` },
          { label: 'Previous Driver', value: oldDriverInfo?.name || 'Previous driver' },
          { label: 'New Driver', value: newDriverInfo?.name || 'New driver assigned' },
          { label: 'New Driver Phone', value: getDriverPhone(newDriverInfo) },
          { label: 'Reason', value: reason || 'Operational reassignment' },
          { label: 'Delivery Address', value: orderDetails.deliveryAddress || 'N/A' },
          { label: 'Total Amount', value: orderDetails.totalPrice ? formatMoney(orderDetails.totalPrice) : undefined },
        ])}
        <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;">Your delivery remains active. We will send another update when the driver starts delivery.</p>
      `,
      accent: BRAND.blue,
    });

    return await sendEmail(email, 'Delivery Driver Updated - Order #' + orderDetails.id, html);
  } catch (err) {
    logger.errorLog('Error in sendDriverChangedEmail', { error: err.message, email, orderId: orderDetails.id });
    return { success: false, error: err.message };
  }
};

const sendRefundNotificationEmail = async (email, userName, refundDetails) => {
  try {
    logger.debugLog('Sending refund notification email', { email, orderId: refundDetails.orderId });
    const html = renderTemplate({
      title: 'Order Refund Processed',
      intro: `Hi ${escapeHtml(userName)}, we were unable to complete your order and have started the refund process.`,
      body: `
        ${renderInfoBox([
          { label: 'Order Number', value: `#${refundDetails.orderId}` },
          { label: 'Refund Amount', value: formatMoney(refundDetails.amount) },
          { label: 'Refund ID', value: refundDetails.refundId || 'Processing' },
          { label: 'Reason', value: refundDetails.reason || 'Order could not be completed' },
          { label: 'Processed', value: refundDetails.timestamp ? new Date(refundDetails.timestamp).toLocaleString() : 'Today' },
        ])}
        <p style="color:${BRAND.muted};font-size:13px;line-height:1.6;">Funds should appear in your account within the payment provider timeline. Please contact support if you need help.</p>
      `,
      accent: BRAND.danger,
    });

    return await sendEmail(email, 'Payment Refunded - Order #' + refundDetails.orderId, html);
  } catch (err) {
    logger.errorLog('Error in sendRefundNotificationEmail', { error: err.message, email, orderId: refundDetails.orderId });
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
  sendDriverChangedEmail,
  sendDeliveryStatusEmail,
  sendRefundNotificationEmail,
};
