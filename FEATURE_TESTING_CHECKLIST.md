# Citi-Nati Supermarket — Full Feature Testing Checklist

> **Purpose:** Use this checklist to manually verify every feature of the platform before going live or after any major deployment.  
> **How to use:** Work through each section in order. Check off (✅) items as you verify them. Mark ❌ for failures and note the issue.  
> **Roles needed:** You will need test accounts for: Customer, Admin, Driver, Cashier.

---

## Table of Contents

1. [Test Account Setup](#1-test-account-setup)
2. [Public Pages & Navigation](#2-public-pages--navigation)
3. [User Registration & Email Verification](#3-user-registration--email-verification)
4. [Authentication](#4-authentication)
5. [Password Reset](#5-password-reset)
6. [Product Catalogue (Customer)](#6-product-catalogue-customer)
7. [Shopping Cart](#7-shopping-cart)
8. [Checkout & Payment](#8-checkout--payment)
9. [Order Tracking (Customer)](#9-order-tracking-customer)
10. [Support Tickets (Customer)](#10-support-tickets-customer)
11. [Admin Dashboard — Login & Security](#11-admin-dashboard--login--security)
12. [Admin — Products Management](#12-admin--products-management)
13. [Admin — Orders Management](#13-admin--orders-management)
14. [Admin — Drivers Management](#14-admin--drivers-management)
15. [Admin — Cashiers Management](#15-admin--cashiers-management)
16. [Admin — Sales Day Management](#16-admin--sales-day-management)
17. [Admin — Promotions](#17-admin--promotions)
18. [Admin — Stock & Expiry](#18-admin--stock--expiry)
19. [Admin — Emergency Sales (Admin Scope)](#19-admin--emergency-sales-admin-scope)
20. [Admin — Emergency Sales Reports](#20-admin--emergency-sales-reports)
21. [Admin — Refunds](#21-admin--refunds)
22. [Admin — Support Tickets (Admin Scope)](#22-admin--support-tickets-admin-scope)
23. [Admin — Inbox Messages](#23-admin--inbox-messages)
24. [Admin — Security Keys](#24-admin--security-keys)
25. [Admin — System / Maintenance Mode](#25-admin--system--maintenance-mode)
26. [Driver Dashboard](#26-driver-dashboard)
27. [Cashier Dashboard & POS](#27-cashier-dashboard--pos)
28. [POS Sync Agent](#28-pos-sync-agent)
29. [Real-Time Notifications](#29-real-time-notifications)
30. [Maintenance Mode (Full Flow)](#30-maintenance-mode-full-flow)
31. [Mobile Responsiveness](#31-mobile-responsiveness)
32. [Edge Cases & Security](#32-edge-cases--security)

---

## 1. Test Account Setup

Before starting, ensure the following accounts exist in the database:

| Role | Email | Notes |
|---|---|---|
| Admin | `admin@test.com` | Created via `npm run seed:admin` or database script |
| Customer | `customer@test.com` | Register via website |
| Driver | `driver@test.com` | Created by admin in Drivers panel |
| Cashier | `cashier@test.com` | Created by admin in Cashiers panel |

- [ ] Admin account exists and can log in at `/login`
- [ ] Customer account exists, email verified
- [ ] Driver account exists, linked to a driver profile
- [ ] Cashier account exists with a PIN set

---

## 2. Public Pages & Navigation

### Homepage (`/`)
- [ ] Homepage loads without errors
- [ ] Logo is visible and links back to `/`
- [ ] Navigation links work (Products, Cart, Login/Register)
- [ ] Promotion banner appears if a promotion is active
- [ ] Featured products displayed correctly
- [ ] Mobile menu opens and closes

### Static Pages
- [ ] `/about` loads correctly
- [ ] `/help-center` loads correctly
- [ ] `/faqs` loads correctly
- [ ] `/contact` form is present and submittable
- [ ] `/terms` loads correctly
- [ ] `/returns` loads correctly
- [ ] Footer links all navigate to correct pages

### 404 Page
- [ ] Navigate to `/some-random-nonexistent-url` → `NotFound` page shows
- [ ] "Go Home" or similar button works

---

## 3. User Registration & Email Verification

### Registration
- [ ] Navigate to `/register`
- [ ] Fill name, email, password → submit
- [ ] Success message/redirect appears
- [ ] Redirected to `/verify-email`
- [ ] Verification email arrives in inbox with 6-digit OTP
- [ ] Attempting to register with the same email again shows an error

### Email Verification
- [ ] Navigate to `/verify-email`
- [ ] Enter correct OTP → account verified
- [ ] User is logged in automatically after verification
- [ ] Navigating to home shows logged-in state (avatar, account menu)

### Resend Verification
- [ ] On `/verify-email`, click "Resend Code"
- [ ] New OTP email arrives
- [ ] Old OTP is no longer valid (entering old code fails)

### Edge Cases
- [ ] Entering an expired OTP shows an appropriate error
- [ ] Entering a wrong OTP shows an error
- [ ] Attempting to log in before email is verified shows a clear message

---

## 4. Authentication

### Standard Login
- [ ] Navigate to `/login`
- [ ] Enter valid credentials → redirected to home (or previous page)
- [ ] User name appears in the header avatar
- [ ] Cart count badge is visible if cart has items

### Login Failures
- [ ] Enter wrong password → error message shown
- [ ] Enter non-existent email → error message shown
- [ ] Empty form submission → validation errors shown

### Google Sign-In
- [ ] "Continue with Google" button is visible
- [ ] Clicking opens Google OAuth popup/redirect
- [ ] Signing in with Google creates/logs in account
- [ ] User is redirected to home after Google login

### Logout
- [ ] Click avatar → "Logout" option
- [ ] User is logged out, redirected to home or login
- [ ] Header shows login/register links again
- [ ] Navigating to a protected page redirects to login

### Session Persistence
- [ ] Refresh browser while logged in → stays logged in
- [ ] Close and reopen browser → still logged in
- [ ] Token expiry causes redirect to login (check after token lifetime)

---

## 5. Password Reset

- [ ] Navigate to `/forgot-password`
- [ ] Enter registered email → success message
- [ ] Reset code email arrives in inbox
- [ ] Navigate to `/reset-password`
- [ ] Enter correct code + new password → success
- [ ] Log in with NEW password → works
- [ ] Log in with OLD password → fails
- [ ] Entering wrong/expired code shows error
- [ ] Requesting reset for non-existent email shows generic message (no leakage)

---

## 6. Product Catalogue (Customer)

### Product Listing (`/products`)
- [ ] Product grid loads with images, names, prices
- [ ] Pagination works (Next/Prev, page numbers)
- [ ] Correct number of products per page shown

### Category Filter
- [ ] Category list appears in sidebar/filter nav
- [ ] Clicking a category filters products to that category only
- [ ] "All" or clearing filter shows all products again
- [ ] URL updates to reflect category selection
- [ ] Refreshing the page retains the selected category

### Product Search
- [ ] Search box is visible
- [ ] Typing a product name filters results
- [ ] Searching for a non-existent product shows "no products found" message

### Product Detail
- [ ] Clicking a product navigates to its detail page
- [ ] Product name, price, description, image shown
- [ ] Stock status is shown (In Stock / Out of Stock)
- [ ] "Add to Cart" button present and functional

### Promotions on Storefront
- [ ] If a promotion is active, discounted price shown (strikethrough on original)
- [ ] `isOnSale` badge or indicator visible

### Hidden Products
- [ ] Products with `hideFromProductsPage: true` do not appear in listing
- [ ] Products with `isActive: false` do not appear

---

## 7. Shopping Cart

- [ ] Click "Add to Cart" on a product → cart badge increments
- [ ] Navigate to `/cart` → product shown in cart list
- [ ] Increase quantity → price updates
- [ ] Decrease quantity → price updates
- [ ] Remove item → item disappears, cart badge decrements
- [ ] Cart persists after page refresh
- [ ] Adding the same product again increments quantity
- [ ] Cannot add more than available stock (error shown or button disabled)
- [ ] Empty cart shows "Your cart is empty" message with link to products

---

## 8. Checkout & Payment

### Checkout Form (`/checkout`)
- [ ] Navigate to `/checkout` with items in cart
- [ ] Order summary shows correct items and total
- [ ] Delivery address field is present and required
- [ ] House number field is present and required
- [ ] Phone number field present
- [ ] Notes/special instructions field present
- [ ] Form validation: empty required fields show errors

### Payment Flow
- [ ] Click "Place Order" / "Pay Now"
- [ ] Redirected to PayChangu hosted payment page
- [ ] Payment page shows correct amount in MWK
- [ ] Complete test payment → redirected back to `/payment-success`

### Post-Payment
- [ ] `/payment-success` page shows order confirmation
- [ ] Order appears in `/my-orders` with `paymentStatus: PAID`
- [ ] Order status starts as `PENDING` or `CONFIRMED`
- [ ] Admin inbox has a new message about the order
- [ ] Product stock was decreased by order quantity (check in Admin Products)

### Payment Failure
- [ ] Cancel payment on PayChangu → appropriate message shown
- [ ] Order is not created or remains `PENDING`

---

## 9. Order Tracking (Customer)

- [ ] Navigate to `/my-orders`
- [ ] All past orders listed with dates and totals
- [ ] Order status displayed correctly (PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED)
- [ ] Click on an order → order details shown (items, address, driver if assigned)
- [ ] Status updates in real-time when driver updates delivery status (test with driver account simultaneously)
- [ ] Receipt download works (`GET /api/orders/:id/receipt`)

---

## 10. Support Tickets (Customer)

- [ ] Navigate to `/contact` → fill and submit the contact form → ticket created
- [ ] Confirmation message shown after submission
- [ ] Navigate to account / help section → own tickets listed
- [ ] Click ticket → full thread visible
- [ ] Add reply to ticket → reply appears in thread
- [ ] Delete own ticket → ticket removed from list
- [ ] Cannot view another customer's ticket (via direct URL)

---

## 11. Admin Dashboard — Login & Security

### Admin Login
- [ ] Navigate to `/login` with admin credentials → redirected to `/admin`
- [ ] Security key prompt appears (if key is set)
- [ ] Enter correct security key → dashboard loads
- [ ] Enter wrong security key → error, dashboard does not load
- [ ] No site header or footer on admin dashboard

### Admin Dashboard Overview
- [ ] Dashboard tab shows total users and total orders counts
- [ ] Tab navigation works for all sections (Products, Orders, Drivers, etc.)

---

## 12. Admin — Products Management

### View Products
- [ ] Products tab shows all products in a table/list
- [ ] Images shown correctly from Cloudinary
- [ ] POS-synced products have `sourceCode` populated

### Create Product
- [ ] Click "Add Product"
- [ ] Fill in name, price, stock, category, description
- [ ] Upload an image → image preview shown
- [ ] Save → product appears in list
- [ ] Product appears on storefront `/products`

### Edit Product
- [ ] Click edit on a product
- [ ] Change price → save → storefront reflects new price
- [ ] Change image → new image shown on storefront
- [ ] Change stock → storefront shows updated stock

### Delete Product
- [ ] Click delete → confirmation prompt
- [ ] Confirm → product removed from list and storefront

### Toggle Visibility
- [ ] Toggle `isActive` off → product disappears from `/products`
- [ ] Toggle `hideFromProductsPage` on → product disappears from `/products`
- [ ] Toggle back → product reappears

### POS Products
- [ ] "Sync from POS" button triggers sync (if POS agent running)
- [ ] POS products appear with `sourceCode` set
- [ ] "Clear POS Products" → confirmation → POS products removed

---

## 13. Admin — Orders Management

- [ ] All orders listed in table with customer name, total, status, payment status
- [ ] Filter by order status works
- [ ] Click "View" on order → `OrderDetailsModal` opens with all details
- [ ] Assign driver to an order → driver name shown on order
- [ ] Update order status (e.g. CONFIRMED → OUT_FOR_DELIVERY)
- [ ] Status change reflected on customer's `/my-orders` page

---

## 14. Admin — Drivers Management

### Create Driver
- [ ] Click "Add Driver"
- [ ] Fill name, phone, email
- [ ] Use "Create with Account" option → creates driver + linked user account
- [ ] New driver appears in list

### Update Driver
- [ ] Edit driver details → saved correctly

### Delete Driver
- [ ] Delete driver → confirmation → removed from list

### Driver Performance
- [ ] View performance tab → shows delivery counts per driver
- [ ] Filter by sales day → correct metrics shown
- [ ] "Clear Performance Records" → confirms and clears

---

## 15. Admin — Cashiers Management

### Create Cashier
- [ ] Navigate to Security tab → Cashiers sub-tab
- [ ] Click "Add Cashier"
- [ ] Fill name, email, initial PIN
- [ ] Cashier appears in list
- [ ] New cashier can log in at `/login` with those credentials

### Update Cashier
- [ ] Edit cashier name or email → saved

### Reset Cashier PIN
- [ ] Click "Set PIN" on a cashier
- [ ] Enter new PIN → saved
- [ ] Cashier can log in with new PIN

### Delete Cashier
- [ ] Delete cashier → confirmation → removed, account disabled

---

## 16. Admin — Sales Day Management

### Open Sales Day
- [ ] Go to Sales tab
- [ ] Click "Start Sales Day" → sales day opens
- [ ] Status shows "OPEN"
- [ ] Current date shown

### Close Sales Day
- [ ] Click "End Sales Day"
- [ ] Confirmation prompt
- [ ] Sales day closes with totals recorded
- [ ] Day appears in history table with correct totals

### Sales History
- [ ] All past sales days listed with dates, order counts, revenue
- [ ] Click a day → detail view with orders listed
- [ ] CSV export downloads with correct data
- [ ] "Clear History" → confirmation → history cleared

---

## 17. Admin — Promotions

### Global Promotion
- [ ] Promotions tab → Global type
- [ ] Set percentage (e.g. 10%)
- [ ] Click "Preview" → shows list of products with new prices
- [ ] Click "Apply" → all products get discounted price
- [ ] Storefront shows strikethrough prices on all products
- [ ] Click "Remove" → prices revert to originals

### Category Promotion
- [ ] Select Category type → choose a category
- [ ] Set percentage
- [ ] Preview → only products in that category shown
- [ ] Apply → only that category is discounted
- [ ] Remove → category prices revert

### Selective Promotion
- [ ] Select Selective type
- [ ] Choose individual products
- [ ] Set percentage
- [ ] Preview → only selected products shown
- [ ] Apply → only those products discounted
- [ ] Remove → only those products reverted

---

## 18. Admin — Stock & Expiry

### Stock Overview
- [ ] Stocks tab shows all products with current stock levels
- [ ] Low-stock products highlighted (below threshold)
- [ ] Out-of-stock products clearly marked

### Stock Override
- [ ] Find a product
- [ ] Set a manual stock override (e.g. override to 50)
- [ ] Product page shows overridden stock level
- [ ] Override reason recorded

### Expiry Alerts
- [ ] Products with upcoming expiry dates listed
- [ ] Products with expired stock flagged
- [ ] "Apply Expiry Promotion" reduces price with given percentage
- [ ] POS write command queued for price change (if agent connected)
- [ ] "Revert" reverses the expiry promotion

---

## 19. Admin — Emergency Sales (Admin Scope)

- [ ] Navigate to Emergency Sales tab in admin dashboard
- [ ] Product search works (by name and barcode)
- [ ] Add product to cart → quantity adjustable
- [ ] Set payment method (Cash / Mobile)
- [ ] Enter tendered amount → change calculated automatically
- [ ] Submit sale → sale recorded with `saleRef`
- [ ] Sale appears in "Recent Emergency Sales" panel
- [ ] Recent list is scrollable if >viewport entries
- [ ] Admin can see ALL cashiers' sales in the list (not scoped)
- [ ] Sync status column shows `pending` / `synced` / `failed`
- [ ] "Retry Sync" button appears for `failed` sales and triggers retry

---

## 20. Admin — Emergency Sales Reports

- [ ] Navigate to Emergency Sales → Reports tab (or Reports button)

### Overview Tab
- [ ] Total sales count shown
- [ ] Total revenue shown
- [ ] Average sale value shown
- [ ] Date range filter works

### Sales Log Tab
- [ ] All sales listed with: date, ref, cashier, items, total, sync status
- [ ] TOTAL row at bottom (sum of items and total revenue)
- [ ] CSV export downloads correctly with TOTAL row appended
- [ ] PDF export downloads with correct data and TOTAL footer

### By Product Tab
- [ ] Each product listed with: name, qty sold, revenue, sales line count
- [ ] TOTAL row at bottom
- [ ] CSV export with TOTAL row
- [ ] PDF export with TOTAL footer

### By Cashier Tab
- [ ] Each cashier listed with: name, sales count, total revenue, sync status breakdown
- [ ] TOTAL row at bottom
- [ ] CSV export with TOTAL row
- [ ] PDF export with TOTAL footer

---

## 21. Admin — Refunds

- [ ] Refunds tab shows orders with `paymentStatus: PAID` that are flagged for refund
- [ ] Order details visible (customer, amount, items)
- [ ] "Mark as Refunded" button visible
- [ ] Click → confirmation → order marked `REFUNDED`
- [ ] Order no longer appears in refunds list

---

## 22. Admin — Support Tickets (Admin Scope)

- [ ] All tickets listed (not just own) with subject, customer, status, priority
- [ ] Filter by status works
- [ ] Filter by priority works
- [ ] Click ticket → full thread visible including customer messages
- [ ] Admin reply sent → appears in thread
- [ ] Change status to "RESOLVED" → saved
- [ ] Change priority to "HIGH" → saved
- [ ] Ticket read/unread status tracked correctly

---

## 23. Admin — Inbox Messages

- [ ] Inbox tab shows all `AdminMessage` records
- [ ] Unread count badge visible in tab header
- [ ] Click a message → marked as read
- [ ] "Mark All as Read" button works
- [ ] Mark individual as unread → unread badge updates
- [ ] Delete single message → removed from list
- [ ] "Delete All" → confirmation → all messages cleared
- [ ] New orders automatically create inbox messages

---

## 24. Admin — Security Keys

### Admin Security Key
- [ ] Security tab → Admin Security Key section
- [ ] If no key set, prompt to set one
- [ ] Set key → saved (bcrypt hashed, not visible)
- [ ] Log out → log back in → security key prompt appears
- [ ] Enter correct key → dashboard accessible
- [ ] Enter wrong key → access denied error
- [ ] Change key → new key works, old key fails

### Driver Security Keys
- [ ] Driver security key management section visible
- [ ] Select a driver → set their security key
- [ ] Driver logs in → security key prompt on dashboard
- [ ] Correct key → access; wrong key → denied

### Cashier PINs
- [ ] Cashier PIN management in Security → Cashiers tab
- [ ] Set new PIN for cashier
- [ ] Cashier logs in → PIN prompt shown
- [ ] Correct PIN → dashboard loads
- [ ] Wrong PIN → error, dashboard blocked

---

## 25. Admin — System / Maintenance Mode

- [ ] System tab loads
- [ ] Current maintenance status shown
- [ ] Toggle "Enable Maintenance Mode"
- [ ] Confirmation prompt shown
- [ ] After enabling: navigate to `/products` as a customer → redirected to `/maintenance`
- [ ] `/maintenance` page shows site is under maintenance
- [ ] Admin navigating to `/admin` is NOT redirected
- [ ] Cashier navigating to `/cashier` is NOT redirected
- [ ] Toggle maintenance mode OFF → `/products` accessible again

---

## 26. Driver Dashboard

### Login
- [ ] Log in as driver at `/login` → redirected to `/driver`
- [ ] Security key prompt appears (if key is set)
- [ ] Enter correct key → dashboard loads
- [ ] No site header or footer

### Order Management
- [ ] Only orders assigned to THIS driver are visible
- [ ] Orders grouped or labelled by status
- [ ] Click order → details visible (delivery address, customer info, items)
- [ ] Update status: "Confirm" → `CONFIRMED`
- [ ] Update status: "Out for Delivery" → `OUT_FOR_DELIVERY`
- [ ] Update status: "Delivered" → `DELIVERED`
- [ ] Customer's `/my-orders` page reflects status change in real time

### Real-Time
- [ ] When admin assigns a new order, driver sees it appear without page refresh

---

## 27. Cashier Dashboard & POS

### Login
- [ ] Log in as cashier at `/login` → redirected to `/cashier`
- [ ] PIN prompt appears
- [ ] Enter correct PIN → dashboard loads
- [ ] Wrong PIN → error, dashboard blocked
- [ ] No site header or footer on cashier dashboard
- [ ] Page does not scroll (fixed 100vh viewport)

### Emergency POS Interface
- [ ] Search for a product by name → results appear
- [ ] Search for a product by barcode → results appear
- [ ] Add product to cart → shows in cart panel
- [ ] Adjust quantity in cart
- [ ] Remove item from cart
- [ ] Cart total updates correctly

### Processing a Sale
- [ ] Set payment method (Cash)
- [ ] Enter tendered amount
- [ ] Change amount calculated and displayed
- [ ] Click "Complete Sale" / "Record Sale"
- [ ] Sale saved with unique `saleRef`
- [ ] Cart is cleared after submission
- [ ] Sale appears in recent sales list

### Data Scoping
- [ ] Cashier can only see their OWN sales in the recent list
- [ ] Sales made by another cashier do NOT appear
- [ ] Backend enforces this (not just frontend filtering)

### Logout
- [ ] Click "Logout" button
- [ ] Confirmation modal appears with warning message
- [ ] Click "Cancel" → stays on dashboard
- [ ] Click "Confirm" → logged out, redirected to login

---

## 28. POS Sync Agent

> Requires the POS sync agent running on the local Windows machine with SQL Server access.

### Product Sync (Inbound)
- [ ] Agent is running (check terminal / logs)
- [ ] Products visible in SQL Server POS appear in admin Products list after sync
- [ ] `sourceCode` populated on synced products
- [ ] Prices match POS prices
- [ ] Stock levels match POS stock

### Expiry Batch Sync
- [ ] `ProductExpiryBatch` records created for products with expiry data
- [ ] Expiry candidates visible in Admin → Stocks → Expiry tab

### POS Write Commands (Outbound)
- [ ] Apply a promotion in admin → `PosWriteCommand` created with `status: PENDING`
- [ ] Agent picks up command (poll endpoint called)
- [ ] Command processed in SQL Server POS (price updated)
- [ ] Command status changes to `COMPLETED`
- [ ] Failed command shows `FAILED` status and error message
- [ ] Retry count incremented on failures

### Emergency Sale Sync
- [ ] Record an emergency sale in cashier dashboard
- [ ] Sale shows `syncStatus: pending`
- [ ] Agent fetches pending sale, writes invoice to SQL Server
- [ ] Sale `syncStatus` changes to `synced`
- [ ] `posInvoiceNo` populated on sale record
- [ ] If write fails → status = `failed`, error message populated
- [ ] Admin "Retry Sync" → agent picks up again

---

## 29. Real-Time Notifications

- [ ] Log in as customer. Log in as admin in another browser/tab.
- [ ] Customer places an order.
- [ ] Admin browser shows a toast notification about the new order.
- [ ] Admin inbox shows a new unread message.
- [ ] Admin assigns a driver → driver's browser shows toast.
- [ ] Driver updates status → customer's browser shows toast.
- [ ] `/my-orders` on customer side updates without manual refresh.

---

## 30. Maintenance Mode (Full Flow)

1. [ ] Log in as admin → go to System tab
2. [ ] Enable maintenance mode
3. [ ] Open incognito browser → navigate to `/products` → redirected to `/maintenance`
4. [ ] Incognito browser → navigate to `/cashier` → NOT redirected (cashier bypass works)
5. [ ] In incognito, navigate to `/admin-login` → login page accessible
6. [ ] Log in as admin in incognito → can access admin dashboard
7. [ ] Admin disables maintenance mode
8. [ ] Incognito browser → `/products` now loads correctly

---

## 31. Mobile Responsiveness

- [ ] Open homepage on mobile viewport (375px) → no horizontal overflow
- [ ] Mobile bottom navigation bar visible and functional
- [ ] Products page grid adjusts to single or two columns
- [ ] Cart page scrollable on mobile
- [ ] Checkout form usable on mobile
- [ ] Admin dashboard usable on tablet (768px)
- [ ] Driver dashboard functional on mobile
- [ ] Cashier dashboard functional on tablet

---

## 32. Edge Cases & Security

### Access Control
- [ ] Unauthenticated user navigating to `/admin` → redirected to login
- [ ] Unauthenticated user navigating to `/driver` → redirected to login
- [ ] Unauthenticated user navigating to `/cashier` → redirected to login
- [ ] Customer-role user navigating to `/admin` → redirected (role mismatch)
- [ ] Driver-role user navigating to `/admin` → redirected
- [ ] Cashier-role user navigating to `/admin` → redirected
- [ ] Directly calling admin API `GET /api/admin/dashboard` without token → 401
- [ ] Calling admin API with customer token → 403
- [ ] Cashier calling `GET /api/cashier/emergency-sales` → only own records returned (test with 2 cashier accounts)

### Cart & Order Integrity
- [ ] Adding a product with 0 stock to cart → appropriate error/block
- [ ] Completing checkout for a product whose stock dropped to 0 during checkout → error
- [ ] Duplicate payment webhook → not double-applied (idempotency check)

### Data Validation
- [ ] Register with invalid email format → error
- [ ] Register with very short password → error
- [ ] Submitting checkout form with missing required fields → validation errors
- [ ] Emergency sale with 0 items → cannot be submitted

### Performance
- [ ] Products page with 50+ products loads in acceptable time
- [ ] Admin orders page with many orders loads correctly
- [ ] Emergency sales list with many records is scrollable and performant

### Error Handling
- [ ] Backend returns 500 → frontend shows a friendly error (not a raw JSON dump)
- [ ] Network offline → frontend shows an appropriate message
- [ ] Navigating to `/products/999999` (non-existent product) → handled gracefully

### Chunk Load Errors
- [ ] After re-deploying frontend, old browser session navigating to a new route → `ChunkErrorBoundary` handles gracefully, offers refresh

---

## Sign-Off

| Area | Tested By | Date | Status |
|---|---|---|---|
| Registration & Auth | | | |
| Product Catalogue | | | |
| Cart & Checkout | | | |
| Order Management | | | |
| Driver Dashboard | | | |
| Cashier Dashboard | | | |
| Admin Products | | | |
| Admin Orders | | | |
| Admin Reports | | | |
| Admin Promotions | | | |
| Admin Security | | | |
| Emergency Sales | | | |
| POS Sync Agent | | | |
| Real-Time Features | | | |
| Maintenance Mode | | | |
| Mobile Responsiveness | | | |
| Edge Cases | | | |

---

*Generated for Citi-Nati Supermarket — March 2026*
