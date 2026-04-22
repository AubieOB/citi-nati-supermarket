# Citi-Nati Supermarket Storefront and Customer User Guide

## 1. Purpose of this guide

This guide explains every customer-facing page and workflow in the online store.
It is written for end users and support staff who assist end users.

This guide covers:

- account access and security flows
- browsing and searching products
- adding items to cart
- checkout and delivery validation
- payment confirmation
- order tracking and payment retry
- help and policy pages

This guide does not cover admin-only features. See `ADMIN_PANEL_USER_GUIDE.md` for admin operations.

## 2. Supported customer routes (page map)

### Main shopping routes

- `/` Home
- `/products` Product browsing and search
- `/cart` Shopping cart
- `/checkout` Checkout and order placement
- `/payment-success` Payment callback and verification
- `/my-orders` Customer order history and status

### Account and access routes

- `/login` Sign in
- `/register` Create account
- `/verify-email` Verify account email
- `/forgot-password` Start password reset
- `/reset-password` Complete password reset

### Information and policy routes

- `/help-center` Help center
- `/faqs` Frequently asked questions
- `/contact` Contact page
- `/about` About page
- `/terms` Terms and conditions
- `/returns` Returns and refunds policy

### System mode routes

- `/maintenance` Maintenance notice page (when maintenance mode is enabled)

## 3. Before customers start

Customers should have:

- a valid email address
- phone and delivery details
- internet access to complete checkout and payment

Recommended checks:

1. Confirm account email is verified.
2. Confirm delivery address details are accurate.
3. Confirm cart subtotal meets minimum order value before checkout.

## 4. Home page (`/`)

The home page is the entry point.

What users can do:

- read the main value proposition
- click `Browse Products` to start shopping
- click `Learn More` to open the About page
- view active promotion banner if one is available

How to use:

1. Open the home page.
2. Click `Browse Products`.
3. Continue to product browsing.

## 5. Authentication and account management

## 5.1 Login (`/login`)

Supported login methods:

- email and password
- Google login (if enabled)

Expected behavior:

- success redirects user by role/permission path
- failed login shows clear error message
- repeated failed attempts can trigger temporary lockout

How to log in:

1. Open `/login`.
2. Enter email and password.
3. Click `Sign In`.
4. If successful, continue shopping or use assigned dashboard route.

Common login errors:

- invalid email/password
- too many failed attempts (retry later)
- backend error (temporary)

## 5.2 Register (`/register`)

What registration validates:

- required fields
- password confirmation match
- terms acceptance

How to register:

1. Open `/register`.
2. Enter name, email, password, confirm password.
3. Accept terms and conditions.
4. Submit registration.
5. Continue to email verification.

## 5.3 Email verification (`/verify-email`)

Purpose:

- verifies customer account ownership
- unlocks protected operations

Recommended customer steps:

1. Open verification link or verification page.
2. Enter required code/token if prompted.
3. Confirm verification.
4. Log in and continue shopping.

## 5.4 Forgot and reset password

### Forgot password (`/forgot-password`)

1. Enter account email.
2. Submit reset request.
3. Check inbox for reset instructions.

### Reset password (`/reset-password`)

1. Open reset link from email.
2. Enter new password.
3. Confirm and save.
4. Return to login.

## 6. Product browsing (`/products`)

The products page is the main shopping interface.

Primary capabilities:

- real-time product listing with stock and price updates
- predictive search
- category filtering
- on-sale filtering
- load more pagination
- add-to-cart actions

## 6.1 Product search behavior

Current search behavior is stable and normalized.

Matching characteristics:

- case-insensitive
- whitespace-tolerant
- partial matching supported
- stale async responses are ignored

How to search:

1. Open `/products`.
2. Type in search box.
3. Review live results.
4. Use clear action to reset search quickly.

Tip:

- `Ctrl` clear shortcut is supported for fast reset.

## 6.2 Category filter

The category filter is URL-backed and persistent.

How to filter by category:

1. Open category selector.
2. Choose target category.
3. Results update to that category.
4. Background refreshes continue to honor selected category.

Expected result:

- category should not revert to all products unless user changes it.

## 6.3 On-sale filter

How to filter by sale status:

1. Toggle sale filter.
2. Review only discounted/on-sale products.
3. Combine with category and search when needed.

## 6.4 Load more

How to load more products:

1. Scroll to product list end.
2. Click `Load More`.
3. Next product batch appends without resetting the page.

## 6.5 Add to cart from products page

How to add item:

1. Confirm product is in stock.
2. Click `Add to Cart`.
3. Wait for success message.
4. Cart counter updates.

