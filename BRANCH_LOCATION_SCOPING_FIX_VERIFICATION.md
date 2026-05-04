# Branch/Location Scoping Fix Verification Checklist

## Overview
This document provides a comprehensive checklist to verify that the branch/location scoping fix has been properly implemented across the codebase.

## Backend API Endpoints Verification

### Admin POS Products Routes

- [x] **GET /api/admin/pos-products**
  - Status: ✅ PATCHED
  - Changes: Accepts `branchCode` query param, rejects ambiguous Zomba SH without explicit branchCode
  - File: `citi-nati-backend/src/routes/admin.routes.js` (line ~1340)
  - Validation: Checks for ambiguous 'SH' location without branchCode

- [x] **PUT /api/admin/pos-products/:id/visibility**
  - Status: ✅ PATCHED
  - Changes: Enforces exact branch/location match for Zomba products
  - File: `citi-nati-backend/src/routes/admin.routes.js` (line ~1511)
  - Validation: Cross-checks product branch/location against request parameters

- [x] **DELETE /api/admin/pos-products/delete-selected**
  - Status: ✅ PATCHED
  - Changes: Enforces branchCode for Zomba SH deletion
  - File: `citi-nati-backend/src/routes/admin.routes.js` (line ~1645)
  - Validation: Rejects ambiguous SH without explicit branchCode

- [x] **DELETE /api/admin/pos-products/delete-all**
  - Status: ✅ PATCHED
  - Changes: Enforces branchCode for Zomba SH deletion
  - File: `citi-nati-backend/src/routes/admin.routes.js` (line ~1712)
  - Validation: Rejects ambiguous SH without explicit branchCode

### Emergency Sales Routes

- [x] **GET /api/admin/emergency-sales (listEmergencySales)**
  - Status: ✅ PATCHED
  - Changes: Rejects ambiguous Zomba SH without explicit branchCode
  - File: `citi-nati-backend/src/controllers/emergencySales.controller.js` (line ~1194)
  - Validation: Enforces branchCode requirement for SH location

- [x] **POST /api/admin/emergency-sales (createEmergencySale)**
  - Status: ✅ PATCHED
  - Changes: Rejects ambiguous Zomba SH without explicit branchCode
  - File: `citi-nati-backend/src/controllers/emergencySales.controller.js` (line ~856)
  - Validation: Checks for ambiguous SH and requires explicit branchCode

- [x] **GET /api/admin/emergency-sales/lookup (lookupEmergencyProducts)**
  - Status: ✅ VERIFIED (already correct)
  - Changes: None needed - already validates concrete Zomba location codes
  - File: `citi-nati-backend/src/controllers/emergencySales.controller.js` (line ~658)
  - Validation: Already rejects generic 'ZA' and requires concrete codes (SH, BAR, ST999)

### Backend Helper Functions

- [x] **normalizeBranchCode() in admin.routes.js**
  - Status: ✅ ADDED
  - Purpose: Maps branch code aliases to canonical names
  - Aliases: ZOMBA, ZA, ZOMBA_SH, ZOMBA_BAR, ZOMBA_RES → ZOMBA
  - Aliases: BLANTYRE, BT, BLANTYRE_SH → BLANTYRE
  - File: `citi-nati-backend/src/routes/admin.routes.js` (line ~76)

## Frontend Component Verification

### AdminStocks.jsx

- [x] **Component Props**
  - Status: ✅ UPDATED
  - Added: `selectedBranchCode` prop acceptance
  - File: `citi-nati-frontend/src/components/admin/AdminStocks.jsx`

- [x] **Product Fetch Calls**
  - Status: ✅ UPDATED
  - Includes: `branchCode` in all `/products` API query parameters
  - Applies to: All product fetching in stock management views

- [x] **Stock Update Operations**
  - Status: ✅ UPDATED
  - Includes: `branchCode` in stock action requests
  - Methods: updateStock, adjustStock, handleStockAction

- [x] **Socket Event Filtering**
  - Status: ✅ UPDATED
  - Validates: Both branch and location before applying updates

### AdminPOSManagement.jsx

- [x] **Component Props**
  - Status: ✅ UPDATED
  - Added: `selectedBranchCode` prop acceptance
  - File: `citi-nati-frontend/src/pages/admin/AdminPOSManagement.jsx`

- [x] **Product Query Calls**
  - Status: ✅ UPDATED
  - Includes: `branchCode` in `/admin/pos-products` query parameters
  - Applies to: Initial fetch, pagination, search

- [x] **Visibility Toggle API**
  - Status: ✅ UPDATED
  - Includes: `branchCode` in both query params and request body
  - Method: `handleToggleVisibility()`, bulk visibility changes

- [x] **Delete Operations**
  - Status: ✅ UPDATED
  - Includes: `branchCode` in both delete-selected and delete-all endpoints
  - Both query params and request body contain branchCode

### AdminDashboard.jsx

- [x] **Socket Event Filtering**
  - Status: ✅ UPDATED
  - New: `resolveUiScopeCodesFromPosLocation()` function
  - Purpose: Maps product scope to admin UI scope (branch + location)
  - File: `citi-nati-frontend/src/pages/admin/AdminDashboard.jsx`

