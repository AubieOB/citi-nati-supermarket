# BACKEND-FRONTEND ALIGNMENT ENFORCEMENT
**Effective Date:** February 22, 2026  
**Binding Document:** Yes

---

## 📋 WHAT HAS BEEN GENERATED

### 1. Backend Contract Document
**Location:** `src/contracts/backendContract.md`

Complete specification containing:
- ✅ Database schema for User, Product, Order, Driver, Cart entities
- ✅ All API endpoints with method, path, auth requirements
- ✅ Request/response structures (exact JSON format)
- ✅ Status codes and error responses
- ✅ Business logic rules and validations
- ✅ Frontend contract requirements (what to collect, display, hide)

**This is the SINGLE SOURCE OF TRUTH for all backend integration.**

### 2. Currency Formatting Utility
**Location:** `src/utils/currency.js`

Functions:
- `formatMWK(amount)` → `"MWK 12,500"`
- `formatMWKNumber(amount)` → `"12,500"`
- `parseMWK(string)` → number

**RULE:** All prices MUST use these functions. No exceptions.

### 3. Backend Alignment Validator
**Location:** `src/utils/backendAlignment.js`

Validates:
- Required fields present
- No forbidden fields submitted
- Response schema matches contract
- Entity-specific validation (User, Product, Order, Cart, Driver)

**USE:** Before every API call and after every response

---

## 🔴 THE 10 ABSOLUTE RULES

### 1. NEVER Invent Fields
❌ **Wrong:**
```jsx
const order = {
  deliveryAddress: "...",
  houseNumber: "...",
  specialInstructions: "..." // <- NOT IN CONTRACT
};
```

✅ **Right:**
```jsx
const order = {
  deliveryAddress: "...",
  houseNumber: "...",
  latitude: -13.9626, // <- OPTIONAL, IN CONTRACT
  longitude: 33.7741
};
```

### 2. NEVER Rename Fields
❌ **Wrong:**
```jsx
// Response has: { id, name, price, stock }
product.itemId = product.id; // <- RENAMING
product.quantity = product.stock; // <- RENAMING
```

✅ **Right:**
```jsx
// Use exact field names from backend
console.log(product.id, product.stock);
```

### 3. NEVER Omit Required Fields
❌ **Wrong (on Checkout):**
```jsx
const orderData = {
  deliveryAddress: "123 Main Street"
  // Missing: houseNumber <- REQUIRED
};
```

✅ **Right:**
```jsx
const orderData = {
  deliveryAddress: "123 Main Street",
  houseNumber: "Apt 4B",
  latitude: -13.9626, // <- OPTIONAL BUT RECOMMENDED
  longitude: 33.7741
};
```

### 4. NEVER Assume Defaults
❌ **Wrong:**
```jsx
// Backend default is PENDING, but frontend doesn't verify
const orderStatus = data.status || 'PENDING';
```

✅ **Right:**
```jsx
// Trust backend default, display what server sends
const orderStatus = data.status; // Backend handles default
```

### 5. NEVER Skip Validation
❌ **Wrong:**
```jsx
const handleAddToCart = (productId, quantity) => {
  api.post('/cart', { productId, quantity }); // No validation
};
```

✅ **Right:**
```jsx
const handleAddToCart = (productId, quantity) => {
  // Validate before sending
  const validation = cartValidation.validateAddToCart({ productId, quantity });
  if (!validation.isValid) {
    showError(validation.errors);
    return;
  }
  api.post('/cart', { productId, quantity });
};
```

### 6. NEVER Hash Passwords on Frontend
❌ **Wrong:**
```jsx
import bcrypt from 'bcrypt';

const handleRegister = async (name, email, password) => {
  const hashedPassword = await bcrypt.hash(password, 10); // <- WRONG!
  api.post('/auth/register', { name, email, password: hashedPassword });
};
```

✅ **Right:**
```jsx
const handleRegister = async (name, email, password) => {
  // Send plaintext, backend hashes it
  api.post('/auth/register', { name, email, password });
};
```

### 7. NEVER Directly Manipulate System Fields
❌ **Wrong:**
```jsx
const createOrder = (deliveryAddress, houseNumber) => {
  return {
    deliveryAddress,
    houseNumber,
    id: Date.now(), // <- FORBIDDEN
    status: 'CONFIRMED', // <- FORBIDDEN
    userId: '123', // <- FORBIDDEN
    createdAt: new Date() // <- FORBIDDEN
  };
};
```

✅ **Right:**
```jsx
const createOrder = (deliveryAddress, houseNumber, latitude, longitude) => {
  return {
    deliveryAddress,
    houseNumber,
    latitude,
    longitude
    // Let backend generate: id, status, userId, createdAt
  };
};
```

### 8. NEVER Display Prices Without MWK Format
❌ **Wrong:**
```jsx
<div>Price: {product.price}</div>              {/* 5000 */}
<div>Total: ${order.total / 1000}</div>        {/* $15.00 */}
<div>Price: MWK {order.total}</div>            {/* MWK 15000 (no formatting) */}
```

