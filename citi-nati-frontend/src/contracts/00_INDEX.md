# 📚 BACKEND CONTRACT SYSTEM - COMPLETE INDEX

**This is the single source of truth for all backend-frontend integration.**

Generated: February 22, 2026  
Status: ACTIVE & BINDING  
Enforgement: Mandatory for all frontend development

---

## 📖 DOCUMENTATION HIERARCHY

### Level 1: Executive Summary (This File)
👉 You are here. Start here for overview.

### Level 2: Quick Reference
**File:** `API_QUICK_REFERENCE.md`  
**Use When:** You need to quickly find an endpoint  
**Contains:** All endpoints, constants, basic examples

### Level 3: Alignment Rules & Best Practices
**File:** `ALIGNMENT_RULES.md`  
**Use When:** You're about to code a feature  
**Contains:** 10 absolute rules, enforcement checklist, common patterns

### Level 4: Setup & Usage Guide
**File:** `SETUP_GUIDE.md`  
**Use When:** You need detailed implementation guidance  
**Contains:** How to use utilities, workflows, error fixes

### Level 5: Complete Backend Specification
**File:** `backendContract.md`  
**Use When:** You need exact details about a feature  
**Contains:** All database schemas, endpoints, validations for each entity

---

## 🎯 QUICK START FLOW

### I'm implementing a new feature:
1. ✅ Read this file (context)
2. ✅ Check `API_QUICK_REFERENCE.md` (find endpoint)
3. ✅ Read `ALIGNMENT_RULES.md` (avoid violations)
4. ✅ Code using `SETUP_GUIDE.md` (implementation pattern)
5. ✅ Check details in `backendContract.md` (when in doubt)

### I have an error:
1. ✅ Check `ALIGNMENT_RULES.md` (common violations)
2. ✅ Use `backendAlignment.js` (validate before/after calls)
3. ✅ Check `backendContract.md` (exact specification)
4. ✅ Use `currency.js` (MWK formatting)

### I'm reviewing code:
1. ✅ Use checklist in `SETUP_GUIDE.md`
2. ✅ Use `ALIGNMENT_RULES.md` (10 rules check)
3. ✅ Run validation tests (see `SETUP_GUIDE.md`)

---

## 🛠️ UTILITY FILES CREATED

### 1. `src/utils/currency.js`
**Purpose:** Format all prices as MWK  
**Functions:**
- `formatMWK(5000)` → `"MWK 5,000"`
- `formatMWKNumber(5000)` → `"5,000"`
- `parseMWK("MWK 5,000")` → `5000`

**Usage:**
```javascript
import { formatMWK } from '../utils/currency';
<div>Price: {formatMWK(product.price)}</div>
```

### 2. `src/utils/backendAlignment.js`
**Purpose:** Validate data before/after API calls  
**Validators:**
- `userValidation.validateRegister(data)`
- `productValidation.validateList(products)`
- `orderValidation.validateCreate(data)`
- `cartValidation.validateAddToCart(data)`
- `driverValidation.validateCreate(data)`

**Usage:**
```javascript
import { orderValidation } from '../utils/backendAlignment';
const validation = orderValidation.validateCreate(formData);
if (!validation.isValid) {
  console.error(validation.errors);
  return;
}
```

---

## 📋 WHAT THE CONTRACT COVERS

### Entities & Their Specifications

#### 1. USER
- Schema: id, name, email, passwordHash, role, isActive, timestamps
- Endpoints: POST /auth/register, POST /auth/login
- Validations: Email unique, password bcrypt hashed
- Rules: Default role = USER, admin role restricted

#### 2. PRODUCT
- Schema: id, name, price (MWK), stock, category, image, timestamps
- Endpoints: GET, POST, PUT, DELETE /products (admin only)
- Validations: Required fields, image upload, stock >= 0
- Rules: Price locked on add-to-cart, image returns full URL

