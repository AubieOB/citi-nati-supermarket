# Email Integration Guide - Orders, Payments & Delivery

## Overview

The email service is ready to send transactional emails for orders, payments, and delivery updates. This guide shows how to integrate these emails with your existing endpoints.

## Integration Points

### 1. Order Confirmation Email

#### Location to Integrate
Update your order creation endpoint (likely in `src/controllers/orders.controller.js`)

#### Integration Code
```javascript
const { sendOrderConfirmationEmail } = require('../utils/emailService');

// In your order creation function, after order is successfully created:
const createOrder = async (req, res) => {
  try {
    // ... existing order creation logic ...
    
    // After order is saved to database:
    const newOrder = await prisma.order.create({
      data: {
        userId: req.user.id,
        // ... other order fields
      },
      include: {
        items: true,
        user: true,
      },
    });

    // Fetch products for email template
    const products = await prisma.product.findMany({
      where: {
        id: {
          in: newOrder.items.map(item => item.productId),
        },
      },
    });

    // Send confirmation email
    await sendOrderConfirmationEmail(
      newOrder.user.email,
      newOrder.user.name,
      newOrder,
      products
    );

    // Return response
    res.status(201).json({
      message: 'Order created successfully',
      order: newOrder,
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
};
```

#### Expected Email Content
- Order number
- Itemized list with quantities and prices
- Total amount
- Delivery address
- Estimated delivery date
- Order tracking link
- Support contact info

---

### 2. Payment Confirmation Email

#### Location to Integrate
Update your payment endpoint (likely in `src/controllers/payments.controller.js` or order controller)

#### Integration Code
```javascript
const { sendPaymentConfirmationEmail } = require('../utils/emailService');

// In your payment success handler:
const handlePaymentSuccess = async (req, res) => {
  try {
    // ... existing payment processing logic ...
    
    // After payment is confirmed:
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { 
        paymentStatus: 'PAID',
        paymentDate: new Date(),
        paymentReference: paychanguReference,
      },
      include: {
        user: true,
      },
    });

    // Send payment confirmation email
    const paymentDetails = {
      orderId: updatedOrder.id,
      amount: updatedOrder.totalPrice,
      currency: 'NGN',
      method: 'Card/Bank Transfer', // or actual payment method
      date: updatedOrder.paymentDate,
      reference: paychanguReference,
      status: 'COMPLETED',
    };

    await sendPaymentConfirmationEmail(
      updatedOrder.user.email,
      updatedOrder.user.name,
      paymentDetails
    );

    // Return response
    res.status(200).json({
      message: 'Payment confirmed',
      order: updatedOrder,
    });
  } catch (err) {
    console.error('Error confirming payment:', err);
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
};
```

#### Expected Email Content
- Payment confirmation
- Amount paid
- Payment method used
- Transaction reference/ID
- Invoice details
- Order summary
- Next steps info

---

### 3. Delivery Status Email

#### Location to Integrate
Update your driver delivery endpoint (likely in `src/controllers/driver.controller.js` or delivery status endpoint)

#### Integration Code
```javascript
const { sendDeliveryStatusEmail } = require('../utils/emailService');

// When driver updates delivery status:
const updateDeliveryStatus = async (req, res) => {
  try {
    const { orderId, status, driverNotes } = req.body;
    // status options: 'PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED'

    // ... existing status update logic ...
    
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { 
        deliveryStatus: status,
        updatedAt: new Date(),
      },
      include: {
        user: true,
        driver: true,
      },
    });

    // Only send email for significant status changes
    if (['IN_TRANSIT', 'DELIVERED', 'FAILED'].includes(status)) {
      const orderDetails = {
        orderId: updatedOrder.id,
        totalPrice: updatedOrder.totalPrice,
        deliveryAddress: updatedOrder.deliveryAddress,
        items: updatedOrder.items?.length || 0,
      };

      const driverInfo = updatedOrder.driver ? {
        name: updatedOrder.driver.name,
        phone: updatedOrder.driver.phoneNumber,
        vehicle: updatedOrder.driver.vehicleInfo,
      } : null;

      await sendDeliveryStatusEmail(
        updatedOrder.user.email,
        updatedOrder.user.name,
        orderDetails,
        status,
        driverInfo // Optional driver contact info
      );
    }

    // Return response
    res.status(200).json({
      message: 'Delivery status updated',
      order: updatedOrder,
    });
  } catch (err) {
    console.error('Error updating delivery status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
};
```

#### Status Update Sequence
1. **PENDING** → Order created, awaiting pickup (email: confirmation already sent)
2. **IN_TRANSIT** → Driver picked up and is on way (email: "On the way!")
3. **DELIVERED** → Order delivered successfully (email: "Delivered!")
4. **FAILED** → Delivery failed/attempted (email: "Delivery issue")

#### Expected Email Content (per status)
- Order number
- Current status with timestamp
- Driver name and contact (if in transit/delivered)
- Estimated delivery time (if in transit)
- Delivery address
- Support contact for issues

