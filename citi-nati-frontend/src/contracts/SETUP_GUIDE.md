# 📁 CONTRACT SYSTEM SETUP & USAGE GUIDE

## Directory Structure
```
citi-nati-frontend/
├── src/
│   ├── contracts/                      ← NEW: Contract files
│   │   ├── backendContract.md          ← Complete backend specification
│   │   ├── ALIGNMENT_RULES.md          ← Enforcement rules & best practices
│   │   └── API_QUICK_REFERENCE.md      ← Quick API lookup
│   │
│   ├── utils/
│   │   ├── currency.js                 ← NEW: MWK formatting functions
│   │   ├── backendAlignment.js         ← NEW: Validation utilities
│   │   └── jwt.js                      ← Existing: JWT handling
│   │
│   ├── components/                    
│   │   └── ...                         ← UPDATE: Implement contract rules
│   │
│   ├── pages/
│   │   └── ...                         ← UPDATE: Use validators & formatMWK
│   │
│   └── styles/
│       └── global.css
```

---

## HOW TO USE THESE FILES

### 1️⃣ BEFORE CODING A FEATURE

**Always check the contract first:**

```
1. Open: src/contracts/backendContract.md
2. Find your entity (User, Product, Order, Driver, Cart)
3. Read section "1️⃣ DATABASE SCHEMA" → Understand data structure
4. Read section "2️⃣ API ENDPOINTS" → Know the exact endpoint
5. Read section "3️⃣ BUSINESS LOGIC RULES" → Understand constraints
6. Read section "4️⃣ FRONTEND CONTRACT REQUIREMENTS" → Know what to display
```

**Example:** Building checkout form
```markdown
1. Open backendContract.md
2. Find "ORDER ENTITY"
3. Check "4️⃣ FRONTEND CONTRACT REQUIREMENTS":
   - Must collect: deliveryAddress, houseNumber
   - Can collect: latitude, longitude
   - Must NOT collect: id, status, paymentStatus, total
4. Build form with only these fields
```

---

### 2️⃣ WHEN BUILDING A COMPONENT

**Import and use utilities:**

```javascript
import { formatMWK } from '../utils/currency';
import { orderValidation } from '../utils/backendAlignment';

const Checkout = () => {
  // 1. Validate form data before API call
  const handleSubmit = (formData) => {
    const validation = orderValidation.validateCreate(formData);
    if (!validation.isValid) {
      showErrors(validation.errors);
      return; // Don't submit
    }

    // 2. Safe to submit
    api.createOrder(formData);
  };

  // 3. Format prices in display
  return (
    <div>
      <h2>Order Total: {formatMWK(total)}</h2>
    </div>
  );
};
```

---

### 3️⃣ WHEN CALLING AN API ENDPOINT

**Use the quick reference:**

```javascript
// Step 1: Look up endpoint in API_QUICK_REFERENCE.md
// GET /cart → Headers: Authorization

// Step 2: Import utilities
import { validateResponseSchema } from '../utils/backendAlignment';

// Step 3: Call API safely
const fetchCart = async () => {
  const response = await fetch('/api/cart', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();

  // Step 4: Validate response matches contract
  const validation = validateResponseSchema(data, ['cartId', 'items', 'total']);
  if (!validation.isValid) {
    console.error('Contract violation:', validation.missing);
    return;
  }

  // Step 5: Safe to use
  return data;
};
```

---

### 4️⃣ WHEN DISPLAYING PRICES

**Always use formatMWK:**

```javascript
import { formatMWK } from '../utils/currency';

// Products page
<p>Price: {formatMWK(product.price)}</p>

// Cart page
<p>Total: {formatMWK(cartTotal)}</p>

// Order summary
<p>Subtotal: {formatMWK(subtotal)}</p>
<p>Shipping: {formatMWK(shipping)}</p>
<p>Tax: {formatMWK(tax)}</p>
<p>Total: {formatMWK(total)}</p>

// Admin: Display in table
<td>{formatMWKNumber(product.price)}</td>
```

---

### 5️⃣ WHEN BUILDING A FORM

**Check contract for required fields:**

```markdown
1. Open: backendContract.md → Find entity
2. Check section "4️⃣ FRONTEND CONTRACT REQUIREMENTS"
3. Look for "Collected in Form?" = ✅
4. These are REQUIRED in your form
```

**Example: Register Form**
```markdown
From backendContract.md - USER ENTITY - "4️⃣ FRONTEND CONTRACT":

| Field    | Collected in Form? |
|----------|-------------------|
| name     | ✅ (Register)     |
| email    | ✅ (Login/Register) |
| password | ✅ (Login/Register) |
| role     | ❌                |
| id       | ❌                |
```

So register form needs: name, email, password (only)

```javascript
const RegisterForm = () => {
  // Name field ✅
  // Email field ✅
  // Password field ✅
  // Role field ❌ (NOT in form)
  // ID field ❌ (NOT in form)
};
```

---

## COMMON WORKFLOWS

### Workflow 1: Product Listing
```javascript
import { formatMWK } from '../utils/currency';
import { productValidation } from '../utils/backendAlignment';

const ProductsList = () => {
  useEffect(() => {
    const fetchProducts = async () => {
      const res = await fetch('/api/products');
      const { products } = await res.json();

      // Validate response
      const validation = productValidation.validateList(products);
      if (!validation.isValid) {
        console.error('Schema mismatch:', validation.errors);
        return;
      }

      // Display with contract-compliant formatting
      return products.map(product => (
        <div key={product.id}>
          <h3>{product.name}</h3>
          <p>{formatMWK(product.price)}</p>
          <p>Stock: {product.stock}</p>
          {product.stock === 0 && <p>Out of Stock</p>}
        </div>
      ));
    };
  }, []);
};
```