#### 3. ORDER
- Schema: id, userId, items, total, status, address, houseNumber, lat/lng, paymentStatus, driverId, timestamps
- Endpoints: POST /orders, PUT /orders/:id/status (admin), PUT /orders/:id/assign-driver (admin)
- Validations: Cart not empty, stock sufficient, atomic transaction
- Rules: Status & payment set by backend, driver assigned by admin, coordinates optional

#### 4. CART
- Schema: id, userId, items with productId/quantity/price/locked
- Endpoints: GET /cart, POST /cart, PUT /cart/update
- Validations: Quantity > 0, product exists, auto-create cart
- Rules: Prices locked at time of add, cleared on order creation

#### 5. DRIVER
- Schema: id, name, phone (unique), email (unique), assignedOrders, timestamps
- Endpoints: GET, POST, PUT, DELETE /drivers (admin only)
- Validations: Phone required & unique, email optional
- Rules: No user account, assigned to orders by admin

---

## ✅ ENFORCEMENT MECHANISM

### The 10 Absolute Rules

1. **NEVER Invent Fields** — Use only schema fields
2. **NEVER Rename Fields** — Use exact backend names
3. **NEVER Omit Required Fields** — Check contract before form
4. **NEVER Assume Defaults** — Wait for backend response
5. **NEVER Skip Validation** — Use backendAlignment.js
6. **NEVER Hash Passwords** — Send plaintext, backend hashes
7. **NEVER Manipulate System Fields** — Don't touch id, status, timestamps
8. **NEVER Display Prices Without MWK** — Use formatMWK() always
9. **NEVER Change Locked Prices** — Cart prices are snapshots
10. **NEVER Submit Auto Fields** — Don't send status, paymentStatus, driverId

### Violation Detection
- Console will warn: "⚠️  ALIGNMENT VIOLATION: Attempting to set forbidden fields: [...]"
- Validation will return: `{ isValid: false, errors: [...] }`
- Code review will catch: Against ALIGNMENT_RULES.md checklist

---

## 🌍 MALAWI-SPECIFIC CONFIGURATION

### Currency: MWK
- Format: `MWK 12,500` (comma separator)
- Function: Use `formatMWK()` from `currency.js`
- No conversion: All prices stay in MWK
- Decimals: Only if backend explicitly provides

### Location
- Latitude/Longitude optional on order creation
- Format: Float numbers
- Malawi examples: -13.9626, 33.7741 (Lilongwe center)
- Used for driver routing

### Phone Numbers
- Format: Store as string, no backend formatting
- Context: Driver phone numbers
- Recommendation: International format +265XXXXXXXXX

---

## 🔗 RELATIONSHIP MAP

```
┌─────────────────────────────────────────┐
│              USER                        │
│  id, name, email, role, isActive        │
└─────┬──────────────────────────┬─────────┘
      │ 1:1                      │ 1:N
      ▼                          ▼
  ┌─────────┐             ┌──────────┐
  │  CART   │             │  ORDER   │
  │ & items │             │ & items  │
  └────┬────┘             └────┬─────┘
       │ N:M                   │ N:1
       ▼                       ▼
   ┌────────┐            ┌──────────┐
   │ PRODUCT│            │  DRIVER  │
   └────────┘            └──────────┘
```

---

## 📊 API SUMMARY

| Entity | List | Create | Get One | Update | Delete | Auth |
|--------|------|--------|---------|--------|--------|------|
| User | - | ✅ /register | - | - | - | No |
| User | - | ✅ /login | - | - | - | No |
| Product | ✅ /products | ✅ Admin | ✅ /products/:id | ✅ Admin | ✅ Admin | Token |
| Cart | ✅ /cart | ✅ /cart | ✅ /cart | ✅ /cart/update | - | Token |
| Order | - | ✅ /orders | - | ✅ Admin /status | - | Token |
| Order | - | - | - | ✅ Admin /assign-driver | - | Token |
| Driver | ✅ Admin | ✅ Admin | - | ✅ Admin | ✅ Admin | Token |

