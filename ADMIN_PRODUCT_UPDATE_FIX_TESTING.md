# Admin Product Update Fix - Testing Guide

## Problem Fixed
**Root Cause:** Product update from Admin Products panel was failing with "Server error while updating product" because the frontend was not sending `branchCode` to the backend, which is required for ambiguous location codes like "SH".

## Changes Made

### 1. Frontend Fix - [AdminProducts.jsx](citi-nati-frontend/src/components/admin/AdminProducts.jsx#L1295)
**Issue:** When updating a product, frontend only sent `locationCode` but not `branchCode`
**Fix:** Now appends both `locationCode` and `branchCode` to the form payload

```javascript
// BEFORE:
if (selectedLocationCode) {
  formPayload.append('locationCode', selectedLocationCode);
}

// AFTER:
if (selectedLocationCode) {
  formPayload.append('locationCode', selectedLocationCode);
}
if (selectedBranchCode) {
  formPayload.append('branchCode', selectedBranchCode);
}
```

### 2. Backend Improvements - [product.controller.js](citi-nati-backend/src/controllers/product.controller.js)

#### A. Added Scope Resolution Logging (Line ~1509)
Now logs incoming scope parameters before attempting to resolve them:
```javascript
console.log('[BACKEND PRODUCT EDIT] Scope resolution inputs:', {
  queryLocationCode: req.query?.locationCode,
  bodyLocationCode: req.body?.locationCode,
  queryBranchCode: req.query?.branchCode,
  bodyBranchCode: req.body?.branchCode,
});
```

#### B. Added Early Scope Resolution (Line ~1700)
Scope resolution now happens BEFORE database update, with detailed error logging:
```javascript
try {
  writebackScope = resolveProductWritebackScope(req, existingProduct);
  console.log('[BACKEND PRODUCT EDIT] ✅ Writeback scope resolved:', {...});
} catch (scopeErr) {
  console.error('[BACKEND PRODUCT EDIT] ❌ Writeback scope resolution failed:', {...});
  throw scopeErr;
}
```

#### C. Enhanced Error Logging (Line ~1950)
Catch block now provides detailed error information:
```javascript
} catch (err) {
  console.error('[PRODUCT UPDATE] ❌ Error updating product:', {
    message: err.message,
    stack: err.stack,
    productId: req.params.id,
    bodyFields: Object.keys(req.body || {}),
    hasFile: !!req.file,
    scope: {
      locationCode: req.query?.locationCode || req.body?.locationCode || 'not-provided',
      branchCode: req.query?.branchCode || req.body?.branchCode || 'not-provided',
    },
  });
  return res.status(500).json({
    error: 'Server error while updating product',
    details: err.message,
    code: err.code || 'INTERNAL_ERROR',
  });
}
```

## Testing Procedure

### Test 1: Basic Product Update (Website Product)
**Goal:** Verify non-POS products can be updated
1. Admin Dashboard → Products
2. Click "Edit" on any website product
3. Change: name, price, stock
4. Click "Save"
5. **Expected:** ✅ Success message, product updated

### Test 2: Price Update (POS Product)
**Goal:** Verify price updates are queued for POS sync
1. Admin Dashboard → Products
2. Click "Edit" on a POS product (has source code)
3. Change price only
4. Click "Save"
5. **Expected:** ✅ Success with message: "Product ... updated successfully. POS price sync queued."
6. Verify in server logs: `[POS COMMAND QUEUE] UPDATE_PRICE queued:`

### Test 3: Product Name Update (POS Product)
**Goal:** Verify name updates are queued for POS sync
1. Admin Dashboard → Products
2. Click "Edit" on a POS product
3. Change name only (e.g., add " Updated" to existing name)
4. Click "Save"
5. **Expected:** ✅ Success with message: "Product ... updated successfully. POS name sync queued."
6. Verify in server logs: `[POS COMMAND QUEUE] UPDATE_PRODUCT_NAME queued:`