### Workflow 2: Create Order
```javascript
import { orderValidation } from '../utils/backendAlignment';
import { formatMWK } from '../utils/currency';

const Checkout = () => {
  const [formData, setFormData] = useState({
    deliveryAddress: '',
    houseNumber: '',
    latitude: null,
    longitude: null
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. Validate using contract
    const validation = orderValidation.validateCreate(formData);
    if (!validation.isValid) {
      alert('Form errors:\n' + validation.errors.join('\n'));
      return;
    }

    // 2. Submit safely
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData)
    });

    if (response.status === 201) {
      const { order } = await response.json();
      alert(`Order created: ${order.id}`);
      // Display order total with proper formatting
      alert(`Total: ${formatMWK(order.total)}`);
    } else {
      alert(`Error: ${response.statusText}`);
    }
  };

  // Form should only have these fields (contract validated)
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="123 Main Street"
        value={formData.deliveryAddress}
        onChange={(e) => setFormData({...formData, deliveryAddress: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="Apt 4B"
        value={formData.houseNumber}
        onChange={(e) => setFormData({...formData, houseNumber: e.target.value})}
        required
      />
      {/* Latitude/Longitude optional */}
      <button type="submit">Create Order</button>
    </form>
  );
};
```

### Workflow 3: Cart Management
```javascript
import { cartValidation } from '../utils/backendAlignment';
import { formatMWK } from '../utils/currency';

const CartPage = () => {
  const [cart, setCart] = useState(null);
  const token = localStorage.getItem('token');

  const handleAddToCart = async (productId, quantity) => {
    // 1. Validate (contract requirement)
    const validation = cartValidation.validateAddToCart({ productId, quantity });
    if (!validation.isValid) {
      alert('Invalid input:\n' + validation.errors.join('\n'));
      return;
    }

    // 2. Submit
    const response = await fetch('/api/cart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ productId, quantity })
    });

    if (response.ok) {
      // Refresh cart
      loadCart();
    }
  };

  const loadCart = async () => {
    const response = await fetch('/api/cart', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setCart(data);
  };

  // Display cart with contract formatting
  return (
    <div>
      {cart?.items.map(item => (
        <div key={item.productId}>
          <p>{item.name}</p>
          <p>Price: {formatMWK(item.price)}</p>
          <p>Quantity: {item.quantity}</p>
          <p>Subtotal: {formatMWK(item.subtotal)}</p>
        </div>
      ))}
      <h2>Cart Total: {formatMWK(cart?.total)}</h2>
    </div>
  );
};
```

---

## CONTRACT VIOLATIONS & HOW TO FIX

### ❌ Error: Field Not in Contract
```
Console Error: "Contract violation: Attempting to set forbidden fields: [role, status]"

Fix:
1. Open backendContract.md
2. Find the entity's "4️⃣ FRONTEND CONTRACT REQUIREMENTS"
3. Check if field is allowed to be submitted
4. If "Hidden?" = ✅, remove it from your code
```

### ❌ Error: Missing Required Field
```
API Returns: 400 "Validation failed: deliveryAddress and houseNumber are required"

Fix:
1. Check backendContract.md → ORDER ENTITY → "4️⃣ FRONTEND CONTRACT"
2. Look for "Collected in Form?" = ✅
3. Add missing form inputs
4. Validate before submit using orderValidation.validateCreate()
```

### ❌ Error: Schema Mismatch
```
Console: "Missing fields: [imageUrl]"

Fix:
1. Backend returns nested field: imageUrl (computed from image path)
2. Don't assume image field name
3. Use response.imageUrl instead of response.image
4. Check backendContract.md for exact response structure
```

---

## QUICK CHECKLIST FOR EACH FEATURE

Before marking a feature as complete:

- [ ] Reviewed related section in backendContract.md
- [ ] Validated inputs using backendAlignment.js validators
- [ ] Formatted all prices using formatMWK()
- [ ] Used exact field names from contract (no renames)
- [ ] Omitted forbidden fields from requests
- [ ] Handled all status codes (200, 201, 400, 401, 403, 404, 500)
- [ ] Displayed data using exact contract structure
- [ ] Tested with invalid data (validation works?)
- [ ] Tested with missing token (401 handled?)
- [ ] Checked console for "ALIGNMENT VIOLATION" warnings

---

## TESTING YOUR ALIGNMENT

Run this in browser console to validate contract compliance:

```javascript
import { userValidation, productValidation, orderValidation } from './utils/backendAlignment';

// Test user registration
const registerTest = userValidation.validateRegister({
  name: 'John',
  email: 'john@test.com',
  password: 'pass123'
});
console.log('Register Valid?', registerTest.isValid);

// Test invalid (has forbidden field)
const registerInvalid = userValidation.validateRegister({
  name: 'John',
  email: 'john@test.com',
  password: 'pass123',
  role: 'ADMIN' // ❌ Forbidden
});
console.log('Should be invalid?', !registerInvalid.isValid);

// Test order creation
const orderTest = orderValidation.validateCreate({
  deliveryAddress: '123 Main',
  houseNumber: 'Apt 4B',
  latitude: -13.9626,
  longitude: 33.7741
});
console.log('Order Valid?', orderTest.isValid);
```

---

**Created:** February 22, 2026  
**For:** Citi-Nati Supermarket Frontend  
**Purpose:** Maintain perfect backend-frontend alignment  
**Status:** ACTIVE & BINDING