---

## 🚀 GETTING STARTED TODAY

### Step 1: Read This File ✅
You've done this. You understand the structure.

### Step 2: Create Test Component
Follow `SETUP_GUIDE.md` → Workflow 1: Product Listing
- Fetch products
- Validate response
- Format prices with MWK
- Display with contract structure

### Step 3: Commit with Confidence
- Check items off SETUP_GUIDE.md checklist
- Run validation tests
- Code review against ALIGNMENT_RULES.md

---

## ❓ FAQ

**Q: Can I add fields not in the contract?**  
A: No. Submit only what the contract specifies.

**Q: What if backend returns different field names?**  
A: Document in contract update. Don't work around it.

**Q: What if price format is different?**  
A: Use formatMWK() to normalize. Never assume format.

**Q: What if I disagree with a contract rule?**  
A: Open issue with backend team. Don't violate contract.

**Q: Can I store user role differently?**  
A: No. Extract from JWT, don't invent storage.

**Q: What if status value is unknown?**  
A: Display as-is. Don't assume. Check with admin team.

---

## 📞 GETTING HELP

1. **"I'm not sure what fields to submit"** → Check API_QUICK_REFERENCE.md
2. **"I don't know if I should hide this field"** → Check backendContract.md Frontend Requirements
3. **"How do I format prices?"** → Use `formatMWK()` from currency.js
4. **"What's the error?"** → Check ALIGNMENT_RULES.md, then backendContract.md
5. **"How do I implement this feature?"** → Follow SETUP_GUIDE.md workflow

---

## 📝 DOCUMENT VERSIONS

| File | Version | Updated | Status |
|------|---------|---------|--------|
| backendContract.md | 1.0 | Feb 22, 2026 | ✅ Active |
| ALIGNMENT_RULES.md | 1.0 | Feb 22, 2026 | ✅ Active |
| API_QUICK_REFERENCE.md | 1.0 | Feb 22, 2026 | ✅ Active |
| SETUP_GUIDE.md | 1.0 | Feb 22, 2026 | ✅ Active |
| This file | 1.0 | Feb 22, 2026 | ✅ Active |

---

## ⚖️ LEGAL

These documents are:
- ✅ **Binding** for all frontend development
- ✅ **Enforceable** in code review
- ✅ **Reference** for disputes
- ✅ **Living** (can be updated with team approval)

Violations will be caught by:
1. Console warnings (backendAlignment.js)
2. API errors (400/401/403)
3. Code review (ALIGNMENT_RULES.md checklist)
4. QA testing (data validation failures)

---

## 📚 NAVIGATION

```
You need...                          Check this...
─────────────────────────────────────────────────────
Endpoint URL & method               API_QUICK_REFERENCE.md
Request body structure              API_QUICK_REFERENCE.md → backendContract.md
Response fields                     backendContract.md → Entity → API ENDPOINTS
Field validation rules              backendContract.md → Entity → BUSINESS LOGIC
What to display on UI               backendContract.md → Entity → FRONTEND CONTRACT
How to implement a component        SETUP_GUIDE.md → WORKFLOWS
Formatting rules (prices)           ALIGNMENT_RULES.md → MWK Rule
Error handling                      API_QUICK_REFERENCE.md → EXAMPLES or ALIGNMENT_RULES.md
Database design                     backendContract.md → DATABASE SCHEMA
Authorization testing               backendContract.md or API_QUICK_REFERENCE.md → Auth rows
```

---

**START HERE:** Pick your next task from the menu above. ✨

**Questions?** Check `ALIGNMENT_RULES.md` FAQ section.

**Ready to code?** Follow pattern in `SETUP_GUIDE.md`.

**Type of contract document:** REFERENCE + ENFORCEMENT (NOT a tutorial)

---

*Generated by GitHub Copilot — Backend Contract Analysis*  
*For: Citi-Nati Supermarket Frontend Development*  
*Binding: Until updated by team consensus*