- [x] **Product Update Patching**
  - Status: ✅ UPDATED
  - Method: `applyRealtimeProductPatch()` validates both branch and location
  - Ensures: Socket patches only apply to matching operational scope

- [x] **Cache Preloading**
  - Status: ✅ VERIFIED (already correct)
  - Includes: Both `branchCode` and `locationCode` in preload requests

### operationalScope.js

- [x] **filterProductsForOperationalLocation()**
  - Status: ✅ UPDATED
  - Validation: Both branchCode and locationCode checked when scope exists
  - Prevents: Products from different branches matching ambiguous locations
  - File: `citi-nati-frontend/src/utils/operationalScope.js`

### AdminEmergencySales.jsx

- [x] **API Calls**
  - Status: ✅ VERIFIED (already correct)
  - Lookup: Sends both branchCode and locationCode
  - List: Sends both branchCode and locationCode
  - Create: Sends both branchCode and locationCode
  - File: `citi-nati-frontend/src/components/admin/AdminEmergencySales.jsx`

## Critical Path Testing

### Test Scenario 1: Zomba SH vs Blantyre SH Isolation
```
Steps:
1. Admin logs in with Zomba branch access
2. Navigate to Stock Management → Zomba SH
3. Verify products are filtered to Zomba SH only
4. Switch to Blantyre SH
5. Verify products are completely different (not mixed)
6. Toggle visibility on a Zomba SH product
7. Verify Blantyre SH products remain unchanged
```

### Test Scenario 2: POS Management Scope Enforcement
```
Steps:
1. Admin navigates to POS Management for Zomba SH
2. Delete a product from Zomba SH
3. Switch to Blantyre SH
4. Verify deleted product still exists in Blantyre SH
5. Try to perform operations on Zomba SH products from Blantyre view
6. System should reject or error appropriately
```

### Test Scenario 3: Emergency Sales Branch Isolation
```
Steps:
1. Create emergency sale for Zomba SH
2. List emergency sales filtered to Zomba SH
3. Switch to Blantyre SH
4. Create emergency sale for Blantyre SH
5. List emergency sales - verify each branch shows only its own sales
6. Lookup products for each branch - verify no cross-branch products
```

### Test Scenario 4: Real-time Socket Updates
```
Steps:
1. Open admin dashboard for Zomba SH in one window
2. Open admin dashboard for Blantyre SH in another window
3. Perform product update in Zomba window
4. Verify update appears ONLY in Zomba window, not Blantyre
5. Perform product update in Blantyre window
6. Verify update appears ONLY in Blantyre window
```

## Error Response Validation

### Expected 400 Bad Request Responses

- [ ] **GET /admin/pos-products with locationCode=SH but no branchCode**
  - Expected: `{ success: false, error: "Ambiguous location code SH requires explicit branchCode parameter" }`

- [ ] **DELETE /admin/pos-products/delete-all with locationCode=SH but no branchCode**
  - Expected: `{ success: false, error: "Ambiguous location code SH requires explicit branchCode parameter" }`

- [ ] **POST /emergency-sales with locationCode=SH but no branchCode**
  - Expected: `{ success: false, error: "Ambiguous location code SH requires explicit branchCode parameter" }`

- [ ] **GET /emergency-sales with locationCode=SH but no branchCode**
  - Expected: `{ success: false, error: "Ambiguous location code SH requires explicit branchCode parameter" }`

## Database Query Validation

### Verified Query Patterns

- [x] **Zomba POS Products Query**
  - Pattern: `WHERE branchCode = 'ZOMBA' AND locationCode = 'SH'`
  - Ensures: Exact match, no ambiguity

- [x] **Non-Zomba Products Query**
  - Pattern: `WHERE sourceCode IN (scopedProductCodes) AND branchCode = derivedBranch`
  - Ensures: Activity-based scoping with explicit branch

- [x] **Emergency Sales Query**
  - Pattern: `WHERE cartSnapshot.locationCode = 'SH' AND (cartSnapshot.branchCode = 'ZOMBA' OR branchCode = 'ZOMBA')`
  - Ensures: Both location and branch constraints apply

## Deployment Checklist

- [x] Code changes committed to main branch
- [x] Changes pushed to GitHub
- [ ] Backend services restarted with new code
- [ ] Frontend rebuilt and deployed
- [ ] Database consistency verified (no orphaned records)
- [ ] Monitor admin operations for errors
- [ ] User feedback collected on branch isolation
- [ ] Performance impact assessed

## Sign-Off

- **Fix Completion Date:** 2024-12-19
- **Commit Hash:** 6434107
- **Changed Files:** 6
- **Lines Added/Modified:** ~190
- **Status:** ✅ READY FOR TESTING AND DEPLOYMENT

## Notes

All critical paths have been patched. The fix ensures that:
1. `locationCode` alone is NEVER sufficient for API operations
2. Ambiguous Zomba locations (SH) REQUIRE explicit `branchCode`
3. All frontend API calls now include both `branchCode` and `locationCode`
4. Backend validates exact branch/location matches for Zomba operations
5. Socket events only patch products in the matching operational scope
6. No data leakage between branches sharing the same location code