If not logged in:

- user is prompted to authenticate before adding.

## 7. Cart page (`/cart`)

Cart is backend-authoritative.

What this means:

- server calculates totals
- quantity changes are server validated
- cart totals and VAT are sourced from backend response

Capabilities:

- view line items
- update quantity
- remove item
- view subtotal, VAT, total
- see minimum order threshold and remaining amount
- proceed to checkout when valid

## 7.1 Update item quantity

1. Change quantity input.
2. System validates and updates backend.
3. UI updates total values.

If update fails:

- cart refetches authoritative state.

## 7.2 Remove item

1. Click remove action or set quantity to `0`.
2. Item is removed.
3. Totals recalculate.

## 7.3 Minimum order handling

If subtotal is below threshold:

- checkout button is disabled
- page displays amount needed to proceed

## 8. Checkout page (`/checkout`)

Checkout performs strong validation before order placement.

Validation flow includes:

1. load cart from backend
2. load available delivery zones
3. validate location and zone coverage
4. validate stock availability again
5. validate subtotal threshold
6. submit order to backend
7. redirect to payment gateway

## 8.1 Delivery area and location input

Customer provides:

- district
- area
- address details
- optional GPS/geolocation fields

System checks:

- zone support
- optional radius-based coverage
- delivery fee by zone

## 8.2 Stock and subtotal validation before payment

Before order finalization, checkout verifies:

- each cart item availability
- current effective stock
- subtotal minimum constraints

## 8.3 Place order and continue to payment

1. Complete required checkout fields.
2. Confirm delivery area.
3. Submit checkout.
4. Continue to payment gateway page.

## 9. Payment success flow (`/payment-success`)

This page verifies transaction status after payment provider return.

Process:

1. reads payment reference from URL
2. polls backend for confirmation
3. handles final status:
   - paid
   - pending
   - failed
   - refund pending
4. redirects to `/my-orders` once resolved

If payment remains pending too long:

- user still gets redirected to order history for tracking.

## 10. My Orders page (`/my-orders`)

Purpose:

- display user order history and status
- show payment state and totals
- allow retry payment flow for unpaid orders (where applicable)

Capabilities:

- grouped display for new and older orders
- detailed order cards
- downloadable receipt PDF generation (where available)
- retry payment by reloading order items to cart and navigating to checkout

## 10.1 Retry payment flow

1. Open unpaid order.
2. Click retry payment action.
3. System attempts to add items to cart.
4. User is redirected to checkout.
5. Complete payment again.

## 11. Help and policy pages

These pages are customer reference material:

- `/help-center` support guidance
- `/faqs` quick answers
- `/contact` support channel and contact method
- `/about` company information
- `/terms` legal usage terms
- `/returns` return and refund policy

Use cases:

- checkout issues
- payment concerns
- return policy clarification
- account support

## 12. Customer troubleshooting playbook

## 12.1 Products not updating

1. Refresh product page.
2. Reapply category/search filters.
3. Confirm internet connectivity.
4. Retry after a short delay.

## 12.2 Cannot add to cart

1. Confirm user is logged in.
2. Confirm item is in stock.
3. Retry once.
4. If persistent, relogin and test again.

## 12.3 Checkout blocked

1. Confirm cart is not empty.
2. Confirm subtotal meets minimum order amount.
3. Confirm delivery area is supported.
4. Confirm location coverage requirements are met.

## 12.4 Payment completed but order not visible

1. Wait for payment confirmation polling to complete.
2. Open `/my-orders`.
3. Refresh once.
4. Contact support with payment reference if still missing.

## 13. Support-ready snippets for operations/helpdesk

Use these snippets when supporting customers.

### 13.1 Minimum order reminder

```
Your cart subtotal must meet the minimum order value shown in cart before checkout becomes available.
```

### 13.2 Delivery coverage reminder

```
Please choose a supported district and area. If the zone is inactive or out of coverage radius, checkout will be blocked.
```

### 13.3 Payment verification reminder

```
After payment, keep the payment success page open while confirmation is processed, then continue to My Orders.
```

## 14. Quick reference checklist for customers

1. Log in and verify account email.
2. Browse products and apply category/search filters.
3. Add items to cart.
4. Ensure subtotal meets minimum order value.
5. Complete delivery details in checkout.
6. Finish payment and wait for confirmation.
7. Track order in My Orders.

## 15. Change control note

This guide reflects the current storefront behavior and route structure in the active frontend application.
When page behavior changes, update this file together with release notes so support instructions remain correct.
