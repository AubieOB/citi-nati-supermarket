# Query Logic Analysis - Quick Reference

## The Core Problem: Location Scoping Logic

All query patterns use **conditional location filtering** based on an `aggregate` flag:

```javascript
if (!filters.aggregate) {
  // Apply location/branch predicates
} else {
  // Skip location filtering - return all data
}
```

**When aggregate=true** → All-locations mode (historical data visible = INTENDED)  
**When aggregate=false** → Single-location mode (should apply location filters)

---

## Query Patterns Breakdown

### 1. Sales Reports (Reference Implementation)
**Tables**: SalesInvoice, SalesInvoiceItem  
**Date**: `invoiceDate` (Blantyre local: UTC+2)  
**Scope**: Uses `buildInvoiceWhere()` / `buildItemWhere()`  
**Key**: Aggregate flag **conditionally disables** location predicates  

```javascript
// All-Locations Mode
GET /reports/sales/summary?aggregate=true
WHERE: invoiceDate between startDate and endDate  // NO location filter
RESULT: All invoices from all locations ✓ Correct

// Single-Location Mode
GET /reports/sales/summary?aggregate=false&branchCode=ZOMBA&locationCode=ZA
WHERE: invoiceDate AND (branch OR syncSourceCode) AND locationCode
RESULT: Only ZOMBA/ZA invoices ✓ Should work
```

---

### 2. Analytics/Profit Report (queryLatestCostProfitAnalytics)
**Tables**: SalesInvoiceItem, PosStockIntake (for costs)  
**Date**: `invoiceDate` (inherited from salesInvoice)  
**Scope**: Uses same `buildItemWhere()` as Sales Reports  
**Key**: **Inherits** aggregate flag behavior

```javascript
// Queries salesInvoiceItem with:
where: {
  salesInvoice: buildInvoiceWhere(dateRange, filters)  // ← Applies scoping
}
// Result: Same scoping as Sales Reports
```

---

### 3. Monthly Summary Tab (Frontend)
**Endpoints**:
- /business-operations/reports/sales/summary
- /business-operations/reports/sales/invoices  
- /business-operations/reports/sales/products
- /business-operations/expenses
- /business-operations/suppliers/transactions/list
- /business-operations/payroll/periods

**Parameter Logic**:
```javascript
if (isAggregateMode) {
  params = { ...periodParams, aggregate: true }
} else {
  params = { ...periodParams, branchCode, locationCode, locationId }
}
```

**Critical**: If `branchCode` and `locationCode` are empty/null, queries receive:
```javascript
// Single-location mode but missing filters
GET /reports/sales/summary?periodType=month&month=5&year=2026
// No location params! → No scoping applied → All data returned
```

---

### 4. Report History Tab (Frontend)
**Same endpoints and parameter logic as Monthly Summary**  
**Auto-refresh**: Every 30 seconds

---

### 5. Inventory Activity (⚠️ SPECIAL CASE)
**Tables**: 
- SalesInvoiceItem (SALE movements) → Uses `buildItemWhere()` ✓
- PosStockIntakeItem (STOCK_IN movements) → Uses direct filters ⚠️
- EmergencySale (EMERGENCY_SALE) → Uses direct filters ⚠️

**Date Fields**:
- SalesInvoiceItem: `invoiceDate`
- PosStockIntakeItem: `grnDate` OR `sourceUpdatedAt` (OR condition)
- EmergencySale: `createdAt`

**⚠️ Location Filtering Bug**:
```javascript
function buildLocationFilter(filters = {}) {
  const locationFilter = {};
  if (filters.locationId) locationFilter.locationId = Number(filters.locationId);
  if (filters.locationCode) locationFilter.locationCode = normalize(filters.locationCode);
  if (filters.branchCode) locationFilter.branchCode = normalize(filters.branchCode);
  return locationFilter;  // ← Can be EMPTY {} if no filters provided!
}

// In getPOSGRNMovements:
const locationWhere = {};
if (locationFilter.branchCode) { /* add to locationWhere */ }
if (locationFilter.locationCode) { /* add to locationWhere */ }

// If filters were empty, locationWhere = {}
// Query applies ONLY date filtering, NO location filtering
// ⚠️ RESULT: Returns POS GRN from ALL locations
```

---

## Why Historical Data Appears in Single-Location Mode

### Scenario 1: Frontend Not Passing Location Filters
```javascript
// Frontend constructs:
const scopeParams = {};  // Empty if not in aggregate mode but no location selected

if (!isAggregateMode && selectedLocationId) {
  scopeParams.locationId = selectedLocationId;  // Only if selectedLocationId exists
}

// If selectedLocationId is null/undefined:
// Request: GET /reports/sales/summary?periodType=month&month=5&year=2026
// Backend receives: filters = { aggregate: false, branchCode: null, locationCode: null }
// Result: No location predicates built, all data returned ❌
```

**How to Check**:
- In MonthlySummaryTab.jsx, verify `scopeParams` is built correctly
- Add console.log when NOT in aggregate mode
- Ensure selectedLocationId, selectedBranchCode, selectedLocationCode have values

