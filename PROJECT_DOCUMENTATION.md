# Citi-Nati Supermarket — Full Project Documentation

> **Version:** 1.0  
> **Date:** March 2026  
> **Status:** Near-complete (feature-complete, pending final production deployment)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Technology Stack](#3-technology-stack)
4. [Environment Variables](#4-environment-variables)
5. [Database Schema](#5-database-schema)
6. [Backend Architecture](#6-backend-architecture)
   - 6.1 [Entry Point & Server Setup](#61-entry-point--server-setup)
   - 6.2 [Authentication & Authorization](#62-authentication--authorization)
   - 6.3 [API Routes Reference](#63-api-routes-reference)
   - 6.4 [Controllers](#64-controllers)
   - 6.5 [Services](#65-services)
   - 6.6 [Utilities](#66-utilities)
7. [Frontend Architecture](#7-frontend-architecture)
   - 7.1 [App Entry & Routing](#71-app-entry--routing)
   - 7.2 [Authentication Flow](#72-authentication-flow)
   - 7.3 [Pages](#73-pages)
   - 7.4 [Components](#74-components)
   - 7.5 [Context & State Management](#75-context--state-management)
   - 7.6 [Hooks](#76-hooks)
   - 7.7 [Utilities](#77-utilities)
8. [POS Sync Agent](#8-pos-sync-agent)
9. [Feature Modules (End-to-End)](#9-feature-modules-end-to-end)
   - 9.1 [User Registration & Email Verification](#91-user-registration--email-verification)
   - 9.2 [Authentication (Login / Logout)](#92-authentication-login--logout)
   - 9.3 [Google OAuth](#93-google-oauth)
   - 9.4 [Password Reset](#94-password-reset)
   - 9.5 [Product Catalogue](#95-product-catalogue)
   - 9.6 [Shopping Cart](#96-shopping-cart)
   - 9.7 [Checkout & Payment (PayChangu)](#97-checkout--payment-paychangu)
   - 9.8 [Order Management](#98-order-management)
   - 9.9 [Driver System](#99-driver-system)
   - 9.10 [Sales Day Management](#910-sales-day-management)
   - 9.11 [Promotions & Discounts](#911-promotions--discounts)
   - 9.12 [POS Sync & Product Import](#912-pos-sync--product-import)
   - 9.13 [Expiry Management](#913-expiry-management)
   - 9.14 [Emergency Sales (Cashier POS)](#914-emergency-sales-cashier-pos)
   - 9.15 [Cashier Role & Dashboard](#915-cashier-role--dashboard)
   - 9.16 [Admin Inbox (Messages)](#916-admin-inbox-messages)
   - 9.17 [Support Tickets](#917-support-tickets)
   - 9.18 [Refunds](#918-refunds)
   - 9.19 [Admin Security Keys](#919-admin-security-keys)
   - 9.20 [Maintenance Mode](#920-maintenance-mode)
   - 9.21 [Real-Time Notifications (Socket.io)](#921-real-time-notifications-socketio)
   - 9.22 [Reports & Exports](#922-reports--exports)
10. [User Roles & Permissions](#10-user-roles--permissions)
11. [Deployment](#11-deployment)
12. [Known Constraints & Notes](#12-known-constraints--notes)

---

## 1. Project Overview

**Citi-Nati Supermarket** is a full-stack e-commerce and point-of-sale management platform for a physical supermarket. It serves four distinct user classes simultaneously:

| User Class | What They Do |
|---|---|
| **Customers** | Browse products, manage cart, checkout with PayChangu, track orders, file support tickets |
| **Admins** | Manage all aspects of the platform: products, orders, drivers, cashiers, promotions, POS sync, reports |
| **Drivers** | Accept assigned delivery orders and update delivery status |
| **Cashiers** | Operate an in-browser emergency POS terminal when the main POS system is unavailable |

The platform integrates with a **local Windows POS system** (SQL Server–based) through a background sync agent, keeping product inventory and prices in sync between the cloud storefront and the in-store POS.

---

## 2. Repository Structure

```
citi-nati-supermarket/
├── citi-nati-backend/        # Node.js / Express / Prisma API server
├── citi-nati-frontend/       # React / Vite SPA
├── pos-sync-agent/           # Windows Node.js POS bridge service
├── pos-sync-agent.rar        # Distributable archive of the POS agent
├── render.yaml               # Render.com deployment configuration
└── *.md                      # Project documentation files
```

---

## 3. Technology Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| ORM | Prisma 5 |
| Database | PostgreSQL (hosted on Render / Neon) |
| Authentication | JWT (jsonwebtoken) + bcrypt |
| Real-time | Socket.io 4 |
| File uploads | Multer + Cloudinary |
| Email | SendGrid + Nodemailer (SMTP fallback) |
| Payments | PayChangu (webhook-based) |
| Google Auth | google-auth-library |
| PDF | PDFKit |

### Frontend
| Layer | Technology |
|---|---|
| Build tool | Vite 4 |
| Framework | React 18 |
| Router | React Router v6 |
| HTTP client | Axios |
| Real-time | Socket.io-client |
| Notifications | react-hot-toast |
| Google OAuth | @react-oauth/google |
| PDF/export | jsPDF + jspdf-autotable + html2pdf.js |
| Icons | Font Awesome 6 |
| Styling | Inline styles (component-scoped) + global.css |

### POS Sync Agent
| Layer | Technology |
|---|---|
| Runtime | Node.js |
| SQL Server | mssql |
| HTTP | Axios |
| Server | Express (local HTTP, for receiving push from backend) |

---

## 4. Environment Variables

### Backend (`.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (default 10000 on Render) |
| `JWT_SECRET` | Secret key for signing JWTs |
| `NODE_ENV` | `development` or `production` |
| `FRONTEND_URL` | CORS allowed origin (e.g. `https://citi-nati.onrender.com`) |
| `BACKEND_URL` | Public backend URL |
| `PAYCHANGU_WEBHOOK_SECRET` | Webhook signature verification key |
| `PAYCHANGU_PUBLIC_KEY` | PayChangu public key |
| `PAYCHANGU_SECRET_KEY` | PayChangu secret key |
| `PAYCHANGU_ACCOUNT_ID` | PayChangu account ID |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `SENDGRID_API_KEY` | SendGrid API key |
| `FROM_EMAIL` | Sender email address |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Fallback SMTP config |
| `ENABLE_POS_SYNC` | `true` to enable POS sync agent integration |
| `POS_AGENT_URL` | URL of the Windows POS sync agent |
| `POS_SECRET` | Shared secret for agent authentication |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary image hosting |

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend API base URL (e.g. `https://api.citi-nati.onrender.com/api`) |
| `VITE_BACKEND_URL` | Backend root URL (for socket.io) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `VITE_APP_NAME` | Display name: `Citi-Nati Supermarket` |
| `VITE_POS_AGENT_URL` | Local POS agent URL (e.g. `http://localhost:3001`) |
| `VITE_POS_SECRET` | Shared secret for POS agent auth |

---

## 5. Database Schema

All data is stored in a PostgreSQL database managed via Prisma ORM.

### Enums

```
PosCommandType:   UPDATE_PRICE | UPDATE_STOCK | APPLY_PROMOTION | REVERT_PROMOTION | WRITE_INVOICE
PosCommandStatus: PENDING | PROCESSING | COMPLETED | FAILED
```

### Models

---

#### `User`
Represents all platform users. Role drives access control.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Display name |
| `email` | String (unique) | Login identifier |
| `passwordHash` | String? | Null for Google-only accounts |
| `adminSecurityKeyHash` | String? | Hashed security key for admin 2FA |
| `driverSecurityKeyHash` | String? | Hashed security key for driver 2FA |
| `cashierSecurityKeyHash` | String? | Hashed PIN for cashier login |
| `role` | String | `user` \| `admin` \| `driver` \| `cashier` |
| `isActive` | Boolean | Account enabled flag |
| `emailVerified` | Boolean | Email verification status |
| `verificationCode` | String? | 6-digit OTP |
| `verificationCodeExpiry` | DateTime? | OTP expiry time |
| `passwordResetCode` | String? | 6-digit reset OTP |
| `passwordResetCodeExpiry` | DateTime? | Reset OTP expiry |

Relations: `cart`, `orders`, `supportTickets`

---

#### `Product`
The product catalogue. Can be from manual entry or synced from POS.

| Field | Type | Notes |
|---|---|---|
| `id` | Int (auto) | Primary key |
| `sourceCode` | String? (unique) | POS product code — unique |
| `name` | String | Product name |
| `price` | Float | Current selling price |
| `originalPrice` | Float? | Pre-promotion price |
| `discountPrice` | Float? | Promotion discount price |
| `isOnSale` | Boolean | Whether discount is active |
| `stock` | Int | Current stock quantity |
| `category` | String? | Category name |
| `description` | String? | Product description |
| `barcode` | String? | Barcode |
| `expiryDate` | DateTime? | Product expiry date |
| `expiryBatchCount` | Int | Number of expiry batches |
| `image` | String? | Cloudinary image URL |
| `isActive` | Boolean | Visible to customers |
| `hideFromProductsPage` | Boolean | Hidden from storefront |
| `enabled` | Boolean | POS-controlled enabled flag |
| `overrideActive` | Boolean | Admin override for active |
| `overrideStock` | Int? | Admin manually set stock level |
| `lowStockThreshold` | Int? | Alert threshold |
| `overrideReason` | String? | Reason for override |
| `overrideUpdatedAt` | DateTime? | When override was set |
| `overrideUpdatedBy` | String? | Admin who set override |

Relations: `cartItems`, `orderItems`, `emergencySaleItems`

---

#### `Cart` / `CartItem`
Per-user persistent cart.

| Cart Field | Type | Notes |
|---|---|---|
| `id` | Int | Primary key |
| `userId` | UUID (unique FK) | One cart per user |

| CartItem Field | Type | Notes |
|---|---|---|
| `id` | Int | Primary key |
| `cartId` | Int FK | Parent cart |
| `productId` | Int FK | Product |
| `quantity` | Int | Quantity |
| `price` | Float | Price at time of add |

---

#### `Order` / `OrderItem`
Customer purchase orders.

| Order Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `userId` | UUID FK | Ordering user |
| `total` | Float | Order total |
| `status` | String | `PENDING` \| `CONFIRMED` \| `OUT_FOR_DELIVERY` \| `DELIVERED` \| `CANCELLED` |
| `deliveryAddress` | String | Street address |
| `houseNumber` | String | House/unit number |
| `phone` | String? | Contact number |
| `latitude` / `longitude` | Float? | GPS coordinates |
| `paymentStatus` | String | `PENDING` \| `PAID` \| `REFUNDED` |
| `paymentReference` | String? | PayChangu transaction ref |
| `notes` | String? | Delivery instructions |
| `driverId` | UUID? FK | Assigned driver |
| `salesDayId` | Int? FK | Associated sales day |

---

#### `Driver`
Driver profile (separate from User account).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Driver name |
| `phone` | String? (unique) | Contact |
| `email` | String? (unique) | Login email for driver account |

---

#### `SalesDay`
Daily sales tracking period.

| Field | Type | Notes |
|---|---|---|
| `id` | Int | Primary key |
| `date` | DateTime | Day date |
| `status` | String | `OPEN` \| `CLOSED` |
| `openedAt` | DateTime | When opened |
| `closedAt` | DateTime? | When closed |
| `totalSales` | Float | Sum of all order totals |
| `totalOrders` | Int | Count of orders |

---

#### `SupportTicket` / `TicketReply` / `TicketAttachment` / `TicketReadStatus`
Customer support system.

---

#### `Promotion`
Three promotional types stored as singleton records.

| Field | Type | Notes |
|---|---|---|
| `id` | Int | Primary key |
| `type` | String (unique) | `global` \| `category` \| `selective` |
| `enabled` | Boolean | Active flag |
| `percentage` | Float | Discount percentage |
| `categoryId` | String? | For category type |
| `selectedProductIds` | Int[] | For selective type |

---

#### `AdminMessage`
Admin notification inbox.

---

#### `PendingUser`
Staging table for unverified new registrations.

---

#### `PasswordReset`
Active password reset requests (one per email).

---

#### `PosWriteCommand`
Command queue for write-back to POS SQL Server.

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | Primary key |
| `commandType` | PosCommandType enum | Type of operation |
| `status` | PosCommandStatus enum | Current status |
| `payload` | Json | Command-specific data |
| `source` | String | Originator |
| `retryCount` | Int | Retry attempts |
| `maxRetries` | Int | Maximum allowed retries |
| `errorMessage` | String? | Last error |
| `resultSummary` | String? | Completion details |

---

#### `SiteSetting`
Key-value config store (e.g. `maintenanceMode: "true"`).

---

#### `ProductExpiryBatch`
Expiry batch records synced from POS SQL Server.

---

#### `EmergencySale` / `EmergencySaleItem`
Sales recorded by cashiers when the main POS is unavailable.

| EmergencySale Field | Type | Notes |
|---|---|---|
| `id` | cuid | Primary key |
| `saleRef` | String (unique) | Human-readable reference |
| `cashierId` | String? | User ID of cashier |
| `cashierName` | String | Cashier display name |
| `subtotal` | Float | Before discount |
| `discount` | Float | Applied discount |
| `total` | Float | Final total |
| `tenderedAmount` | Float | Cash tendered |
| `changeAmount` | Float | Change to return |
| `paymentMethod` | String | `cash` \| `mobile` etc. |
| `syncStatus` | String | `pending` \| `synced` \| `failed` |
| `posInvoiceNo` | String? | Invoice number from POS |
| `retryCount` | Int | Sync retry count |
| `cartSnapshot` | Json? | Full cart at time of sale |

---

## 6. Backend Architecture

### 6.1 Entry Point & Server Setup

**File:** `citi-nati-backend/src/server.js`

- Creates an Express app
- Configures CORS with credentials for the frontend origin
- Parses JSON and cookies
- Mounts all API routers under `/api/*`
- Initialises Socket.io on the same HTTP server
- Starts listening on `process.env.PORT`

### 6.2 Authentication & Authorization

**JWT Flow:**
1. On login, the server signs a JWT with `{ userId, role, email }` and a configurable secret
2. The token is returned to the client and stored in `localStorage`
3. On every protected request, the client sends `Authorization: Bearer <token>`
4. `verifyTokenMiddleware` validates the token and attaches `req.user`
5. Role middleware (`verifyAdmin`, `verifyDriver`, `verifyCashier`) then checks `req.user.role`

**Security Keys (2FA Layer):**
- Admins, drivers, and cashiers each have an optional "security key" (hashed PIN/password)
- The frontend prompts for this key on a separate step before granting access to sensitive dashboards
- These are stored as bcrypt hashes on the `User` record

**Middleware files:**

| File | Purpose |
|---|---|
| `src/middleware/auth.middleware.js` | Token validation → `req.user` |
| `src/middleware/admin.middleware.js` | Require `role === 'admin'` |
| `src/middleware/driver.middleware.js` | Require `role === 'driver'` |
| `src/middleware/cashier.middleware.js` | Require `role === 'cashier'` |

### 6.3 API Routes Reference

#### Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create a `PendingUser`, send verification email |
| POST | `/api/auth/verify-email` | Public | Confirm 6-digit OTP, promote to `User` |
| POST | `/api/auth/resend-verification-code` | Public | Resend OTP email |
| POST | `/api/auth/login` | Public | Validate credentials, return JWT |
| POST | `/api/auth/logout` | Public | Clear auth cookie |
| POST | `/api/auth/google` | Public | Google ID token → login/register |
| POST | `/api/auth/forgot-password` | Public | Send reset code to email |
| POST | `/api/auth/reset-password` | Public | Validate code, set new password |

---

#### Products (`/api/products`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/products` | Public | List products with filtering, pagination, category |
| GET | `/api/products/:id` | Public | Get single product detail |
| GET | `/api/products/categories` | Public | List distinct product categories |
| POST | `/api/products` | Admin | Create product (with image upload) |
| PUT | `/api/products/:id` | Admin | Update product (with image upload) |
| PUT | `/api/products/:id/visibility` | Admin | Toggle `isActive` / `hideFromProductsPage` |
| PATCH | `/api/products/:id/stock-threshold` | Admin | Set `lowStockThreshold` |
| DELETE | `/api/products/:id` | Admin | Delete product |
| POST | `/api/products/sync/pos` | Admin | Manual trigger POS data pull |
| POST | `/api/products/pos-sync/push` | API Key | POS agent pushes product data |
| DELETE | `/api/products/pos-sync/clear` | Admin | Clear all POS-synced products |

---

#### Cart (`/api/cart`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/cart` | User | Get current user's cart |
| POST | `/api/cart` | User | Add item to cart |
| POST | `/api/cart/add` | User | Add item to cart (alias) |
| PUT | `/api/cart/update` | User | Update item quantity |

---

#### Orders (`/api/orders`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/orders` | User | Create order from cart |
| GET | `/api/orders` | User | List user's orders |
| GET | `/api/orders/:id` | User | Get order detail |
| GET | `/api/orders/by-reference/:ref` | User | Get order by payment reference |
| GET | `/api/orders/payment-check/:ref` | User | Poll payment status |
| GET | `/api/orders/:id/receipt` | User | Get PDF receipt |
| PUT | `/api/orders/:id/status` | User/Driver | Update order status |
| PUT | `/api/orders/:id/assign-driver` | Admin | Assign driver to order |

---

#### Payments (`/api/payments`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/payments/initialize` | User | Start PayChangu payment, return redirect URL |
| POST | `/api/payments/webhook` | Public | PayChangu webhook — mark order paid, reduce stock |

---

#### Sales Days (`/api/sales`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/sales/start` | Admin | Open a new sales day |
| POST | `/api/sales/end` | Admin | Close the current sales day |
| GET | `/api/sales/current` | Admin | Get current open sales day |
| GET | `/api/sales/history` | Admin | List all sales days |
| GET | `/api/sales/:id` | Admin | Get sales day detail |
| GET | `/api/sales/:id/export` | Admin | Download CSV export |
| DELETE | `/api/sales/history` | Admin | Clear sales history |

---

#### Drivers (`/api/drivers`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/drivers` | Admin | List all drivers |
| POST | `/api/drivers` | Admin | Create driver profile |
| POST | `/api/drivers/with-account` | Admin | Create driver + linked user account |
| PUT | `/api/drivers/:id` | Admin | Update driver details |
| DELETE | `/api/drivers/:id` | Admin | Remove driver |
| GET | `/api/drivers/performance` | Admin | Driver delivery performance metrics |
| GET | `/api/drivers/performance/:salesDayId` | Admin | Performance by sales day |
| DELETE | `/api/drivers/performance` | Admin | Clear performance records |
| GET | `/api/drivers/orders` | Driver | Driver's assigned orders |
| PUT | `/api/drivers/orders/:id/status` | Driver | Update delivery status |
| GET | `/api/drivers/security-key/status` | Driver | Check own security key presence |
| POST | `/api/drivers/security-key/verify` | Driver | Verify own security key |

---

#### Support Tickets (`/api/support`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/support/tickets` | User | Create support ticket |
| GET | `/api/support/my-tickets` | User | List own tickets |
| GET | `/api/support/tickets/:id` | User | Get ticket thread |
| POST | `/api/support/tickets/:id/reply` | User/Admin | Add reply |
| DELETE | `/api/support/tickets/:id` | User | Delete own ticket |
| GET | `/api/support/tickets` | Admin | List all tickets |
| PATCH | `/api/support/tickets/:id/status` | Admin | Change ticket status |
| PATCH | `/api/support/tickets/:id/priority` | Admin | Change ticket priority |

---

#### Admin (`/api/admin`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/dashboard` | Dashboard totals (users, orders) |
| GET | `/api/admin/system/settings` | Get all site settings |
| POST | `/api/admin/system/settings` | Toggle maintenance mode |
| GET | `/api/admin/security-key/status` | Admin's own key status |
| PUT | `/api/admin/security-key` | Set/change admin security key |
| POST | `/api/admin/security-key/verify` | Verify admin key |
| GET | `/api/admin/security-key/driver/:userId/status` | Check driver key status |
| PUT | `/api/admin/security-key/driver/:userId` | Set/change driver key |
| GET | `/api/admin/promotions` | Get current promotions |
| PUT | `/api/admin/promotions` | Update promotion config |
| POST | `/api/admin/promotions/preview` | Preview price changes |
| POST | `/api/admin/promotions/apply` | Apply promotion to products |
| POST | `/api/admin/promotions/remove` | Remove promotion |
| GET | `/api/admin/expiry/candidates` | Products nearing expiry |
| POST | `/api/admin/expiry/preview` | Preview expiry promotion |
| POST | `/api/admin/expiry/apply` | Apply expiry price reduction |
| POST | `/api/admin/expiry/revert` | Revert expiry promotion |
| GET | `/api/admin/expiry/alerts` | Low-stock + expiry alerts |
| POST | `/api/admin/products/:id/stock-override` | Manually override stock |
| GET | `/api/admin/refunds` | Orders pending refund |
| POST | `/api/admin/refunds/:id/mark-refunded` | Mark order as refunded |
| GET | `/api/admin/cashiers` | List all cashier users |
| POST | `/api/admin/cashiers` | Create cashier account |
| PUT | `/api/admin/cashiers/:id` | Update cashier |
| DELETE | `/api/admin/cashiers/:id` | Delete cashier |
| PUT | `/api/admin/cashiers/:id/pin` | Set/reset cashier PIN |

---

#### Emergency Sales (`/api/admin/emergency-sales`, `/api/cashier/emergency-sales`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `.../lookup` | Admin/Cashier | Search products by name or barcode |
| POST | `...` | Admin/Cashier | Record a new emergency sale |
| GET | `...` | Admin/Cashier | List emergency sales (scoped by role) |
| GET | `.../emergency-sales/:id` | Admin | Get single emergency sale detail |
| POST | `.../emergency-sales/:id/retry-sync` | Admin | Retry failed POS sync |

---

#### Admin Messages (`/api/admin/messages`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/messages` | Get all inbox messages |
| PATCH | `/api/admin/messages/:id/read` | Mark single read |
| PATCH | `/api/admin/messages/read/all` | Mark all read |
| PATCH | `/api/admin/messages/:id/unread` | Mark single unread |
| DELETE | `/api/admin/messages/:id` | Delete single message |
| DELETE | `/api/admin/messages` | Delete all messages |

---

#### POS Commands (`/api/pos-commands`)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/pos-commands/poll` | Agent polls for pending commands |
| POST | `/api/pos-commands/:id/complete` | Agent marks command complete |
| POST | `/api/pos-commands/:id/fail` | Agent marks command failed |
| GET | `/api/pos-commands` | List all commands (admin) |
| GET | `/api/pos-commands/:id` | Get single command |
| GET | `/api/pos-commands/stats` | Command queue statistics |

---

#### POS Sync (`/api/pos-sync`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/pos-sync/pending-emergency-sales` | Agent fetches unsynchronised emergency sales |
| POST | `/api/pos-sync/ack-emergency-sale-synced` | Agent acknowledges successful sync |
| POST | `/api/pos-sync/ack-emergency-sale-failed` | Agent acknowledges failed sync |

---

#### System (`/api/system`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/system/status` | Public — returns `{ maintenanceMode: bool }` |

---

### 6.4 Controllers

| Controller | Key Responsibilities |
|---|---|
| `auth.controller.js` | Registration, email verification, login, Google OAuth, password reset, logout |
| `product.controller.js` | Product CRUD, POS sync, visibility, stock threshold, expiry alerts, stock overrides |
| `order.controller.js` | Order creation (with inventory deduction), status updates, receipt generation, refunds |
| `cart.controller.js` | Cart CRUD — add, view, update quantities |
| `payments.controller.js` | PayChangu payment initialisation and webhook processing |
| `drivers.controller.js` | Driver CRUD, performance metrics, order management |
| `sales.controller.js` | Sales day lifecycle, history, CSV export |
| `support.controller.js` | Ticket lifecycle, replies, admin management |
| `upload.controller.js` | Ticket attachment upload and download |
| `promotion.controller.js` | Manual promotions (global, category, selective) |
| `posExpiryPromotion.controller.js` | Expiry-based price reductions, POS write-back |
| `posCommands.controller.js` | POS write-command queue management |
| `emergencySales.controller.js` | Emergency sale CRUD, product lookup, POS sync handshake |
| `admin-messages.controller.js` | Admin inbox read/unread/delete |
| `users.controller.js` | User management |

### 6.5 Services

| Service | Description |
|---|---|
| `posCommandQueue.service.js` | Creates `PosWriteCommand` records for the agent to process |
| `posSync.service.js` | Calls the POS agent via HTTP (product push, command notification) |
| `cache.service.js` | Simple in-memory key-value cache with TTL |

### 6.6 Utilities

| Utility | Description |
|---|---|
| `jwt.js` | `generateToken(payload)`, `verifyToken(token)` |
| `emailService.js` | Sends transactional emails via SendGrid (SMTP fallback) |
| `messageService.js` | Creates `AdminMessage` records (replaces real-time alerts in some cases) |
| `socket.js` | `emitNewOrder`, `emitOrderAssigned`, `emitOrderUpdated` — server-side emitters |
| `expiryStatus.js` | Computes "expiring soon" / "expired" labels based on date |
| `stockResolver.js` | Merges database stock with manual overrides |
| `verificationCode.js` | Generates 6-digit OTP codes |
| `webhookCache.js` | Deduplicates incoming payment webhooks by reference |

---

## 7. Frontend Architecture

### 7.1 App Entry & Routing

**File:** `src/App.jsx`

The app wraps everything in:
- `GoogleOAuthProvider` — Google OAuth context
- `AuthProvider` — JWT authentication state
- `CartProvider` — cart count state
- `BrowserRouter` — React Router
- `Toaster` — global toast notifications

**Maintenance mode check:** `App.jsx` polls `/api/system/status` every 30 seconds. If `maintenanceMode` is true, all routes redirect to `/maintenance` except:
- `/admin` and `/admin-login` — admin bypass
- `/cashier` — cashier bypass
- `/maintenance` itself

**All Frontend Routes:**

| Path | Component | Access |
|---|---|---|
| `/` | `Home` | Public |
| `/login` | `Login` | Public |
| `/register` | `Register` | Public |
| `/verify-email` | `VerifyEmail` | Public |
| `/forgot-password` | `ForgotPassword` | Public |
| `/reset-password` | `ResetPassword` | Public |
| `/products` | `Products` | Public |
| `/products/:id` | Product detail (within Products) | Public |
| `/cart` | `Cart` | Public |
| `/checkout` | `Checkout` | Public |
| `/payment-success` | `PaymentSuccess` | Public |
| `/my-orders` | `MyOrders` | Public |
| `/about` | `About` | Public |
| `/help-center` | `HelpCenter` | Public |
| `/contact` | `Contact` | Public |
| `/faqs` | `FAQs` | Public |
| `/terms` | `Terms` | Public |
| `/returns` | `Returns` | Public |
| `/maintenance` | `MaintenanceMode` | Public |
| `/admin-login` | `AdminMaintenanceLogin` | Public |
| `/admin` | `AdminDashboard` | `ProtectedRoute` (admin) |
| `/admin/emergency-sales` | `AdminDashboard` (emergency tab) | `ProtectedRoute` (admin) |
| `/driver` | `DriverDashboard` | `ProtectedRoute` (driver) |
| `/cashier` | `CashierDashboard` | `ProtectedRoute` (cashier) |
| `*` | `NotFound` | Public |

**`ProtectedRoute`:** Reads `user` from `AuthContext`. If not authenticated or wrong role, redirects to `/login`. For admin/driver/cashier, also checks security key verification before rendering the dashboard.

### 7.2 Authentication Flow

1. User submits login form → `POST /api/auth/login`
2. Server returns `{ token, user: { id, name, email, role } }`
3. `AuthContext.login()` saves to `localStorage` via `tokenStorage`, sets axios default `Authorization` header
4. `ProtectedRoute` reads `AuthContext.user` to decide access
5. On logout: `AuthContext.logout()` clears storage and header; if cashier, shows confirmation modal first

### 7.3 Pages

**Public pages:**

| Page | Description |
|---|---|
| `Home` | Landing page with featured products and promotions |
| `Login` | Email/password form + Google Sign-In button |
| `Register` | Sign-up form — submits registration, redirects to verify-email |
| `VerifyEmail` | OTP entry form to verify email |
| `ForgotPassword` | Sends reset code to email |
| `ResetPassword` | Enters reset code and new password |
| `Products` | Product catalogue with category filter, search, pagination |
| `Cart` | Shopping cart with quantity management and totals |
| `Checkout` | Delivery address form, order summary, PayChangu payment launch |
| `PaymentSuccess` | Confirmation page after successful payment |
| `MyOrders` | Order history with status tracking per order |
| `About` | About the supermarket |
| `HelpCenter` | Help articles |
| `Contact` | Contact form (creates support ticket) |
| `FAQs` | Frequently asked questions |
| `Terms` | Terms and conditions |
| `Returns` | Return policy |
| `MaintenanceMode` | Shown during maintenance; includes link to admin login |
| `AdminMaintenanceLogin` | Admin login page accessible during maintenance |
| `NotFound` | 404 page |

**Admin page (`pages/admin/AdminDashboard.jsx`):**  
Single-page dashboard with tab-based navigation routing to all admin sub-components.

**Driver page (`pages/driver/DriverDashboard.jsx`):**  
Driver-specific full-screen interface showing assigned orders and status controls.

**Cashier page (`pages/cashier/CashierDashboard.jsx`):**  
Full-screen emergency POS interface (no site header/footer). Uses `AdminEmergencySales` component scoped to cashier API.

### 7.4 Components

**Admin components (`src/components/admin/`):**

| Component | Description |
|---|---|
| `AdminOrders` | Orders table, status management, driver assignment, order details modal |
| `AdminProducts` | Product catalogue management — add, edit, delete, hide/show, POS sync |
| `AdminUsers` | User list management |
| `AdminDrivers` | Driver CRUD, performance stats |
| `AdminCashiers` | Cashier account management — create/edit/delete, PIN management |
| `AdminSales` | Sales day open/close controls and history table |
| `AdminSecurity` | Security key management for admin, drivers, and cashiers |
| `AdminPromotions` | Set/apply/remove global, category, and selective promotions |
| `AdminStocks` | Stock override panel, low-stock alerts, expiry alerts |
| `AdminEmergencySales` | Emergency POS panel (shared by admin and cashier) |
| `AdminEmergencySalesReports` | Reports: Overview, Sales Log, By Product, By Cashier tabs — with CSV/PDF export |
| `AdminRefunds` | Pending refund list — mark as refunded |
| `AdminSystem` | Maintenance mode toggle, site settings |
| `AdminInbox` | Admin notification inbox — read, unread, delete messages |
| `SalesDayControls` | Start/end sales day widget |
| `SalesHistoryTable` | Historical sales days list |
| `SalesReports` | Sales analytics and charts |
| `DriverPerformanceTable` | Driver delivery metrics |
| `OrderDetailsModal` | Pop-up order detail view |
| `POSSyncButton` | Manual POS sync trigger button |

**Common components (`src/components/common/`):**

| Component | Description |
|---|---|
| `Modal` | Reusable modal dialog (confirm, alert, form) |
| `PromotionBanner` | Displays active promotions on storefront |
| `AccountAvatar` | User avatar + dropdown in navbar |
| `CookieConsentBanner` | GDPR cookie consent notification |
| `DesktopNavbar` | Navigation bar for desktop |
| `DesktopFilterNav` | Category filter navigation |
| `MobileBottomNav` | Mobile bottom navigation bar |

**Layout (`src/components/layout/`):**

| Component | Description |
|---|---|
| `Header` | Site header with logo, navigation, cart icon, account menu |
| `Footer` | Site footer with links |
| `Layout` | Wrapper that conditionally shows Header + Footer (hidden on `/admin`, `/driver`, `/cashier` paths) |

### 7.5 Context & State Management

**`AuthContext.jsx`**
- Provides: `user`, `token`, `isLoading`, `isAuthenticated`
- Methods: `login(userData, token)`, `logout()`
- Persists to `localStorage` via `tokenStorage.js`
- On mount: reads stored token, validates shape, restores session

**`CartContext.jsx`**
- Provides: `cartCount`, `loading`
- Methods: `fetchCartCount()`, `updateCartCount(n)`, `incrementCart(qty)`, `decrementCart(qty)`, `resetCart()`
- `cartCount` drives the cart icon badge in the header

### 7.6 Hooks

| Hook | Description |
|---|---|
| `useModal.js` | `{ modal, showConfirm, showError, showAlert, closeModal }` — generic modal state management |
| `useGlobalNotifications.js` | Listens to Socket.io events and fires toast notifications for orders |
| `useOrderUpdates.js` | Real-time order status change listener, role-aware |
| `usePOSProducts.js` | Fetches POS product data from local sync agent |
| `useNonBlockingLoad.js` | Deferred/lazy data loading to prevent blocking initial renders |

### 7.7 Utilities

| Utility | Description |
|---|---|
| `api.js` | Axios instance — base URL, credentials, auto-bearer token |
| `tokenStorage.js` | `localStorage` wrappers for `auth_token` and `user` |
| `socket.js` | Socket.io client — init, socket identity |
| `notifications.js` | Toast helpers with optional sound (`notifySuccess`, `notifyError`, `notifyInfo`) |
| `currency.js` | MWK currency formatter (`MK 1,234.00`) |
| `pdfReports.js` | jsPDF report generation helpers |
| `salesService.js` | Sales day API call wrappers |
| `posSyncService.js` | HTTP client calls to local POS sync agent |
| `stockResolver.js` | Merges live stock with admin overrides for display |
| `orderValidation.js` | Pre-checkout validation (address, phone, payment) |
| `backendAlignment.js` | Normalises API response shapes |
| `chunkLoader.js` | Auto-retry on React lazy chunk load errors (e.g. after deploy) |

---

## 8. POS Sync Agent

**Location:** `pos-sync-agent/`  
**Distribution:** `pos-sync-agent.rar`

The POS Sync Agent is a lightweight Node.js service installed on the Windows server that hosts the in-store SQL Server POS database. It runs as a background process and provides a two-way bridge between the cloud backend and the local POS.

### Responsibilities

| Direction | What It Does |
|---|---|
| **POS → Cloud** | Reads product prices, stock levels, and expiry batches from SQL Server; pushes to `/api/products/pos-sync/push` |
| **Cloud → POS** | Polls `/api/pos-commands/poll`; processes write commands (price changes, promotion application, invoice writes) into SQL Server |
| **Emergency Sales sync** | Fetches `pending` `EmergencySale` records from `/api/pos-sync/pending-emergency-sales`; writes invoices into SQL Server; calls ACK endpoint |

### Authentication

Requests between the agent and backend are authenticated using a shared `POS_SECRET` key in the request header.

### Key Environment Variables (agent-side)

```
MSSQL_SERVER    Local SQL Server hostname
MSSQL_DATABASE  POS database name
MSSQL_USER      SQL Server login
MSSQL_PASSWORD  SQL Server password
BACKEND_URL     Cloud backend root URL
POS_SECRET      Shared secret
PORT            Local agent HTTP port (default 3001)
```

---

## 9. Feature Modules (End-to-End)

### 9.1 User Registration & Email Verification

1. User fills registration form (name, email, password)
2. `POST /api/auth/register` creates a `PendingUser` record and sends a 6-digit OTP email
3. User is redirected to `/verify-email`
4. User enters OTP → `POST /api/auth/verify-email`
5. If valid and not expired: `PendingUser` is deleted, a `User` is created with `emailVerified: true`
6. User is auto-logged-in and redirected to home

**Resend:** `POST /api/auth/resend-verification-code` regenerates and re-sends OTP.

---

### 9.2 Authentication (Login / Logout)

**Standard login:**
1. `POST /api/auth/login` with `{ email, password }`
2. Checks `User.passwordHash` with bcrypt
3. Returns `{ token, user }` on success
4. `AuthContext.login()` saves token and user to localStorage

**Logout:**
- Calls `AuthContext.logout()` → clears localStorage
- For cashier role: confirmation modal is shown before logout

---

### 9.3 Google OAuth

1. User clicks "Continue with Google"
2. Google returns an ID token to `@react-oauth/google`
3. Frontend sends token to `POST /api/auth/google`
4. Backend verifies token with `google-auth-library`
5. Finds or creates the `User` record (email as identity)
6. Returns JWT → standard login flow

---

### 9.4 Password Reset

1. `POST /api/auth/forgot-password` — sends 6-digit reset code by email; creates/updates `PasswordReset` record
2. User enters code on `/reset-password`
3. `POST /api/auth/reset-password` — validates code, sets new `passwordHash`, deletes `PasswordReset` record

---

### 9.5 Product Catalogue

**Public storefront (`/products`):**
- Paginated product grid with category filter sidebar
- Search by name
- Price shows promotional price if `isOnSale`
- Products with `isActive: false` or `hideFromProductsPage: true` are hidden
- Click product → navigates to product detail page

**Admin management:**
- Full CRUD via `AdminProducts`
- Image upload to Cloudinary
- Toggle visibility per product
- Import from POS sync
- Clear POS-imported products

---

### 9.6 Shopping Cart

- Accessible via `/cart`
- `CartContext` tracks count; badge shown on header icon
- Add from product listing or detail
- Update quantities inline
- Cart persists in DB (`Cart` + `CartItem` models)
- Shows live stock availability

---

### 9.7 Checkout & Payment (PayChangu)

1. User fills checkout form (delivery address, house number, phone, optional notes)
2. `POST /api/orders` creates the `Order` and `OrderItem` records (stock validation occurs)
3. `POST /api/payments/initialize` calls PayChangu API → returns redirect URL
4. User is redirected to PayChangu hosted payment page
5. User pays → PayChangu sends `POST /api/payments/webhook`
6. Webhook handler:
   - Validates signature
   - Marks order `paymentStatus: PAID`
   - Deducts product stock
   - Emits `newOrder` socket event
   - Creates admin inbox message
7. User lands on `/payment-success` page

---

### 9.8 Order Management

**Customer view (`/my-orders`):**
- Lists all own orders with status badges
- Real-time status updates via Socket.io

**Admin view (`AdminOrders`):**
- Full order table with filters
- Assign driver to order
- Update order status manually
- View order details (items, address, payment info)

**Driver view (`DriverDashboard`):**
- Shows only assigned orders
- Update status: `CONFIRMED` → `OUT_FOR_DELIVERY` → `DELIVERED`

---

### 9.9 Driver System

**Admin controls (`AdminDrivers`):**
- Create driver profile with optional linked user account
- Set/reset driver security key
- View delivery performance per driver and per sales day

**Driver dashboard (`/driver`):**
- Full-screen interface (no site header/footer)
- Security key prompt on first visit
- Shows assigned orders grouped by status

---

### 9.10 Sales Day Management

A "Sales Day" groups orders within a date range for reporting.

- Admin opens a sales day (`POST /api/sales/start`)
- New orders are automatically associated with the current open `SalesDay`
- Admin closes the day (`POST /api/sales/end`) — records totals
- `SalesHistoryTable` shows all past days with totals
- CSV export per sales day available

---

### 9.11 Promotions & Discounts

Three promotion types, managed in `AdminPromotions`:

| Type | How It Works |
|---|---|
| **Global** | Applies a percentage discount to all products |
| **Category** | Applies discount to all products in a chosen category |
| **Selective** | Applies discount to admin-selected individual products |

**Apply flow:**
1. Admin sets percentage and scope
2. Preview shows affected products and new prices
3. "Apply" updates `price`, saves `originalPrice`, sets `isOnSale: true` on affected products
4. Queues `APPLY_PROMOTION` / `REVERT_PROMOTION` commands for POS write-back
5. "Remove" reverts prices from `originalPrice`

---

### 9.12 POS Sync & Product Import

Two sync directions:

**Inbound (POS → Cloud):**
- POS agent pushes product data (price, stock, expiry) to `/api/products/pos-sync/push`
- Backend upserts `Product` records by `sourceCode`
- Expiry batches upserted to `ProductExpiryBatch`

**Outbound (Cloud → POS):**
- Price changes from admin promotions/manual edits queue `PosWriteCommand` records
- Agent polls, processes commands, ACKs completion/failure

Manual trigger available from `AdminProducts` via `POSSyncButton`.

---

### 9.13 Expiry Management

Located in `AdminStocks`:
- Shows products with upcoming expiry dates (sourced from `ProductExpiryBatch`)
- Admin can apply a percentage reduction ("expiry promotion") to move expiring stock
- System queues `APPLY_PROMOTION` POS command for the price change
- Admin can revert promotions on expired items

---

### 9.14 Emergency Sales (Cashier POS)

Used when the main POS system is unavailable.

**Process:**
1. Cashier (or admin) opens the Emergency Sales panel
2. Search products by name or barcode (`GET .../lookup`)
3. Add to cart, set quantities
4. Set payment method, tendered amount
5. `POST .../emergency-sales` records the `EmergencySale` + `EmergencySaleItem` records
6. A `saleRef` is generated (e.g. `ES-20260323-0001`)
7. `syncStatus` starts as `pending`
8. POS agent later picks up via `/api/pos-sync/pending-emergency-sales`
9. Agent writes invoice to SQL Server POS
10. Agent calls ACK endpoint → `syncStatus` becomes `synced` or `failed`
11. Admin can manually retry failed syncs

**Data scoping:**
- Cashiers can only see and search their own sales
- Admin sees all sales across all cashiers

---

### 9.15 Cashier Role & Dashboard

**Account creation:** Admin creates cashier accounts via `AdminCashiers` tab in `AdminSecurity`:
- Name, email, initial PIN
- PIN stored as bcrypt hash

**Login:**
1. Cashier logs in with email + password on standard `/login`
2. `ProtectedRoute` detects `role === 'cashier'` → redirects to `/cashier`
3. Security key (PIN) verification prompt shown
4. On successful verification → full POS dashboard loads

**Dashboard:**
- Full-screen, no site header or footer
- Embeds `AdminEmergencySales` component (cashier scope)
- Logout shows confirmation modal before clearing session

---

### 9.16 Admin Inbox (Messages)

- Backend creates `AdminMessage` records for key events (new orders, payment webhooks, etc.)
- `AdminInbox` component polls for messages
- Admin can mark individual or all messages as read/unread
- Admin can delete individual or all messages
- Unread count shown as badge in dashboard

---

### 9.17 Support Tickets

**Customer flow:**
1. Create ticket with subject + message at `/contact` or Help Center
2. View own tickets at support section in account
3. Reply thread visible per ticket

**Admin flow (`SupportDashboard` page):**
- View all tickets
- Filter by status/priority
- Reply to any ticket
- Change ticket status (OPEN / IN_PROGRESS / RESOLVED / CLOSED)
- Change priority (LOW / MEDIUM / HIGH / URGENT)
- Attachments supported (file upload per reply)

---

### 9.18 Refunds

- When a payment webhook is processed but delivery fails, order may require refund
- `AdminRefunds` shows orders with `paymentStatus: PAID` where a refund was initiated
- Admin manually processes refund offline, then marks order as `REFUNDED` via
  `POST /api/admin/refunds/:id/mark-refunded`

---

### 9.19 Admin Security Keys

A two-factor access layer on top of JWT for sensitive roles:

- **Admin key:** Set by admin in `AdminSecurity`. Required to access admin dashboard features.
- **Driver key:** Set by admin per driver. Required before driver can access delivery features.
- **Cashier PIN:** Set by admin per cashier. Required before cashier POS is accessible.

Keys are stored as bcrypt hashes on the `User` record. Never returned in API responses.

---

### 9.20 Maintenance Mode

- Admin toggles via `AdminSystem` → `POST /api/admin/system/settings`
- Stored as `SiteSetting` record (`key: 'maintenanceMode'`, `value: 'true'/'false'`)
- Frontend polls `/api/system/status` every 30 seconds
- When active: all public pages redirect to `/maintenance`
- Exempt: `/admin`, `/cashier`, `/admin-login`, `/maintenance` itself
- Admin and cashier users bypass maintenance regardless of path

---

### 9.21 Real-Time Notifications (Socket.io)

Backend socket events:
- `newOrder` — fired when payment webhook confirms a new paid order
- `orderAssigned` — fired when admin assigns a driver
- `orderUpdated` — fired when order status changes

Frontend listeners:
- `useGlobalNotifications` — shows toast for admin/driver notifications
- `useOrderUpdates` — triggers re-fetch of order data in `MyOrders` / driver dashboard

---

### 9.22 Reports & Exports

**Emergency Sales Reports (`AdminEmergencySalesReports`):**

Four tabs:
1. **Overview** — total sales count, total revenue, average sale value
2. **Sales Log** — full tabular log with date, cashier, total, sync status; TOTAL row at bottom
3. **By Product** — revenue and quantity sold per product; TOTAL row at bottom
4. **By Cashier** — sales count, revenue, sync status per cashier; TOTAL row at bottom

Exports available per tab:
- **CSV** — downloads `.csv` file with data + TOTAL footer row
- **PDF** — downloads `.pdf` via jsPDF autoTable with TOTAL footer row

**Sales Day Reports (`SalesReports`):**
- Revenue, order counts, averages per sales day
- CSV export per day

**Driver Performance:**
- Delivery counts and totals per driver, per sales day

---

## 10. User Roles & Permissions

| Permission | Customer | Driver | Cashier | Admin |
|---|---|---|---|---|
| Browse products | ✅ | ✅ | ✅ | ✅ |
| Add to cart / checkout | ✅ | — | — | — |
| View own orders | ✅ | — | — | ✅ |
| File support ticket | ✅ | — | — | ✅ |
| Update order delivery status | — | ✅ | — | ✅ |
| View assigned orders | — | ✅ | — | ✅ |
| Emergency POS sales | — | — | ✅ | ✅ |
| View own emergency sales only | — | — | ✅ | — |
| View all emergency sales | — | — | — | ✅ |
| Manage products | — | — | — | ✅ |
| Manage orders | — | — | — | ✅ |
| Manage drivers | — | — | — | ✅ |
| Manage cashiers | — | — | — | ✅ |
| Manage users | — | — | — | ✅ |
| Apply promotions | — | — | — | ✅ |
| Open/close sales day | — | — | — | ✅ |
| Toggle maintenance mode | — | — | — | ✅ |
| View admin reports | — | — | — | ✅ |
| Manage support tickets | — | — | — | ✅ |
| Process refunds | — | — | — | ✅ |

---

## 11. Deployment

### Platform
- **Backend:** Render.com (Web Service)
- **Database:** Render PostgreSQL or Neon
- **Frontend:** Render.com (Static Site) or Vercel
- **POS Agent:** Windows machine at store (run as a service or scheduled task)

### Render Configuration (`render.yaml`)
- Defines the backend service (build command: `npm install`, start command: `npx prisma migrate deploy && node src/server.js`)
- Environment group variables mapped from Render dashboard

### Backend Deployment Steps
1. Push code to GitHub `main`
2. Render auto-deploys on push
3. `npx prisma migrate deploy` applies any new migrations
4. Health check: `GET /api/system/status`

### Frontend Deployment Steps
1. Set all `VITE_*` environment variables in Render/Vercel dashboard
2. Build command: `npm run build`
3. Publish directory: `dist`

### POS Agent Setup
1. Extract `pos-sync-agent.rar` on the Windows server
2. Run `npm install`
3. Create `.env` with SQL Server and backend credentials
4. Run `node server.js` (or configure as a Windows service via NSSM)

---

## 12. Known Constraints & Notes

- **Currency:** All prices are in Malawian Kwacha (MWK)
- **Image storage:** Product images are stored on Cloudinary (no local storage in production)
- **Ticket attachments:** Stored locally in `uploads/tickets/` — requires persistent disk on Render
- **POS sync:** Requires the POS agent running on a LAN-connected Windows machine with SQL Server access
- **Email:** Primary delivery via SendGrid; SMTP is a fallback. Both must be configured for reliability
- **Google OAuth:** Client ID must be configured both on the Google Cloud Console and in both `.env` files
- **Cashier PIN:** Stored as bcrypt hash — cannot be recovered, only reset by admin
- **Security keys:** All three security keys (admin, driver, cashier) are bcrypt-hashed — one-way only
- **PayChangu webhooks:** Must be configured in PayChangu dashboard to point to `POST /api/payments/webhook`
- **Socket.io:** Requires `withCredentials: true` on the frontend and correct CORS config on backend
- **Maintenance bypass:** The cashier path (`/cashier`) is exempt from maintenance mode so POS can keep operating