### Test 4: Stock Update (POS Product - Decrease)
**Goal:** Verify stock decreases create UPDATE_STOCK command
1. Admin Dashboard → Products
2. Click "Edit" on a POS product with stock > 10
3. Decrease stock (e.g., from 50 to 40)
4. Click "Save"
5. **Expected:** ✅ Success with message: "Product ... updated successfully. POS stock sync queued."
6. Verify in server logs: `[POS COMMAND QUEUE] UPDATE_STOCK queued:`

### Test 5: Image Upload
**Goal:** Verify image uploads work and Cloudinary mapping is saved
1. Admin Dashboard → Products
2. Click "Edit" on any product
3. Select "Change image" and upload a new image (JPG/PNG under 15MB)
4. Click "Save"
5. **Expected:** ✅ Success, image loads in product row
6. Verify in server logs: `[CLOUDINARY UPLOAD] ✅ File uploaded successfully:`
7. Verify: `[PRODUCT UPDATE] Image URL set to:` shows Cloudinary URL

### Test 6: Promotion Update
**Goal:** Verify discount price updates work
1. Admin Dashboard → Products
2. Click "Edit" on any product
3. Set: Original Price (e.g., 5000), Discount Price (e.g., 3500)
4. Click "Save"
5. **Expected:** ✅ Success, product shows final price
6. Verify: finalPrice = discountPrice when isOnSale = true

### Test 7: Multiple Updates (Full Scenario)
**Goal:** Verify all updates can happen together
1. Admin Dashboard → Products
2. Click "Edit" on a POS product
3. Update: Name, Price, Stock (decrease), Category, Upload Image, Discount Price
4. Click "Save"
5. **Expected:** ✅ Success with all POS sync commands queued
6. Verify logs show UPDATE_PRICE, UPDATE_PRODUCT_NAME, UPDATE_STOCK, image URL

### Test 8: Zomba Branch Products
**Goal:** Verify Zomba branch products update correctly (SH location code scenario)
1. Admin Dashboard → Products (ensure branch is "ZOMBA")
2. Edit any Zomba product
3. Change any field
4. Click "Save"
5. **Expected:** ✅ Success (previously would fail with "Server error while updating product")
6. Verify logs show: `locationCode: SH, branchCode: ZOMBA` in scope resolution

## Verification Points

### Frontend Console Logs
When updating a product, should see:
```
[ADMIN PRODUCTS] ✏️ Updating product: 123 {
  locationCode: "SH",
  branchCode: "ZOMBA"
}
[ADMIN PRODUCTS] ✅ Product saved successfully
```

### Server Console Logs
When processing update, should see:
```
[BACKEND PRODUCT EDIT] Scope resolution inputs: {
  bodyLocationCode: "SH",
  bodyBranchCode: "ZOMBA"
}

[BACKEND PRODUCT EDIT] ✅ Writeback scope resolved: {
  locationCode: "SH",
  posLocationCode: "SH",
  branchCode: "ZOMBA",
  priceTypeCode: "RT"
}

[PRODUCT UPDATE] ✅ Product updated in database: {...}
```

### Failure Case Debugging
If update fails, server logs should now show:
```
[PRODUCT UPDATE] ❌ Error updating product: {
  message: "branchCode is required when using location code SH (ambiguous location code)",
  stack: "...",
  scope: {
    locationCode: "SH",
    branchCode: "not-provided"  ← Problem identified!
  }
}
```

## Rollback Instructions
If issues arise, revert these files:
1. `citi-nati-frontend/src/components/admin/AdminProducts.jsx` - Remove branchCode append
2. `citi-nati-backend/src/controllers/product.controller.js` - Revert scope resolution and error logging

## Implementation Status
- ✅ Frontend fix applied
- ✅ Backend error logging improved
- ✅ Early scope resolution added
- ⏳ Ready for testing