✅ **Right:**
```jsx
import { formatMWK } from '../utils/currency';

<div>Price: {formatMWK(product.price)}</div>   {/* MWK 5,000 */}
<div>Total: {formatMWK(order.total)}</div>     {/* MWK 15,000 */}
```

### 9. NEVER Change Locked-in Cart Prices
❌ **Wrong:**
```jsx
// Cart item has price locked at time of add
const cartItem = { productId: 1, quantity: 2, price: 5000 };

// Later, product price changes to 6000
product.price = 6000;

// Wrong: Using new price
totalPrice = cartItem.quantity * product.price; // 12000 instead of 10000
```

✅ **Right:**
```jsx
const cartItem = { productId: 1, quantity: 2, price: 5000 };

// Always use cart item's locked price
totalPrice = cartItem.quantity * cartItem.price; // Always 10000
```

### 10. NEVER Submit Status/Payment Info from Frontend
❌ **Wrong (on Order Creation):**
```jsx
const createOrder = (deliveryAddress, houseNumber) => {
  return {
    deliveryAddress,
    houseNumber,
    status: 'PENDING', // <- FORBIDDEN, auto-set by backend
    paymentStatus: 'UNPAID', // <- FORBIDDEN, auto-set by backend
    driverId: null, // <- FORBIDDEN, admin assigns
    total: calculateTotal() // <- FORBIDDEN, backend calculates
  };
};
```

✅ **Right:**
```jsx
const createOrder = (deliveryAddress, houseNumber, latitude, longitude) => {
  return {
    deliveryAddress,
    houseNumber,
    latitude,
    longitude
    // Backend sets: status, paymentStatus, total, driverId
  };
};
```

---

## ✅ MANDATORY CHECKLIST

Before implementing ANY feature, check this:

- [ ] **Schema Verified** — Field names match backend exactly
- [ ] **Endpoints Verified** — Path, method, auth role confirmed
- [ ] **Required Fields Listed** — Know what's mandatory
- [ ] **Optional Fields Known** — What can be omitted?
- [ ] **Forbidden Fields Identified** — What NEVER to send?
- [ ] **Validation Imported** — Using `backendAlignment.js`?
- [ ] **Currency Formatted** — Using `formatMWK()` for prices?
- [ ] **Error Handling Added** — Status codes 400, 401, 403, 404, 500
- [ ] **Response Parsed** — Extract exact fields from response
- [ ] **Contract Reviewed** — Read contract section before coding

---

## 🌍 MALAWI-SPECIFIC RULES

### Currency: MWK (Malawi Kwacha)
- **Format Rule:** `MWK 12,500` (always with comma separator)
- **No decimals** unless backend explicitly provides them
- **No currency conversion** — All prices in MWK
- **Use utility:** `import { formatMWK } from '../utils/currency'`

### Location Coordinates
- **When Required:** Order creation
- **Format:** latitude (number), longitude (number)
- **Source:** Geolocation API OR manual form entry
- **Malawi Center:** ~-13.9626, 33.7741

### Phone Numbers
- **Context:** Driver registration
- **Format:** International format recommended (+265XXXXXXXXX)
- **Storage:** As string, no formatting in backend
- **Validation:** Length > 8 characters

---

## 📊 QUICK REFERENCE

### API Base URL
```
http://localhost:5000/api
```

### Auth Token Usage
```javascript
// Always include in authenticated requests
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('token')}`
};
```

### Standard Error Handling
```javascript
const handleError = (error) => {
  if (error.response?.status === 401) {
    // Token expired or invalid
    localStorage.removeItem('token');
    navigate('/login');
  } else if (error.response?.status === 403) {
    // Not authorized for this action
    showError('You don\'t have permission for this action');
  } else if (error.response?.status === 404) {
    // Resource not found
    showError('Item not found');
  } else if (error.response?.status === 400) {
    // Validation error
    showError(error.response.data.error);
  } else {
    // Server error
    showError('Server error. Try again later.');
  }
};
```

### MWK Formatting in Components
```javascript
import { formatMWK } from '../utils/currency';

export const ProductCard = ({ product }) => {
  return (
    <div>
      <h3>{product.name}</h3>
      <p>Price: {formatMWK(product.price)}</p>
      {product.stock === 0 && <p>Out of Stock</p>}
    </div>
  );
};
```

---

## 🚨 VIOLATION DETECTION

If you see these warnings in console:
```
⚠️  ALIGNMENT VIOLATION: Attempting to set forbidden fields: [role, status]
⚠️  ALIGNMENT VIOLATION: Missing required fields: [deliveryAddress, houseNumber]
```

**STOP!** There's a contract violation. Don't commit this code.

---

## 📞 QUESTIONS?

Check these in order:
1. `src/contracts/backendContract.md` — Complete specification
2. `src/utils/backendAlignment.js` — Validation examples
3. `src/utils/currency.js` — MWK formatting
4. Backend route files — For exact endpoint behavior

---

**LAST UPDATED:** February 22, 2026  
**BY WHOM:** GitHub Copilot (Backend Contract Analysis)  
**BINDING:** Yes, this is enforced code policy.