---

## Email Service Function Signatures

### sendOrderConfirmationEmail()
```javascript
sendOrderConfirmationEmail(
  email,           // string: user email
  userName,        // string: user name
  order,           // object: { id, totalPrice, deliveryAddress, createdAt, ... }
  products         // array: [{ id, name, price, description, ... }]
)
```

### sendPaymentConfirmationEmail()
```javascript
sendPaymentConfirmationEmail(
  email,                  // string: user email
  userName,               // string: user name
  paymentDetails          // object: { 
                          //   orderId, amount, currency, method, 
                          //   date, reference, status 
                          // }
)
```

### sendDeliveryStatusEmail()
```javascript
sendDeliveryStatusEmail(
  email,                  // string: user email
  userName,               // string: user name
  orderDetails,           // object: { orderId, totalPrice, deliveryAddress, items }
  status,                 // string: 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'
  driverInfo              // object (optional): { name, phone, vehicle }
)
```

---

## Testing Email Integration

### Step 1: Test Order Email
```bash
# Create test order through your API
POST /api/orders
{
  "items": [
    { "productId": "1", "quantity": 2 },
    { "productId": "2", "quantity": 1 }
  ],
  "deliveryAddress": "123 Test Street, City"
}

# Check email inbox for order confirmation with:
# - Order number
# - Item list
# - Total price
# - Delivery address
```

### Step 2: Test Payment Email
```bash
# Complete payment through your endpoint
POST /api/payments/confirm
{
  "orderId": "order-123",
  "paymentReference": "paychangu-ref-123"
}

# Check email for payment confirmation with:
# - Amount paid
# - Payment reference
# - Order summary
```

### Step 3: Test Delivery Email
```bash
# Update delivery status
PUT /api/orders/order-123/delivery-status
{
  "status": "IN_TRANSIT",
  "driverNotes": "Picked up, on the way"
}

# Check email for delivery update
```

---

## Error Handling

### If Email Fails to Send
Add try-catch around email calls to prevent order failure:

```javascript
try {
  await sendOrderConfirmationEmail(email, userName, order, products);
} catch (err) {
  console.error('Failed to send confirmation email:', err);
  // Log to database for manual retry
  // Don't throw - order should still be created
  // Alert admin to check email service
}
```

### Retry Logic (Optional)
Implement email retry for critical emails:

```javascript
async function sendEmailWithRetry(emailFn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await emailFn();
    } catch (err) {
      console.error(`Email send attempt ${i + 1} failed:`, err);
      if (i < maxRetries - 1) {
        // Wait before retry (exponential backoff)
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
  }
  throw new Error('Failed to send email after retries');
}

// Usage:
await sendEmailWithRetry(() => 
  sendOrderConfirmationEmail(email, userName, order, products)
);
```

---

## Email Service Status

### Current Status
- ✅ Email templates created
- ✅ Nodemailer configured
- ✅ SMTP settings in .env
- ⏳ Order email integration (ready to integrate)
- ⏳ Payment email integration (ready to integrate)
- ⏳ Delivery email integration (ready to integrate)

### Next Steps
1. Copy integration code above into your endpoints
2. Test with actual Gmail credentials
3. Monitor email delivery success rates
4. Set up email logs/monitoring
5. Consider switching to SendGrid/Mailgun for production

---

## Production Deployment

### Switch from Gmail to SendGrid (Recommended)

1. **Install SendGrid package**
```bash
npm install @sendgrid/mail
```

2. **Update emailService.js**
```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const transporter = {
  send: async (mailOptions) => {
    return await sgMail.send({
      to: mailOptions.to,
      from: mailOptions.from,
      subject: mailOptions.subject,
      html: mailOptions.html,
    });
  }
};
```

3. **Update .env**
```
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@citinati.com
```

### Benefits of SendGrid over Gmail
- Unlimited emails per day (Gmail: ~500)
- Better delivery rates
- Email analytics
- Webhook delivery status
- Support for templates
- API-based (more reliable)
- Better for production

---

## Monitoring & Logging

### Add Email Logging
```javascript
// In emailService.js, log all email sends:
async function logEmailSend(email, subject, type) {
  await prisma.emailLog.create({
    data: {
      recipient: email,
      subject,
      type, // 'ORDER', 'PAYMENT', 'DELIVERY', 'VERIFICATION'
      sentAt: new Date(),
      status: 'SENT',
    }
  });
}

// Update all sendXEmail functions to include logging
```

### Monitor Success Rates
```javascript
// Check email delivery stats
const lastDay = await prisma.emailLog.findMany({
  where: {
    sentAt: {
      gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }
  }
});

const successRate = (
  lastDay.filter(e => e.status === 'SENT').length / lastDay.length
) * 100;
```

---

**Status**: Ready for Integration
**Priority**: High (improves user communication)
**Estimated Implementation Time**: 30 minutes per integration point
