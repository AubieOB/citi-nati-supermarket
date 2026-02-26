# BACKEND CONTRACT DOCUMENTATION
**Generated:** February 22, 2026  
**Backend:** Express.js + Prisma + PostgreSQL  
**Frontend Version:** React 18 + Vite  

---

## TABLE OF CONTENTS
1. [USER ENTITY](#user-entity)
2. [PRODUCT ENTITY](#product-entity)
3. [ORDER ENTITY](#order-entity)
4. [DRIVER ENTITY](#driver-entity)
5. [CART ENTITY](#cart-entity)
6. [GLOBAL RULES](#global-rules)

---

## USER ENTITY

### 1️⃣ DATABASE SCHEMA

| Field | Data Type | Required | Optional | Default | Enum Values | FK/Relationship |
|-------|-----------|----------|----------|---------|-------------|-----------------|
| `id` | UUID (String) | ✅ | ❌ | `uuid()` | N/A | Primary Key |
| `name` | String | ✅ | ❌ | N/A | N/A | N/A |
| `email` | String | ✅ | ❌ | N/A | N/A | Unique constraint |
| `passwordHash` | String | ✅ | ❌ | N/A | N/A | Bcrypt hashed |
| `role` | String | ✅ | ❌ | `USER` | `USER`, `ADMIN` | N/A |
| `isActive` | Boolean | ✅ | ❌ | `true` | N/A | N/A |
| `createdAt` | DateTime | ✅ | ❌ | `now()` | N/A | N/A |
| `updatedAt` | DateTime | ✅ | ❌ | Auto-managed | N/A | N/A |
| **Relationships** | | | | | | |
| `cart` | Cart (1:1) | ❌ | ✅ | Null | N/A | One-to-One |
| `orders` | Order[] (1:N) | ❌ | ✅ | Empty array | N/A | One-to-Many |

**Notes:**
- `passwordHash`: Never stored or returned in API responses
- `role`: Determines API access permissions
- `isActive`: Currently set to true on creation, no deactivation logic implemented

---

### 2️⃣ API ENDPOINTS

#### **Register User**
```
POST /api/auth/register
```
- **Required Auth Role:** None (Public endpoint)
- **Request Body:**
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securePassword123"
  }
  ```
- **Validation Rules:**
  - All fields (`name`, `email`, `password`) are **required**
  - `email` must be unique (checked against DB)
  - `password` will be hashed with bcrypt (cost: 10)
- **Response (201 Created):**
  ```json
  {
    "message": "User registered successfully",
    "user": {
      "id": "uuid-string",
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing required fields
  - `400 Bad Request`: User already exists
  - `500 Internal Server Error`: Server error

---

#### **Login User**
```
POST /api/auth/login
```
- **Required Auth Role:** None (Public endpoint)
- **Request Body:**
  ```json
  {
    "email": "john@example.com",
    "password": "securePassword123"
  }
  ```
- **Validation Rules:**
  - Both `email` and `password` are **required**
  - Password is compared with bcrypt hash
  - Returns generic error for invalid email/password (security)
- **Response (200 OK):**
  ```json
  {
    "token": "jwt-token-string",
    "user": {
      "id": "uuid-string",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "USER"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing email or password
  - `401 Unauthorized`: Invalid email or password
  - `500 Internal Server Error`: Server error

---

### 3️⃣ BUSINESS LOGIC RULES

**Authentication & Authorization:**
- JWT token generated on successful login
- Token includes `userId` and `role` claims
- Token used for subsequent authenticated requests (Bearer scheme)
- Default role for new users: `USER`
- Admin role restricted to backend user updates only

**User Creation:**
- Each user gets unique UUID
- Email uniqueness enforced at DB level
- Password must be plaintext on register (frontend should not hash)
- Password immediately hashed with bcrypt(10) on backend
- User can have one cart (created on first cart action)
- User can have multiple orders

**Auto-calculated Fields:**
- `createdAt`: Set to current timestamp on user creation
- `updatedAt`: Auto-managed by Prisma (updated on any change)
- `isActive`: Always `true` on creation

---

### 4️⃣ FRONTEND CONTRACT REQUIREMENTS

| Field | Collected in Form? | Displayed? | Formatted? | Hidden? | Auto-calculated? |
|-------|-------------------|-----------|-----------|--------|-----------------|
| `name` | ✅ (Register) | ✅ (Dashboard) | ❌ | ❌ | ❌ |
| `email` | ✅ (Login/Register) | ✅ (Dashboard) | ❌ | ❌ | ❌ |
| `password` | ✅ (Login/Register) | ❌ | ❌ | ✅ (Always) | ❌ |
| `role` | ❌ | ✅ (Dashboard) | ❌ | ❌ | ✅ (From JWT) |
| `id` | ❌ | ❌ | ❌ | ✅ | ✅ (From JWT) |
| `isActive` | ❌ | ❌ | ❌ | ✅ | ✅ (Backend) |
| `createdAt` | ❌ | ❌ | ❌ | ✅ | ✅ (Backend) |
| `updatedAt` | ❌ | ❌ | ❌ | ✅ | ✅ (Backend) |

**Frontend Responsibility:**
- Never attempt to set `role`, `id`, `createdAt`, `updatedAt`
- Never hash password on frontend
- Store JWT token in localStorage after login
- Include token in Authorization header for all authenticated requests
- Display user role on dashboard (parsed from JWT)

---

---

## PRODUCT ENTITY

### 1️⃣ DATABASE SCHEMA

| Field | Data Type | Required | Optional | Default | Enum Values | FK/Relationship |
|-------|-----------|----------|----------|---------|-------------|-----------------|
| `id` | Int | ✅ | ❌ | Auto-increment | N/A | Primary Key |
| `name` | String | ✅ | ❌ | N/A | N/A | N/A |
| `price` | Float | ✅ | ❌ | N/A | N/A | MWK currency |
| `stock` | Int | ✅ | ❌ | N/A | N/A | Must be >= 0 |
| `category` | String | ✅ | ❌ | N/A | N/A | N/A |
| `image` | String | ❌ | ✅ | Null | N/A | File path |
| `createdAt` | DateTime | ✅ | ❌ | `now()` | N/A | N/A |
| `updatedAt` | DateTime | ✅ | ❌ | Auto-managed | N/A | N/A |
| **Relationships** | | | | | | |
| `cartItems` | CartItem[] | ❌ | ✅ | Empty array | N/A | One-to-Many |
| `orderItems` | OrderItem[] | ❌ | ✅ | Empty array | N/A | One-to-Many |

**Notes:**
- `price`: Stored as Float, always in MWK
- `stock`: Must be validated >= 0, decrements on order creation
- `image`: File path returned as full URL via `imageUrl` in responses
- `category`: Free-form string (no enum enforced)

---

### 2️⃣ API ENDPOINTS

#### **Get All Products**
```
GET /api/products
```
- **Required Auth Role:** None (Public endpoint)
- **Query Parameters:** None
- **Response (200 OK):**
  ```json
  {
    "products": [
      {
        "id": 1,
        "name": "Organic Apples",
        "price": 5000,
        "stock": 50,
        "category": "Fruits",
        "image": "uploads/products/apple.jpg",
        "imageUrl": "http://localhost:5000/uploads/products/apple.jpg",
        "createdAt": "2026-02-20T10:00:00Z",
        "updatedAt": "2026-02-20T10:00:00Z"
      }
    ]
  }
  ```
- **Status Codes:**
  - `200 OK`: Success
  - `500 Internal Server Error`: Server error

---

#### **Get Product by ID**
```
GET /api/products/:id
```
- **Required Auth Role:** None (Public endpoint)
- **Path Parameters:** `id` (integer, required)
- **Response (200 OK):**
  ```json
  {
    "id": 1,
    "name": "Organic Apples",
    "price": 5000,
    "stock": 50,
    "category": "Fruits",
    "image": "uploads/products/apple.jpg",
    "imageUrl": "http://localhost:5000/uploads/products/apple.jpg",
    "createdAt": "2026-02-20T10:00:00Z",
    "updatedAt": "2026-02-20T10:00:00Z"
  }
  ```
- **Error Responses:**
  - `404 Not Found`: Product not found
  - `500 Internal Server Error`: Server error

---

#### **Create Product** ⚠️ ADMIN ONLY
```
POST /api/products
```
- **Required Auth Role:** `ADMIN`
- **Request Body (multipart/form-data):**
  ```
  name: "Organic Apples"
  price: 5000
  stock: 50
  category: "Fruits"
  image: <file> (optional)
  ```
- **Validation Rules:**
  - All fields (`name`, `price`, `stock`, `category`) are **required**
  - `price`: Converted to Float
  - `stock`: Converted to Int, must be >= 0
  - `image`: Optional, multipart file upload
- **Response (201 Created):**
  ```json
  {
    "message": "Product created successfully",
    "product": {
      "id": 1,
      "name": "Organic Apples",
      "price": 5000,
      "stock": 50,
      "category": "Fruits",
      "image": "uploads/products/apple.jpg",
      "imageUrl": "http://localhost:5000/uploads/products/apple.jpg",
      "createdAt": "2026-02-20T10:00:00Z",
      "updatedAt": "2026-02-20T10:00:00Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing required fields
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

---

#### **Update Product** ⚠️ ADMIN ONLY
```
PUT /api/products/:id
```
- **Required Auth Role:** `ADMIN`
- **Path Parameters:** `id` (integer, required)
- **Request Body (multipart/form-data):**
  ```
  name: "Updated Name" (optional)
  price: 5500 (optional)
  stock: 40 (optional)
  category: "Fresh Fruits" (optional)
  image: <file> (optional)
  ```
- **Validation Rules:**
  - At least one field can be provided
  - Fields not provided are left unchanged
  - `price`: Converted to Float
  - `stock`: Converted to Int
  - `image`: Replaces existing image if provided
- **Response (200 OK):**
  ```json
  {
    "message": "Product updated successfully",
    "product": { /* updated product data */ }
  }
  ```
- **Error Responses:**
  - `404 Not Found`: Product not found
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

---

#### **Delete Product** ⚠️ ADMIN ONLY
```
DELETE /api/products/:id
```
- **Required Auth Role:** `ADMIN`
- **Path Parameters:** `id` (integer, required)
- **Response (200 OK):**
  ```json
  {
    "message": "Product deleted successfully"
  }
  ```
- **Error Responses:**
  - `404 Not Found`: Product not found
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

---

### 3️⃣ BUSINESS LOGIC RULES

**Stock Management:**
- Stock decrements when order is created
- Stock cannot go below 0 (validated in order creation)
- Order fails if insufficient stock available

**Image Handling:**
- Images stored in `uploads/products/` directory
- Returned as full URL: `http://localhost:5000/uploads/products/filename`
- Only ADMIN can upload/update images

**Price & Cost:**
- All prices in MWK (Malawi Kwacha)
- No currency conversion
- Float precision maintained

**Status Tracking:**
- Products have `createdAt` and `updatedAt` timestamps
- No soft deletes (hard delete only)

---

### 4️⃣ FRONTEND CONTRACT REQUIREMENTS

| Field | Collected in Form? | Displayed? | Formatted? | Hidden? | Auto-calculated? |
|-------|-------------------|-----------|-----------|--------|-----------------|
| `id` | ❌ | ✅ (Product page) | ❌ | ❌ | ✅ (Backend) |
| `name` | ✅ (Admin) | ✅ (Products page) | ❌ | ❌ | ❌ |
| `price` | ✅ (Admin) | ✅ (Products page) | ✅ (MWK format) | ❌ | ❌ |
| `stock` | ✅ (Admin) | ✅ (Admin dashboard) | ❌ | ❌ | ❌ |
| `category` | ✅ (Admin) | ✅ (Product page) | ❌ | ❌ | ❌ |
| `image` | ✅ (Admin) | ✅ (Products page) | ❌ | ❌ | ❌ |
| `imageUrl` | ❌ | ✅ (Products page) | ❌ | ❌ | ✅ (Backend) |
| `createdAt` | ❌ | ❌ | ❌ | ✅ | ✅ (Backend) |
| `updatedAt` | ❌ | ❌ | ❌ | ✅ | ✅ (Backend) |

**Frontend Responsibility:**
- Display all products in grid on `/products` page
- Show price in MWK format: `MWK 5,000`
- Only show "Add to Cart" button if `stock > 0`
- Disable quantity input if stock is 0
- Admin can only upload/update products (ADMIN role required)
- Never directly manipulate stock values
- Display imageUrl from backend response, not construct it

---

---

## ORDER ENTITY

### 1️⃣ DATABASE SCHEMA

| Field | Data Type | Required | Optional | Default | Enum Values | FK/Relationship |
|-------|-----------|----------|----------|---------|-------------|-----------------|
| `id` | Int | ✅ | ❌ | Auto-increment | N/A | Primary Key |
| `userId` | UUID (String) | ✅ | ❌ | N/A | N/A | FK: User.id |
| `total` | Float | ✅ | ❌ | N/A | N/A | MWK currency |
| `status` | String | ✅ | ❌ | `PENDING` | `PENDING`, `CONFIRMED`, `CANCELLED`, `DELIVERED` | Order status |
| `deliveryAddress` | String | ✅ | ❌ | N/A | N/A | N/A |
| `houseNumber` | String | ✅ | ❌ | N/A | N/A | N/A |
| `latitude` | Float | ❌ | ✅ | Null | N/A | Geolocation |
| `longitude` | Float | ❌ | ✅ | Null | N/A | Geolocation |
| `paymentStatus` | String | ✅ | ❌ | `UNPAID` | `UNPAID`, `PAID`, `PENDING` | Payment status |
| `driverId` | UUID (String) | ❌ | ✅ | Null | N/A | FK: Driver.id |
| `createdAt` | DateTime | ✅ | ❌ | `now()` | N/A | N/A |
| `updatedAt` | DateTime | ✅ | ❌ | Auto-managed | N/A | N/A |
| **Relationships** | | | | | | |
| `user` | User (N:1) | ✅ | ❌ | N/A | N/A | Many-to-One |
| `items` | OrderItem[] (1:N) | ✅ | ❌ | Empty array | N/A | One-to-Many |
| `driver` | Driver (N:1) | ❌ | ✅ | Null | N/A | Optional Many-to-One |

**Notes:**
- `status`: Controlled by ADMIN, not customer
- `paymentStatus`: Separate from order status
- `latitude` & `longitude`: Optional but **MUST BE PROVIDED** if order involves delivery
- `driverId`: Assigned by ADMIN after order creation
- `total`: Pre-calculated from cart items, not customer input

---

### 2️⃣ API ENDPOINTS

#### **Create Order**
```
POST /api/orders
POST /api/orders/create (alias)
```
- **Required Auth Role:** Authenticated user (`USER` or `ADMIN`)
- **Request Body:**
  ```json
  {
    "deliveryAddress": "123 Main Street",
    "houseNumber": "Apt 4B",
    "latitude": -13.9626,
    "longitude": 33.7741
  }
  ```
- **Validation Rules:**
  - `deliveryAddress` is **required**
  - `houseNumber` is **required**
  - `latitude` and `longitude` are **optional** but recommended
  - User's cart must have at least 1 item
  - All items must have sufficient stock
  - Transaction: Order created + Stock decremented + Cart cleared (atomic)
- **Response (201 Created):**
  ```json
  {
    "message": "Order created successfully",
    "order": {
      "id": 1,
      "userId": "uuid-string",
      "total": 15000,
      "status": "PENDING",
      "paymentStatus": "UNPAID",
      "deliveryAddress": "123 Main Street",
      "houseNumber": "Apt 4B",
      "latitude": -13.9626,
      "longitude": 33.7741,
      "createdAt": "2026-02-22T10:00:00Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing required fields (`deliveryAddress`, `houseNumber`)
  - `400 Bad Request`: Cart is empty
  - `400 Bad Request`: Insufficient stock for product
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Server error

**⚠️ CRITICAL:** Order creation uses database transaction. All or nothing approach:
- Order is created
- OrderItems are created (one per cart item)
- Product stock is decremented for each item
- Cart items are deleted
- If any step fails, entire transaction rolls back

---

#### **Update Order Status** ⚠️ ADMIN ONLY
```
PUT /api/orders/:id/status
```
- **Required Auth Role:** `ADMIN`
- **Path Parameters:** `id` (integer, required)
- **Request Body:**
  ```json
  {
    "status": "CONFIRMED"
  }
  ```
- **Validation Rules:**
  - `status` is **required**
  - No validation of status values (any string accepted)
  - Order must exist
- **Response (200 OK):**
  ```json
  {
    "message": "Order status updated successfully",
    "order": {
      "id": 1,
      "status": "CONFIRMED",
      /* ... rest of order */
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Status not provided
  - `404 Not Found`: Order not found
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

---

#### **Assign Driver to Order** ⚠️ ADMIN ONLY
```
PUT /api/orders/:id/assign-driver
```
- **Required Auth Role:** `ADMIN`
- **Path Parameters:** `id` (integer, required)
- **Request Body:**
  ```json
  {
    "driverId": "driver-uuid-string"
  }
  ```
- **Validation Rules:**
  - `driverId` is **required**
  - Driver must exist in database
  - Order must exist
- **Response (200 OK):**
  ```json
  {
    "message": "Driver assigned to order successfully",
    "order": {
      "id": 1,
      "status": "PENDING",
      "driverId": "driver-uuid-string",
      "driver": {
        "id": "driver-uuid-string",
        "name": "John Driver",
        "phone": "+265999999999",
        "email": "driver@email.com"
      },
      "user": { /* user data */ },
      "items": [ /* order items */ ],
      /* ... rest of order */
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Driver ID not provided
  - `400 Bad Request`: Invalid order ID
  - `404 Not Found`: Order or Driver not found
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

---

### 3️⃣ BUSINESS LOGIC RULES

**Order Creation Flow:**
1. User must be authenticated
2. User's cart must have items
3. All item quantities checked against current stock
4. Order record created with `status: PENDING`, `paymentStatus: UNPAID`
5. For each cart item:
   - OrderItem created with quantity and locked-in price
   - Product stock decremented
6. Cart items deleted
7. Socket event `newOrder` emitted to admin dashboard

**Status Transitions:**
- Initial: `PENDING`
- Can be changed to any string value (no enum enforcement)
- Common values: `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED`
- Admin controls all transitions

**Payment Status:**
- Initial: `UNPAID`
- No automatic updates (manual admin update)
- Values: `UNPAID`, `PAID`, `PENDING`

**Driver Assignment:**
- Optional, happens after order creation
- Only ADMIN can assign
- One driver per order
- Driver can have multiple orders

**Geolocation:**
- `latitude` and `longitude` are optional on order creation
- Should be captured from checkout form if delivery involves mapping
- Used for driver routing/logistics

**Auto-calculated Fields:**
- `total`: Sum of (quantity × price) for each cart item
- `createdAt`: Set on order creation
- `updatedAt`: Auto-managed by Prisma

---

### 4️⃣ FRONTEND CONTRACT REQUIREMENTS

| Field | Collected in Form? | Displayed? | Formatted? | Hidden? | Auto-calculated? |
|-------|-------------------|-----------|-----------|--------|-----------------|
| `id` | ❌ | ✅ (Order history) | ❌ | ❌ | ✅ (Backend) |
| `userId` | ❌ | ❌ | ❌ | ✅ | ✅ (From JWT) |
| `deliveryAddress` | ✅ (Checkout) | ✅ (Order details) | ❌ | ❌ | ❌ |
| `houseNumber` | ✅ (Checkout) | ✅ (Order details) | ❌ | ❌ | ❌ |
| `latitude` | ✅ (Checkout) | ❌ | ❌ | ✅ | ❌ |
| `longitude` | ✅ (Checkout) | ❌ | ❌ | ✅ | ❌ |
| `total` | ❌ | ✅ (Checkout summary) | ✅ (MWK format) | ❌ | ✅ (Cart total) |
| `status` | ❌ | ✅ (Order history) | ❌ | ❌ | ✅ (Backend) |
| `paymentStatus` | ❌ | ✅ (Order details) | ❌ | ❌ | ✅ (Backend) |
| `driverId` | ❌ | ❌ | ❌ | ✅ | ✅ (Admin assigns) |
| `items` | ❌ | ✅ (Order details) | ❌ | ❌ | ✅ (From cart) |
| `createdAt` | ❌ | ✅ (Order history) | ✅ (Date format) | ❌ | ✅ (Backend) |
| `updatedAt` | ❌ | ❌ | ❌ | ✅ | ✅ (Backend) |

**Frontend Responsibility:**
- MUST collect `deliveryAddress` and `houseNumber` on checkout
- SHOULD collect `latitude` and `longitude` (geolocation or manual entry)
- Display order total in MWK format: `MWK 15,000`
- Never submit `status`, `paymentStatus`, or `driverId` from frontend
- Extract `userId` from JWT token (not from form)
- Show order history page with all user's orders
- Display human-readable dates (not timestamps)
- Show driver details only after driver is assigned by admin

---

---

## DRIVER ENTITY

### 1️⃣ DATABASE SCHEMA

| Field | Data Type | Required | Optional | Default | Enum Values | FK/Relationship |
|-------|-----------|----------|----------|---------|-------------|-----------------|
| `id` | UUID (String) | ✅ | ❌ | `uuid()` | N/A | Primary Key |
| `name` | String | ✅ | ❌ | N/A | N/A | N/A |
| `phone` | String | ✅ | ❌ | N/A | N/A | Unique constraint |
| `email` | String | ❌ | ✅ | Null | N/A | Unique constraint |
| `createdAt` | DateTime | ✅ | ❌ | `now()` | N/A | N/A |
| **Relationships** | | | | | | |
| `assignedOrders` | Order[] (1:N) | ❌ | ✅ | Empty array | N/A | One-to-Many |

**Notes:**
- `phone`: Must be unique, enforced at DB level
- `email`: Optional but must be unique if provided
- `id`: Auto-generated UUID
- Drivers do not have user accounts (independent entity)

---

### 2️⃣ API ENDPOINTS

#### **Get All Drivers** ⚠️ ADMIN ONLY
```
GET /api/drivers
```
- **Required Auth Role:** `ADMIN`
- **Query Parameters:** None
- **Response (200 OK):**
  ```json
  {
    "message": "Drivers retrieved successfully",
    "drivers": [
      {
        "id": "uuid-string",
        "name": "John Driver",
        "phone": "+265999999999",
        "email": "john@driver.com",
        "createdAt": "2026-02-20T10:00:00Z",
        "assignedOrders": [
          { "id": 1, "status": "DELIVERED" },
          { "id": 2, "status": "PENDING" }
        ]
      }
    ]
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

---

#### **Create Driver** ⚠️ ADMIN ONLY
```
POST /api/drivers
```
- **Required Auth Role:** `ADMIN`
- **Request Body:**
  ```json
  {
    "name": "John Driver",
    "phone": "+265999999999",
    "email": "john@driver.com"
  }
  ```
- **Validation Rules:**
  - `name` is **required**
  - `phone` is **required** and must be **unique**
  - `email` is **optional** but must be **unique** if provided
- **Response (201 Created):**
  ```json
  {
    "message": "Driver created successfully",
    "driver": {
      "id": "uuid-string",
      "name": "John Driver",
      "phone": "+265999999999",
      "email": "john@driver.com",
      "createdAt": "2026-02-20T10:00:00Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing required fields
  - `400 Bad Request`: Duplicate phone or email
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

---

#### **Update Driver** ⚠️ ADMIN ONLY
```
PUT /api/drivers/:id
```
- **Required Auth Role:** `ADMIN`
- **Path Parameters:** `id` (UUID string, required)
- **Request Body:**
  ```json
  {
    "name": "Updated Name",
    "phone": "+265888888888",
    "email": "newemail@driver.com"
  }
  ```
- **Validation Rules:**
  - At least one field must be provided
  - `phone`: Must be unique if updated (checked against all other drivers)
  - `email`: Must be unique if updated
  - Driver must exist
- **Response (200 OK):**
  ```json
  {
    "message": "Driver updated successfully",
    "driver": {
      "id": "uuid-string",
      "name": "Updated Name",
      "phone": "+265888888888",
      "email": "newemail@driver.com",
      "createdAt": "2026-02-20T10:00:00Z",
      "assignedOrders": []
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Driver ID missing or no fields provided
  - `404 Not Found`: Driver not found
  - `400 Bad Request`: Duplicate phone or email
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

---

#### **Delete Driver** ⚠️ ADMIN ONLY
```
DELETE /api/drivers/:id
```
- **Required Auth Role:** `ADMIN`
- **Path Parameters:** `id` (UUID string, required)
- **Response (200 OK):**
  ```json
  {
    "message": "Driver deleted successfully"
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Driver ID missing
  - `404 Not Found`: Driver not found
  - `401 Unauthorized`: No token provided
  - `403 Forbidden`: User is not admin
  - `500 Internal Server Error`: Server error

**⚠️ IMPORTANT:** Deleting a driver does NOT delete their assigned orders. Orders remain in system but `driverId` becomes null.

---

### 3️⃣ BUSINESS LOGIC RULES

**Driver Creation:**
- Each driver gets unique UUID
- Phone number must be unique (enforced at DB level)
- Email optional but must be unique if provided
- No authentication (drivers are not users)

**Driver Assignment:**
- Only ADMIN can assign drivers to orders
- Done via `/api/orders/:id/assign-driver` endpoint
- One driver can have multiple orders
- Reassignment allowed (updating order's driverId)

**Driver Deletion:**
- Hard delete (no soft delete)
- Assigned orders are NOT deleted
- Orders retain order history but driver reference becomes null

**Auto-calculated Fields:**
- `id`: UUID generated on creation
- `createdAt`: Set on driver creation
- `assignedOrders`: Fetched from Order table (not stored data)

---

### 4️⃣ FRONTEND CONTRACT REQUIREMENTS

| Field | Collected in Form? | Displayed? | Formatted? | Hidden? | Auto-calculated? |
|-------|-------------------|-----------|-----------|--------|-----------------|
| `id` | ❌ | ✅ (Admin dashboard) | ❌ | ❌ | ✅ (Backend) |
| `name` | ✅ (Admin) | ✅ (Admin dashboard) | ❌ | ❌ | ❌ |
| `phone` | ✅ (Admin) | ✅ (Admin dashboard) | ❌ | ❌ | ❌ |
| `email` | ✅ (Admin) | ✅ (Admin dashboard) | ❌ | ❌ | ❌ |
| `assignedOrders` | ❌ | ✅ (Driver details) | ❌ | ❌ | ✅ (Backend) |
| `createdAt` | ❌ | ❌ | ❌ | ✅ | ✅ (Backend) |

**Frontend Responsibility:**
- Admin can create drivers with name, phone, email
- Phone must be validated for format (Malawi format recommended)
- Display driver list in admin dashboard
- Show assigned orders count per driver
- Allow edit/delete of driver details
- Cannot create drivers without admin role
- Display driver assignment interface on order management page

---

---

## CART ENTITY

### 1️⃣ DATABASE SCHEMA

| Field | Data Type | Required | Optional | Default | Enum Values | FK/Relationship |
|-------|-----------|----------|----------|---------|-------------|-----------------|
| `id` | Int | ✅ | ❌ | Auto-increment | N/A | Primary Key |
| `userId` | UUID (String) | ✅ | ❌ | N/A | N/A | FK: User.id (Unique) |
| `createdAt` | DateTime | ✅ | ❌ | `now()` | N/A | N/A |
| `updatedAt` | DateTime | ✅ | ❌ | Auto-managed | N/A | N/A |
| **Relationships** | | | | | | |
| `user` | User (1:1) | ✅ | ❌ | N/A | N/A | One-to-One |
| `items` | CartItem[] (1:N) | ✅ | ❌ | Empty array | N/A | One-to-Many |

**CartItem Schema:**

| Field | Data Type | Required | Optional | Default | Enum Values | FK/Relationship |
|-------|-----------|----------|----------|---------|-------------|-----------------|
| `id` | Int | ✅ | ❌ | Auto-increment | N/A | Primary Key |
| `cartId` | Int | ✅ | ❌ | N/A | N/A | FK: Cart.id (Cascade) |
| `productId` | Int | ✅ | ❌ | N/A | N/A | FK: Product.id |
| `quantity` | Int | ✅ | ❌ | N/A | N/A | Must be > 0 |
| `price` | Float | ✅ | ❌ | N/A | N/A | Locked-in product price |
| `createdAt` | DateTime | ✅ | ❌ | `now()` | N/A | N/A |
| `updatedAt` | DateTime | ✅ | ❌ | Auto-managed | N/A | N/A |
| **Relationships** | | | | | | |
| `cart` | Cart (N:1) | ✅ | ❌ | N/A | N/A | Many-to-One |
| `product` | Product (N:1) | ✅ | ❌ | N/A | N/A | Many-to-One |

**Notes:**
- One cart per user (unique userId)
- Cart created on first add-to-cart action
- When cart items deleted via cascade, cart persists
- Price locked at time of add (not updated if product price changes)

---

### 2️⃣ API ENDPOINTS

#### **Get User's Cart**
```
GET /api/cart
```
- **Required Auth Role:** Authenticated user
- **Query Parameters:** None
- **Response (200 OK):**
  ```json
  {
    "cartId": 1,
    "items": [
      {
        "productId": 1,
        "name": "Organic Apples",
        "quantity": 2,
        "price": 5000,
        "subtotal": 10000,
        "imageUrl": "http://localhost:5000/uploads/products/apple.jpg"
      },
      {
        "productId": 2,
        "name": "Fresh Milk",
        "quantity": 1,
        "price": 3500,
        "subtotal": 3500,
        "imageUrl": "..."
      }
    ],
    "total": 13500
  }
  ```
- **Empty Cart Response:**
  ```json
  {
    "cartId": null,
    "items": [],
    "total": 0
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Server error

---

#### **Add Product to Cart**
```
POST /api/cart
POST /api/cart/add (alias)
```
- **Required Auth Role:** Authenticated user
- **Request Body:**
  ```json
  {
    "productId": 1,
    "quantity": 2
  }
  ```
- **Validation Rules:**
  - `productId` is **required**, must be parseable to Int
  - `quantity` is **required**, must be > 0
  - Product must exist
  - Cart auto-created if doesn't exist
  - If product already in cart, quantity is **incremented** (not replaced)
- **Response (200 OK):**
  ```json
  {
    "message": "Product added to cart successfully"
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Quantity must be greater than 0
  - `404 Not Found`: Product not found
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Server error

---

#### **Update Cart Item Quantity**
```
PUT /api/cart/update
```
- **Required Auth Role:** Authenticated user
- **Request Body:**
  ```json
  {
    "productId": 1,
    "quantity": 5
  }
  ```
- **Validation Rules:**
  - `productId` is **required**
  - `quantity` is **required**, must be >= 0
  - If quantity is 0, item is **deleted**
  - Product must be in user's cart
  - Quantity is set (not incremented)
- **Response (200 OK):**
  ```json
  {
    "message": "Cart item updated successfully"
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing or invalid fields
  - `404 Not Found`: Cart item not found
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Server error

---

### 3️⃣ BUSINESS LOGIC RULES

**Cart Creation:**
- Auto-created on first add-to-cart
- One cart per user (enforced by unique userId)
- Persists even after all items removed

**Adding Products:**
- Quantity checked > 0
- If product already in cart, quantities are **added** (not replaced)
- Price locked at time of add (snapshot of current product price)
- No stock validation on add (only on order creation)

**Updating Items:**
- Can increase or decrease quantity
- Setting quantity to 0 deletes the item
- Cannot exceed product stock (frontend responsibility to validate)

**Clearing Cart:**
- Cart automatically cleared when order is created
- All CartItems deleted in transaction with order creation
- Prices in OrderItems preserve the locked-in cart prices

**Price Handling:**
- CartItem.price: Locked when added
- If product price changes later, existing cart items keep old price
- New additions will get new price

---

### 4️⃣ FRONTEND CONTRACT REQUIREMENTS

| Field | Collected in Form? | Displayed? | Formatted? | Hidden? | Auto-calculated? |
|-------|-------------------|-----------|-----------|--------|-----------------|
| `id` (Cart) | ❌ | ❌ | ❌ | ✅ | ✅ (Backend) |
| `userId` | ❌ | ❌ | ❌ | ✅ | ✅ (From JWT) |
| **CartItem** | | | | | |
| `productId` | ✅ (Add to cart) | ❌ | ❌ | ✅ | ❌ |
| `name` | ❌ | ✅ (Cart page) | ❌ | ❌ | ✅ (From product) |
| `quantity` | ✅ (Cart page) | ✅ (Cart page) | ❌ | ❌ | ❌ |
| `price` | ❌ | ✅ (Cart page) | ✅ (MWK format) | ❌ | ✅ (Locked-in) |
| `subtotal` | ❌ | ✅ (Cart page) | ✅ (MWK format) | ❌ | ✅ (qty × price) |
| `imageUrl` | ❌ | ✅ (Cart page) | ❌ | ❌ | ✅ (Backend) |
| `total` | ❌ | ✅ (Cart summary) | ✅ (MWK format) | ❌ | ✅ (Sum all subtotals) |

**Frontend Responsibility:**
- Fetch cart on `/cart` page load
- Display all items with quantity, locked-in price, subtotal
- Allow quantity adjustment (increment/decrement)
- Show "Remove" button (set quantity to 0)
- Display cart total in MWK format: `MWK 13,500`
- Disable "Proceed to Checkout" if cart is empty
- Clear cart state after successful order creation
- Use productId (not name) for add-to-cart API calls
- Never modify locked-in prices

---

---

## GLOBAL RULES

### Authentication & Authorization

**Token Management:**
- JWT tokens issued on successful `/api/auth/login`
- Token format: `Bearer <jwt-token>`
- Token passed in `Authorization` header for all protected endpoints
- Token includes: `userId`, `role`, `iat`, `exp`
- Invalid/expired tokens return `401 Unauthorized`

**Role-Based Access Control:**
- `USER`: Default role, can create orders, manage cart
- `ADMIN`: Full access to products, drivers, orders status
- Missing token → `401 Unauthorized`
- Wrong role → `403 Forbidden`

### HTTP Status Codes

| Code | Scenario |
|------|----------|
| `200 OK` | Successful GET, PUT, DELETE |
| `201 Created` | Successful POST (resource created) |
| `400 Bad Request` | Invalid input, validation failed |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Authenticated but insufficient permissions |
| `404 Not Found` | Resource not found |
| `500 Internal Server Error` | Server error |

### Timestamps

**Format:**
- ISO 8601: `2026-02-22T10:00:00Z`
- All backend-generated timestamps in UTC

**Frontend Handling:**
- Parse using `new Date()` or library
- Display in user's local timezone
- Format as readable date: "Feb 22, 2026"

### Currency

**Global Rule: All prices in MWK (Malawi Kwacha)**
- No currency conversion
- Float precision maintained in database
- Frontend must format as: `MWK 12,500`
- Number formatting: Standard comma separators

### Validation Pattern

**Backend Validation:**
- All required fields validated before DB operations
- Type conversion (String → Int, Float) explicit
- Duplicate checks (email, phone, product) at DB level
- Stock checks transactional

**Frontend Validation:**
- Email format validation (basic)
- Positive numbers only (quantities, prices)
- Required fields not empty
- Should match backend validation

### Error Response Format

Standard error responses:
```json
{
  "error": "Human-readable error message"
}
```

Some endpoints return:
```json
{
  "message": "Error message"
}
```

### Real-Time Updates (Socket Events)

These events emitted by backend (non-blocking):
- `newOrder`: Admin dashboard notified of new order
- `orderStatusUpdated`: Admin/driver notified of status change
- `orderAssigned`: Driver notified of new assignment

Frontend should listen if implementing real-time dashboard.

---

## ENFORCEMENT RULES FOR FRONTEND

### 🔴 ABSOLUTE RESTRICTIONS

1. **NEVER** invent fields not in schema
2. **NEVER** rename API response fields
3. **NEVER** omit required fields from requests
4. **NEVER** assume default values
5. **NEVER** skip validation on required fields
6. **NEVER** hash passwords on frontend
7. **NEVER** directly manipulate `role`, `id`, `createdAt`, `updatedAt`
8. **NEVER** display prices without MWK format
9. **NEVER** change locked-in cart prices
10. **NEVER** submit `status`, `paymentStatus`, `driverId` from order creation

### ✅ ALIGNMENT CHECKLIST

Before implementing any frontend feature:

- [ ] Check database schema for exact field names
- [ ] Verify API endpoint path and method
- [ ] Confirm required vs optional fields
- [ ] Check role requirements
- [ ] Verify request body structure
- [ ] Verify response structure
- [ ] Check validation rules
- [ ] Ensure error handling matches status codes
- [ ] Currency always MWK
- [ ] Dates parsed and formatted correctly

---

**END OF CONTRACT DOCUMENT**
**Version:** 1.0  
**Last Updated:** February 22, 2026  
**Binding:** This document is the single source of truth for backend-frontend integration.
