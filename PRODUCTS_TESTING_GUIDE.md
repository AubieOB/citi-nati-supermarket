# Products Module - Integration Testing Guide 🧪

## Overview
This guide walks through testing the complete Products module upgrade with all new features enabled.

---

## 📌 Pre-Testing Checklist

- [ ] Backend server running (`npm start` in `citi-nati-backend/`)
- [ ] Frontend dev server running (`npm run dev` in `citi-nati-frontend/`)
- [ ] PostgreSQL database running
- [ ] Prisma migration applied (`npx prisma migrate deploy`)
- [ ] Network connectivity between frontend and backend verified

---

## 🧪 Test Suite 1: Backend API - Product Creation & Pricing

### Test 1.1: Create Basic Product (No Pricing Fields)
**Purpose**: Verify backward compatibility

**Steps**:
1. Open Postman or terminal
2. POST `/api/products`
3. Send JSON:
```json
{
  "name": "Tomatoes",
  "category": "Vegetables",
  "price": 3000,
  "stock": 100
}
```

**Expected**:
- ✅ Status 201 Created
- ✅ Response includes: id, name, price, finalPrice (= 3000), stock
- ✅ expiryStatus: null
- ✅ isOnSale: false
- ✅ No originalPrice, discountPrice

---

### Test 1.2: Create Product with All Pricing Fields
**Purpose**: Test new hybrid pricing system

**Steps**:
1. POST `/api/products`
2. Send JSON:
```json
{
  "name": "Premium Bananas",
  "category": "Fruits",
  "price": 4500,
  "stock": 80,
  "originalPrice": 5800,
  "discountPrice": 3600,
  "expiryDate": "2025-03-20"
}
```

**Expected**:
- ✅ Status 201 Created
- ✅ Response includes:
  - `finalPrice`: 3600 (discountPrice applied because isOnSale auto-enabled)
  - `isOnSale`: true (auto-set because discountPrice provided)
  - `expiryStatus`: object with status, daysRemaining, message
  - `originalPrice`: 5800
  - `discountPrice`: 3600
  - `expiryDate`: 2025-03-20

---

### Test 1.3: Create Expiring Product (Discount Suggestion)
**Purpose**: Test smart discount suggestions

**Steps**:
1. Calculate date 8 days from today (example: 2025-03-05 if today is 2025-02-25)
2. POST `/api/products`
3. Send JSON:
```json
{
  "name": "Milk (Expiring Soon)",
  "category": "Dairy",
  "price": 7000,
  "stock": 45,
  "expiryDate": "2025-03-05"
}
```

**Expected**:
- ✅ Status 201 Created
- ✅ expiryStatus.status: "1_week_warning"
- ✅ expiryStatus.daysRemaining: 8
- ✅ expiryStatus.message: "⚠ Expires in 8 days"
- ✅ No discountSuggestion in response (only returned for admin detail endpoint)

---

## 🧪 Test Suite 2: Backend API - Filtering

### Test 2.1: Search Filter
**Purpose**: Verify case-insensitive name search

**Steps**:
1. Ensure products with names: "Apples", "Bananas", "Avocado" exist
2. GET `/api/products?search=apple`

**Expected**:
- ✅ Returns only products matching "apple" case-insensitively
- ✅ Both "Apples" and "avocado" (contains "ava") NOT included

**Test Variations**:
- GET `/api/products?search=ban` → Returns "Bananas"
- GET `/api/products?search=FRUIT` → Case-insensitive search works

---

### Test 2.2: Category Filter
**Purpose**: Verify exact category matching

**Steps**:
1. Ensure products with categories: "Fruits", "Vegetables", "Dairy"
2. GET `/api/products?category=Fruits`

**Expected**:
- ✅ Returns only products with category="Fruits"
- ✅ Products with category="Vegetables" NOT included

---

### Test 2.3: Sale Filter
**Purpose**: Verify on-sale product filtering

**Steps**:
1. Ensure products with:
   - Product A: isOnSale=true, discountPrice=3000
   - Product B: isOnSale=false (regular)
2. GET `/api/products?onSale=true`

**Expected**:
- ✅ Returns only Product A (isOnSale=true)
- ✅ Product B NOT included

---

### Test 2.4: Combined Filters
**Purpose**: Verify all filters work together

