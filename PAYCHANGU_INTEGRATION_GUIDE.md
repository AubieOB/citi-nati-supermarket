# Paychangu Payment Integration - Implementation Guide

## 🎯 Overview

Your Citi-Nati Supermarket now has a **secure, production-ready Paychangu payment integration**. Payment processing is **server-verified** - never trusted from the frontend.

---

## 📋 What Was Implemented

### Backend Changes
✅ **Order Model Updates** - Added `paymentReference` field to track payments  
✅ **Payment Flow** - Orders created with status `PENDING_PAYMENT` until payment confirmed  
✅ **Initialization Endpoint** - `POST /payments/initialize` calls actual Paychangu API  
✅ **Webhook Handler** - `POST /payments/webhook` verifies & processes payments securely  
✅ **Socket.io Integration** - Emits `newOrder` to admin_room ONLY after payment confirmed  
✅ **Order Lookup** - `GET /orders/by-reference/:reference` for payment success page  

### Frontend Changes
✅ **Updated Checkout** - Creates order → initializes payment → redirects to Paychangu  
✅ **Payment Success Page** - Polls backend to verify payment, redirects to order tracking  
✅ **Route Added** - `/payment-success?reference=...` endpoint for callback  

---

## 🔧 Setup Instructions

### Step 1: Get Paychangu API Keys

