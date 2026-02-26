# 🔌 QUICK API REFERENCE
**Backend Base URL:** `http://localhost:5000/api`

---

## AUTHENTICATION

### Register User
```
POST /auth/register
```
**Body:** `{ name, email, password }`  
**Response:** `{ message, user: { id, name, email } }`  
**Errors:** 400 (missing fields), 400 (user exists), 500

### Login User
```
POST /auth/login
```
**Body:** `{ email, password }`  
**Response:** `{ token, user: { id, email, name, role } }`  
**Errors:** 400 (missing fields), 401 (invalid), 500

---

## PRODUCTS

### Get All Products (Public)
```
GET /products
```
**Response:** `{ products: [...] }`

### Get Product by ID (Public)
```
GET /products/:id
```
**Response:** Single product object

### Create Product ⚠️ ADMIN
```
POST /products
Headers: Authorization: Bearer {token}
Body: FormData { name, price, stock, category, image? }
```

### Update Product ⚠️ ADMIN
```
PUT /products/:id
Headers: Authorization: Bearer {token}
Body: FormData { name?, price?, stock?, category?, image? }
```

### Delete Product ⚠️ ADMIN
```
DELETE /products/:id
Headers: Authorization: Bearer {token}
```

---

## CART

### Get Cart
```
GET /cart
Headers: Authorization: Bearer {token}
```
**Response:** `{ cartId, items: [...], total }`

### Add to Cart
```
POST /cart
POST /cart/add (alias)
Headers: Authorization: Bearer {token}
Body: { productId, quantity }
```

### Update Cart Item
```
PUT /cart/update
Headers: Authorization: Bearer {token}
Body: { productId, quantity }
```

---

## ORDERS

### Create Order
```
POST /orders
POST /orders/create (alias)
Headers: Authorization: Bearer {token}
Body: {
  deliveryAddress (required),
  houseNumber (required),
  latitude? (optional),
  longitude? (optional)
}
```
**Response:** `{ message, order: {...} }`

### Update Order Status ⚠️ ADMIN
```
PUT /orders/:id/status
Headers: Authorization: Bearer {token}
Body: { status }
```

### Assign Driver ⚠️ ADMIN
```
PUT /orders/:id/assign-driver
Headers: Authorization: Bearer {token}
Body: { driverId }
```

---

## DRIVERS

### Get All Drivers ⚠️ ADMIN
```
GET /drivers
Headers: Authorization: Bearer {token}
```
**Response:** `{ message, drivers: [...] }`

### Create Driver ⚠️ ADMIN
```
POST /drivers
Headers: Authorization: Bearer {token}
Body: { name, phone, email? }
```

### Update Driver ⚠️ ADMIN
```
PUT /drivers/:id
Headers: Authorization: Bearer {token}
Body: { name?, phone?, email? }
```

### Delete Driver ⚠️ ADMIN
```
DELETE /drivers/:id
Headers: Authorization: Bearer {token}
```

---

## CONSTANTS

### Status Values (Order)
- `PENDING` (default)
- `CONFIRMED`
- `CANCELLED`
- `DELIVERED`

### Payment Status Values
- `UNPAID` (default)
- `PAID`
- `PENDING`

### User Roles
- `USER` (default for registered users)
- `ADMIN` (special access)

### HTTP Status Codes
- `200` — Success (GET, PUT, DELETE)
- `201` — Created (POST)
- `400` — Bad Request
- `401` — Unauthorized (no token)
- `403` — Forbidden (wrong role)
- `404` — Not Found
- `500` — Server Error

---

## ENTITY RELATIONSHIPS

```
User (1) ──→ (1) Cart
         ──→ (N) Order

Product ──→ (N) CartItem
        ──→ (N) OrderItem

Cart (1) ──→ (N) CartItem
     (1) ──→ (1) User

Order ──→ (1) User
      ──→ (N) OrderItem
      ──→ (0..1) Driver

Driver ──→ (N) Order
```

---

## EXAMPLES

### Register & Login
```javascript
// 1. Register
const register = await fetch('http://localhost:5000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John', email: 'john@test.com', password: 'pass123' })
});
const userData = await register.json();

// 2. Login
const login = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'john@test.com', password: 'pass123' })
});
const { token } = await login.json();
localStorage.setItem('token', token);
```

### Get Products & Add to Cart
```javascript
// 1. Get products
const products = await fetch('http://localhost:5000/api/products')
  .then(r => r.json());

// 2. Add to cart
const addCart = await fetch('http://localhost:5000/api/cart', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  },
  body: JSON.stringify({ productId: 1, quantity: 2 })
});
```

### Get Cart & Create Order
```javascript
// 1. Get cart
const cart = await fetch('http://localhost:5000/api/cart', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// 2. Create order
const order = await fetch('http://localhost:5000/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    deliveryAddress: '123 Main Street',
    houseNumber: 'Apt 4B',
    latitude: -13.9626,
    longitude: 33.7741
  })
}).then(r => r.json());
```

---

## KEY REMINDERS

✅ **DO:**
- Include `Authorization: Bearer {token}` for authenticated endpoints
- Format prices with `formatMWK()` function
- Use exact field names from contract
- Validate before API calls

❌ **DON'T:**
- Submit `id`, `status`, `createdAt` from frontend
- Hash passwords on frontend
- Skip required fields
- Use currency other than MWK
- Invent new endpoints or fields

---

**For Complete Details:** See `src/contracts/backendContract.md`