**Steps**:
1. Ensure variety of products with different:
   - Names: "Apples", "Avocado", "Bananas"
   - Categories: "Fruits", "Vegetables"
   - Sale status: some on sale, some not
2. GET `/api/products?search=app&category=Fruits&onSale=true`
   
**Expected**:
- ✅ Returns ONLY products matching ALL criteria:
  - Name contains "app"
  - AND category="Fruits"
  - AND isOnSale=true
- ✅ Other products filtered out

---

## 🧪 Test Suite 3: Frontend - Public Products Page

### Test 3.1: Page Load & Display
**Purpose**: Verify products display correctly

**Steps**:
1. Navigate to http://localhost:5173/products
2. Observe page

**Expected**:
- ✅ Page loads without errors
- ✅ Products display in grid/list
- ✅ Each product card shows: Image, Name, Price, Stock, Add to Cart button
- ✅ Sale badges visible on discounted products (red background)
- ✅ Crossed-out original prices visible (gray, line-through)
- ✅ Bold red discount prices visible
- ✅ Expiry warnings (if applicable) show in yellow box

---

### Test 3.2: Search Functionality
**Purpose**: Verify search updates products in real-time

**Steps**:
1. On Products page, find the search input field
2. Click in search input
3. Type "apple" (or partial product name)
4. Observe page URL and products

**Expected**:
- ✅ URL changes to `/products?search=apple`
- ✅ Products filtered to show only matches
- ✅ Partial matches work (e.g., "app" returns "Apples")
- ✅ Case-insensitive search works

**Variations**:
- Clear search and re-search with different term
- Verify URL bookmark works: Copy URL, open in new tab → Same results
- Search with non-existent product → Shows "No products found"

---

### Test 3.3: Category Filtering
**Purpose**: Verify category dropdown works

**Steps**:
1. On Products page, find category dropdown
2. Click dropdown
3. Select a category (e.g., "Fruits")
4. Observe URL and products

**Expected**:
- ✅ URL changes to `/products?category=Fruits`
- ✅ Only products in selected category display
- ✅ Dropdown shows "All Categories" option to reset

---

### Test 3.4: Sale Filter
**Purpose**: Verify on-sale checkbox works

**Steps**:
1. On Products page, find "On Sale Only" checkbox
2. Check the checkbox
3. Observe URL and products

**Expected**:
- ✅ URL changes to `/products?onSale=true`
- ✅ Only products with sale badges display
- ✅ Unchecking removes filter

---

### Test 3.5: Combined Filters
**Purpose**: Verify multiple filters work together

**Steps**:
1. Enter search term: "fruit"
2. Select category: "Fruits"
3. Check "On Sale Only"
4. Observe URL and results

**Expected**:
- ✅ URL: `/products?search=fruit&category=Fruits&onSale=true`
- ✅ Products match ALL criteria
- ✅ Clear Filters button resets everything

---

### Test 3.6: Pricing Display
**Purpose**: Verify pricing shows correctly

**Steps**:
1. Find a product with sale badge
2. Examine price display area

**Expected**:
- ✅ Original price: ~~5000~~ (crossed out, gray)
- ✅ Discount price: **3000** (bold, red, larger)
- ✅ Discount badge: "Save 40%" (red badge)
- ✅ Product with regular price: Shows only one price

---

### Test 3.7: Add to Cart
**Purpose**: Verify cart uses correct pricing

**Steps**:
1. Find a sale product with discount price 3000
2. Click "Add to Cart"
3. Go to cart page
4. Verify item price

**Expected**:
- ✅ Item in cart shows price: 3000 (discount price, not original)
- ✅ Quantity can be adjusted
- ✅ Total calculates correctly

---

## 🧪 Test Suite 4: Frontend - Admin Products Management

### Test 4.1: Create Product (Basic)
**Purpose**: Verify basic product creation

**Steps**:
1. Navigate to admin area → Products
2. Click "+ Create New Product"
3. Fill form:
   - Name: "Test Apples"
   - Category: "Fruits"
   - Base Price: "4500"
   - Stock: "75"
4. Click "Create Product"

**Expected**:
- ✅ Form validates (no errors)
- ✅ Button shows "Saving..."
- ✅ Product appears in table
- ✅ Form resets after submission
- ✅ finalPrice = 4500 (no discount)