1. Go to **Paychangu Dashboard** (https://paychangu.com)
2. Navigate to **Developer Settings** → **API Keys**
3. Copy your **Secret Key** and **Public Key**

### Step 2: Update Environment Variables

Edit `citi-nati-backend/.env`:

```env
# Paychangu Credentials
PAYCHANGU_SECRET_KEY=sk_live_xxxxxxxxxxxxx  # Your secret key from dashboard
PAYCHANGU_PUBLIC_KEY=pk_live_xxxxxxxxxxxxx  # Your public key from dashboard
PAYCHANGU_WEBHOOK_SECRET=citi_nati_webhook_secret_2026

# URLs (for payment callbacks)
FRONTEND_URL=http://localhost:3001  # Change to your production URL
BACKEND_URL=http://localhost:5000   # Change to your production URL
NODE_ENV=development                 # Change to 'production' for live
```

### Step 3: Configure Paychangu Webhook

1. In **Paychangu Dashboard** → **Webhooks**
2. Set webhook URL to: `https://yourdomain.com/api/payments/webhook`
3. For local testing, use **ngrok**:

```bash
# Terminal 1: Start ngrok
ngrok http 5000

# ngrok will show: Forwarding https://abc123.ngrok.io -> http://localhost:5000
```

4. Set webhook URL in Paychangu dashboard to: 

```
https://abc123.ngrok.io/api/payments/webhook
```

5. Select event types: **Payment Successful**, **Payment Failed**
6. Copy webhook secret to your `.env`

### Step 4: Restart Backend Server

```bash
cd citi-nati-backend
npm run dev
```

---

## 🔄 Payment Flow Diagram

```
User at Checkout
    ↓
[Frontend] Creates Order (POST /orders)
    ↓
Order Created: status=PENDING_PAYMENT, paymentStatus=PENDING
    ↓
[Frontend] Initializes Payment (POST /payments/initialize)
    ↓
[Backend] Calls Paychangu API, gets checkout_url
    ↓
[Frontend] Redirects to checkout_url
    ↓
User Pays at Paychangu
    ↓
Paychangu Calls Webhook (POST /payments/webhook)
    ↓
[Backend] Verifies signature & payment reference
    ↓
[Backend] Updates Order: status=PENDING, paymentStatus=PAID
    ↓
[Backend] Emits 'newOrder' to admin_room
    ↓
[Frontend] PaymentSuccess page polls for confirmation
    ↓
[Frontend] Confirms PAID status, shows success message
    ↓
[Frontend] Redirects to /my-orders
```

---

## 🧪 Testing Locally

### Without Real Payment

Use Paychangu **Test Mode** for sandbox testing:

1. Use test keys in `.env` instead of live keys
2. At Paychangu checkout, use test card: **4111 1111 1111 1111**
3. Any future expiry date and any CVC

### Testing Flow

```bash
# Terminal 1: Backend
cd citi-nati-backend
npm run dev

# Terminal 2: Frontend  
cd citi-nati-frontend
npm run dev

# Terminal 3: ngrok (if using webhooks)
ngrok http 5000
```

### Manual Test Steps

1. **Register & Login** to http://localhost:3001
2. **Add Products** to cart
3. **Go to Checkout** and fill delivery info
4. **Click Place Order**
5. **Verify:**
   - Order created with status `PENDING_PAYMENT`
   - Redirected to Paychangu checkout
6. **Complete Payment** with test card
7. **Check Admin Dashboard:**
   - New order appears in "New Orders Today"
   - Sales totals updated

### Database Verification

```sql
-- Check order status after payment
SELECT id, status, paymentStatus, paymentReference, total, createdAt 
FROM "Order" 
ORDER BY createdAt DESC 
LIMIT 5;

-- Should show: status=PENDING, paymentStatus=PAID after payment
```

---

## 🔒 Security Features

✅ **Never Trust Frontend for Payments**
- Payment reference stored server-side only
- Payment status verified via webhook signature

✅ **HMAC Signature Verification**
- Webhook validates with `PAYCHANGU_WEBHOOK_SECRET`
- Prevents spoofed webhook messages

✅ **Idempotency**
- Duplicate payments don't create duplicate orders
- Webhook checks if order already `PAID`

✅ **User Isolation**
- Payment endpoint verifies order belongs to authenticated user
- Cannot access/pay for other users' orders

✅ **Reference Tracking**
- Payment reference is **unique per order**
- Prevents payment replay attacks

---

## 📊 Order Statuses

| Status | Meaning | Payment Status |
|--------|---------|-----------------|
| `PENDING_PAYMENT` | Waiting for user to pay at Paychangu | `PENDING` |
| `PENDING` | Payment confirmed, awaiting admin confirmation | `PAID` |
| `CONFIRMED` | Admin confirmed, ready for pickup/delivery | `PAID` |
| `DELIVERED` | Order completed | `PAID` |
| `CANCELLED` | Order cancelled | `PAID` or `PENDING` |

---

## 🐛 Troubleshooting

### Issue: "No checkout URL received from payment gateway"

**Cause:** Paychangu API returned error  
**Solution:**
1. Verify `PAYCHANGU_SECRET_KEY` is correct
2. Check order has valid data (amount, email, etc.)
3. Check backend logs: `npm run dev` should show error

```
// In backend logs
Paychangu API Error: {...}
```

### Issue: Webhook not being called

**Cause:** Webhook URL not configured  
**Solution:**
1. Verify webhook URL in Paychangu dashboard
2. If local, ensure ngrok is mapping correctly
3. Check webhook logs in Paychangu dashboard

### Issue: "Order not found for reference"

**Cause:** Order wasn't created or reference doesn't match  
**Solution:**
1. Verify order was created: check database
2. Verify paymentReference matches
3. Check backend logs for order creation errors

### Issue: Payment Success page shows "Payment processing timeout"

**Cause:** Order not updated after 30 seconds  
**Solution:**
1. Check if webhook was called (check Paychangu logs)
2. Verify `PAYCHANGU_WEBHOOK_SECRET` matches Paychangu dashboard
3. Manually update order: `UPDATE "Order" SET paymentStatus='PAID', status='PENDING' WHERE id=X`

---

## 🚀 Production Deployment

### Before Going Live

1. **Get Live API Keys** from Paychangu Dashboard
2. **Update .env:**
   ```env
   NODE_ENV=production
   PAYCHANGU_SECRET_KEY=sk_live_xxxxx  # Live key
   PAYCHANGU_PUBLIC_KEY=pk_live_xxxxx  # Live key
   FRONTEND_URL=https://yourdomain.com  # Your domain
   BACKEND_URL=https://api.yourdomain.com  # Your API domain
   ```

3. **Configure Webhook URL:**
   ```
   https://api.yourdomain.com/api/payments/webhook
   ```

4. **Run Migrations:**
   ```bash
   npx prisma migrate deploy
   ```

5. **Build Frontend:**
   ```bash
   npm run build
   ```

6. **Test One Payment** before opening to customers

### Nginx Configuration (Example)

```nginx
# /etc/nginx/sites-available/citi-nati

upstream backend {
    server 127.0.0.1:5000;
}

upstream frontend {
    server 127.0.0.1:3001;
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
    }
}
```

---

## 📞 Support

For Paychangu API issues:
- **Paychangu Docs:** https://api.paychangu.com/docs
- **Contact:** support@paychangu.com

For Citi-Nati issues:
- **Check Logs:** Backend (`npm run dev`) and browser console (F12)
- **Database:** Verify order status and payment reference
- **Webhook:** Check Paychangu dashboard for webhook logs

---

## ✅ Verification Checklist

- [ ] Backend server running on port 5000
- [ ] Frontend server running on port 3001  
- [ ] `.env` has valid Paychangu keys
- [ ] Database migrated: `npx prisma migrate deploy`
- [ ] Webhook URL configured in Paychangu dashboard
- [ ] Test order created with `status=PENDING_PAYMENT`
- [ ] Checkout redirects to Paychangu
- [ ] Payment success page appears after payment
- [ ] Admin sees new order in dashboard
- [ ] Order appears in user's "My Orders"

---

Complete! Your payment system is secure and production-ready. 🎉