### Scenario 2: Inventory Activity Missing Parameters
```javascript
// Controller receives undefined/null parameters:
filters = {
  locationId: null,
  locationCode: null,
  branchCode: null,
  // ...
}

// buildLocationFilter returns empty {}
// POS GRN query has NO location WHERE clause
// Result: Returns GRNs from all locations ❌
```

### Scenario 3: Aggregate Flag Incorrectly Set
```javascript
// Frontend accidentally passes aggregate=true in single-location mode
GET /reports/sales/summary?aggregate=true&branchCode=ZOMBA

// Backend:
if (!filters.aggregate) {  // false - condition skipped!
  // Location predicates not added
}

// Result: All data returned despite branchCode param ❌
```

---

## Date Field Comparison

| Component | Date Field | Format | Range |
|-----------|-----------|--------|-------|
| Sales Reports | `invoiceDate` | UTC+2 ISO string | `gte: startDate, lte: endDate` |
| Analytics | `invoiceDate` | UTC+2 ISO string | `gte: startDate, lte: endDate` |
| Monthly Summary | `invoiceDate` | UTC+2 ISO string | `gte: startDate, lte: endDate` |
| Report History | `invoiceDate` | UTC+2 ISO string | `gte: startDate, lte: endDate` |
| Inventory Activity - Sales | `invoiceDate` | UTC+2 ISO string | `gte: startDate, lte: endDate` |
| Inventory Activity - GRN | `grnDate` OR `sourceUpdatedAt` | UTC+2 ISO string | OR condition both fields |
| Inventory Activity - Emergency | `createdAt` | UTC+2 ISO string | `gte: startDate, lte: endDate` |

**Key**: All use Blantyre local time (UTC+2), so historical data from different dates would only appear if date filtering is broken (unlikely) or location filtering is missing (most likely).

---

## Filtering Logic Comparison

| Component | Aggregate Flag | Location Predicates | Behavior |
|-----------|---|---|---|
| Sales Reports | ✅ YES | Conditional (if not aggregate) | Works as designed |
| Analytics | ✅ YES (inherited) | Conditional (if not aggregate) | Works as designed |
| Monthly Summary | ✅ YES (frontend logic) | Frontend includes/excludes params | Depends on frontend |
| Report History | ✅ YES (frontend logic) | Frontend includes/excludes params | Depends on frontend |
| Inventory Activity | ❌ NO | Always applied (can be empty) | ⚠️ BUG: Empty filter = no scoping |

**The Problem**: Inventory Activity has no aggregate flag, so it **always tries to apply location filters**. But if filters are empty, the WHERE clause is empty, and no scoping happens.

---

## Debugging Checklist

### For Sales Reports / Analytics / Monthly Summary
- [ ] Check frontend `scopeParams` includes `branchCode`, `locationCode`, `locationId` in single-location mode
- [ ] Verify `aggregate` is NOT true in single-location mode
- [ ] In controller, log `req.query` to see what parameters were received
- [ ] In `buildInvoiceWhere()`, add console.log for the aggregate flag value
- [ ] Verify `buildBranchScopePredicate()` and `buildLocationScopePredicate()` are building non-null predicates

### For Inventory Activity
- [ ] Verify controller receives `locationCode` and `branchCode` parameters
- [ ] In `buildLocationFilter()`, add console.log to show what's being returned
- [ ] Verify `locationWhere` is being populated, not remaining empty `{}`
- [ ] Check that `getPOSGRNMovements()` query includes location WHERE clause
- [ ] Test with explicit `locationCode` query parameter

---

## Code Locations for Investigation

### Sales Reports Query Building
- **Where clauses built**: `src/utils/reportingFilters.js` (buildInvoiceWhere, buildItemWhere)
- **Queries executed**: `src/services/salesReporting.service.js`
- **Controllers**: `src/controllers/salesReporting.controller.js`

### Inventory Activity
- **Location filtering**: `src/services/business-operations/inventoryActivity.service.js` (buildLocationFilter)
- **POS GRN query**: `src/services/business-operations/inventoryActivity.service.js` (getPOSGRNMovements, lines ~200-400)
- **Controller**: `src/controllers/business-operations/inventoryActivity.controller.js`

### Frontend
- **Monthly Summary**: `src/components/admin/business-operations/MonthlySummaryTab.jsx` (scopeParams construction)
- **Report History**: `src/components/admin/business-operations/ReportHistoryTab.jsx` (monthParams construction)

---

## Summary

**The system is correctly designed** to show:
- **All-locations data** when `aggregate=true`
- **Single-location data** when `aggregate=false` and location filters are provided

**The bug likely occurs when**:
1. Frontend doesn't pass location filters in single-location mode
2. Frontend accidentally enables aggregate mode
3. For Inventory Activity, the empty `buildLocationFilter()` result isn't handled properly

**Next Step**: Add logging to track what filters are being received and applied at each stage.