---

### Test 4.2: Create Product (With Discount)
**Purpose**: Verify smart discount and auto-sale

**Steps**:
1. Click "+ Create New Product"
2. Fill form:
   - Name: "Sale Bananas"
   - Category: "Fruits"
   - Base Price: "5000"
   - Original Price: "6000"
   - Discount Price: "3500"
   - Stock: "60"
3. Click "Create Product"

**Expected**:
- ✅ Product created successfully
- ✅ In product table:
   - Pricing column shows: ~~6000~~ → **3500** (Save 42%)
   - Sale badge "🏷 On Sale" appears
   - finalPrice calculated as 3500

---

### Test 4.3: Create Product (With Expiry)
**Purpose**: Verify expiry date handling

**Steps**:
1. Click "+ Create New Product"
2. Fill form:
   - Name: "Fresh Milk"
   - Category: "Dairy"
   - Base Price: "7500"
   - Stock: "40"
   - Expiry Date: (Select date 5 days from now)
3. Click "Create Product"

**Expected**:
- ✅ Product created successfully
- ✅ Expiry Status column shows: "⚠ 5d left" (yellow background)
- ✅ Product appears in Expiry Alerts panel (if open)

---

### Test 4.4: Edit Product
**Purpose**: Verify edit functionality

**Steps**:
1. In products table, click "Edit" on any product
2. Modify fields:
   - Change price: "4000" → "4500"
   - Add discount: "3500"
3. Click "Update Product"

**Expected**:
- ✅ Form populates with current product data
- ✅ Updates saved successfully
- ✅ Table reflects updated prices immediately
- ✅ Form shows "Update Product" button (not "Create")

---

### Test 4.5: Pricing Logic - Auto Sale Enable
**Purpose**: Verify discount price auto-enables isOnSale

**Steps**:
1. Create product with:
   - Base Price: "5000"
   - Discount Price: "4000" (no originalPrice)
   - Don't manually set isOnSale
2. Submit form

**Expected**:
- ✅ Product created with isOnSale = true
- ✅ finalPrice = 4000
- ✅ No "🏷 On Sale" badge (because no originalPrice for crossed-out effect)
- ✅ Pricing shows: **4000** (just discount price)

---

### Test 4.6: Product Table Display
**Purpose**: Verify all columns show correctly

**Steps**:
1. View product table with variety of products:
   - Regular product
   - Sale product with original price
   - Expiring product
2. Scroll table horizontally to see all columns

**Expected Columns Visible**:
- ✅ ID: #1, #2, etc.
- ✅ Name: Product names
- ✅ Category: Category names
- ✅ Pricing: Shows pricing with badges
- ✅ Stock: Color-coded (green >20, amber 1-20, red 0)
- ✅ Expiry Status: Icons and text
- ✅ Actions: Edit/Delete buttons

---

### Test 4.7: Expiry Alerts Panel
**Purpose**: Verify expiry alerts display correctly

**Steps**:
1. Ensure products with expiry warnings exist
2. View admin products page
3. Look for "⚠ Expiry Alerts" panel above table

**Expected**:
- ✅ Panel shows count of products with warnings
- ✅ Products sorted by urgency (expired first)
- ✅ Each product card shows:
   - Product name
   - Expiry message (e.g., "⚠ Expires in 5 days")
   - Action button ("Remove" or "Apply Discount")
- ✅ Color-coded by severity:
   - Expired: Red background
   - 1-2 week warning: Yellow background

---

### Test 4.8: Delete Product
**Purpose**: Verify delete functionality

**Steps**:
1. In products table, click "Delete" on a product
2. (If confirmation dialog appears) Confirm deletion
3. Observe table

**Expected**:
- ✅ Product removed immediately
- ✅ Table updates without page refresh
- ✅ No errors in console

---

## 🧪 Test Suite 5: Data Integrity & Edge Cases

### Test 5.1: Order Creation with New Pricing
**Purpose**: Verify existing order logic unchanged

**Steps**:
1. Add a sale product to cart (with discount)
2. Proceed to checkout
3. Create order
4. Verify order details

**Expected**:
- ✅ Order total calculated using discount price (finalPrice)
- ✅ Order saved correctly to database
- ✅ No errors in order process
- ✅ Can view order in order history

---

### Test 5.2: Expiry Status Updates Over Time
**Purpose**: Verify dynamic expiry computation

**Steps**:
1. Create product with expiryDate: 10 days from today
2. View product in admin
3. Shows: "⚠ 10d left"
4. Wait 1 minute (or mock time in development)
5. Refresh page
6. Should still show similar days count (minor variance ok)

**Expected**:
- ✅ Days remaining count decreases over time
- ✅ Status tier changes when crossing thresholds (30→29→...→7→warning)
- ✅ Not recalculated every second (computed on page load)

---

### Test 5.3: Product with No Expiry
**Purpose**: Verify null handling

**Steps**:
1. Create product without expiryDate
2. View in admin

**Expected**:
- ✅ Expiry Status column shows: "—" (em dash)
- ✅ Product not in alerts panel
- ✅ finalPrice = price (not affected)

---

### Test 5.4: Filter with Empty Results
**Purpose**: Verify empty state handling

**Steps**:
1. On Products page, search: "xyz123notexist"
2. Observe

**Expected**:
- ✅ Page shows: "No products matching your search"
- ✅ No errors
- ✅ Clear Filters button visible
- ✅ Search remains in input

---

### Test 5.5: Large Product Catalog
**Purpose**: Verify performance with many products

**Steps**:
1. (If test data available) Create 100+ products
2. Navigate to Products page
3. Apply filters
4. Search

**Expected**:
- ✅ Page loads within 2-3 seconds
- ✅ Filters respond within 1 second
- ✅ No lag or freezing
- ✅ Pagination (if implemented) works

---

## 🧪 Test Suite 6: Browser Compatibility & Accessibility

### Test 6.1: Responsive Design
**Purpose**: Verify mobile/tablet compatibility

**Steps**:
1. Open Products page on different screen sizes:
   - Desktop (1920×1080)
   - Tablet (768×1024)
   - Mobile (375×667)
2. View products, filters, and admin forms

**Expected**:
- ✅ Layout adapts properly
- ✅ Text readable on all sizes
- ✅ Buttons clickable on touch devices
- ✅ No horizontal scroll on mobile

---

### Test 6.2: Browser Testing
**Purpose**: Verify cross-browser compatibility

**Test on**:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest if available)
- [ ] Edge (latest if available)

**Expected**:
- ✅ All features work on all browsers
- ✅ No console errors
- ✅ Styling consistent

---

## 📊 Test Results Summary

Create a summary table:

| Test # | Description | Status | Notes |
|--------|-------------|--------|-------|
| 1.1 | Create basic product | 🟢 PASS | |
| 1.2 | Create product with pricing | 🟢 PASS | |
| 1.3 | Expiry date handling | 🟢 PASS | |
| 2.1 | Search filter | 🟢 PASS | |
| 2.2 | Category filter | 🟢 PASS | |
| 2.3 | Sale filter | 🟢 PASS | |
| 2.4 | Combined filters | 🟢 PASS | |
| 3.1 | Page load | 🟢 PASS | |
| 3.2 | Search functionality | 🟢 PASS | |
| ... | ... | ... | |

---

## 🐛 Troubleshooting Guide

### Issue: Products not displaying on frontend
**Debug Steps**:
1. Check browser console for errors
2. Check network tab → GET /api/products response
3. Verify backend running
4. Check database connection

### Issue: Search not working
**Debug Steps**:
1. Verify query params in URL
2. Check backend logs for search filter logic
3. Test API directly: `curl http://localhost:5000/api/products?search=test`

### Issue: Pricing showing incorrectly
**Debug Steps**:
1. Check product data in database (Prisma Studio: `npx prisma studio`)
2. Verify finalPrice calculation: `finalPrice = isOnSale && discountPrice ? discountPrice : price`
3. Check frontend formatting: `formatMWK()` function

### Issue: Expiry status not updating
**Debug Steps**:
1. Verify expiryDate format (ISO string)
2. Check timezone offset
3. Manually calculate expected status
4. Check `calculateDaysRemaining()` function in backend

---

## ✅ Sign-Off

**Testing Completed By**: ___________________  
**Date**: ___________________  
**All Tests Passed**: ☐ Yes ☐ No  
**Known Issues**: ___________________  
**Ready for Deployment**: ☐ Yes ☐ No  

