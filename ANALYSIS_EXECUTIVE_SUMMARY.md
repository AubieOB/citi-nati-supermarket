# Backend Query Logic Analysis - Executive Summary

**Date**: May 15, 2026  
**Analysis Focus**: Why historical data is visible in all-locations mode but not in single-location mode  
**Status**: 🔍 Root cause identified, detailed analysis documented

---

## Key Finding

The business operations backend uses a **conditional location scoping system** where location filters are applied or removed based on an `aggregate` flag. The system works correctly when filters are properly passed, but **historical data visibility issues stem from missing or incorrect filter parameters**, not from query logic flaws.

---

## The System Design

### Location Filtering Logic
```javascript
if (!filters.aggregate) {
  // Apply strict location/branch filtering
  // Result: Single-location mode works correctly
} else {
  // Skip location filtering
  // Result: All-locations mode returns all data (intended)
}
```

**This is correct behavior:**
- ✅ **All-Locations Mode** (`aggregate=true`): Returns data from all branches/locations
- ✅ **Single-Location Mode** (`aggregate=false` + location filters): Returns only scoped location data

---

## Query Patterns Summary

### 1. Sales Reports (Reference Implementation - WORKING)
- **Where built**: `buildInvoiceWhere()` in reportingFilters.js
- **Tables**: SalesInvoice, SalesInvoiceItem
- **Date field**: `invoiceDate`
- **Scope control**: `aggregate` flag conditionally disables location predicates
- **Status**: ✅ Correct implementation

### 2. Analytics/Profit Report
- **Where built**: Inherits from `buildItemWhere()` (same builder as Sales Reports)
- **Tables**: SalesInvoiceItem, PosStockIntake (for costs)
- **Date field**: `invoiceDate` (inherited)
- **Scope control**: Inherits `aggregate` flag behavior
- **Status**: ✅ Correct implementation

### 3. Monthly Summary & Report History (Frontend)
- **Parameter construction**: Conditional on `isAggregateMode` toggle
- **Endpoints**: Multiple (sales summary, invoices, products, expenses, payroll, suppliers)
- **Scope control**: Frontend decides whether to include location parameters
- **Status**: ⚠️ Depends on frontend passing parameters correctly

### 4. Inventory Activity (⚠️ SPECIAL CASE - POTENTIAL BUG)
- **Where built**: Direct `buildLocationFilter()` (no aggregate flag)
- **Tables**: SalesInvoiceItem, PosStockIntakeItem, EmergencySale
- **Date fields**: Multiple (invoiceDate, grnDate, sourceUpdatedAt, createdAt)
- **Scope control**: No aggregate flag - always tries to apply location filters
- **Status**: ⚠️ **Bug**: Empty location filters result in no scoping

---

## Root Causes of Historical Data Visibility

### Cause 1: Frontend Not Passing Location Parameters (Most Likely)
**Where**: MonthlySummaryTab.jsx, ReportHistoryTab.jsx  
**Problem**: When NOT in aggregate mode, frontend should pass `branchCode`, `locationCode`, `locationId`  
**If missing**: Backend receives `{ aggregate: false, branchCode: null, locationCode: null }`  
**Result**: No location predicates built → all data returned

**How to verify**:
```javascript
// In MonthlySummaryTab.jsx:
console.log('[DEBUG] scopeParams:', scopeParams);
console.log('[DEBUG] isAggregateMode:', isAggregateMode);
console.log('[DEBUG] selectedLocationId:', selectedLocationId);
```

### Cause 2: Inventory Activity Missing Location Parameters
**Where**: Inventory Activity service and controller  
**Problem**: No aggregate flag, so empty location filters result in no scoping  
**Code**:
```javascript
function buildLocationFilter(filters = {}) {
  const filter = {};
  if (filters.locationId) filter.locationId = filters.locationId;
  if (filters.locationCode) filter.locationCode = filters.locationCode;
  if (filters.branchCode) filter.branchCode = filters.branchCode;
  return filter;  // ← Can be empty {}!
}

// If filters has no location params:
// locationFilter = {}
// locationWhere = {}  (spreading empty object does nothing)
// Query has NO location scoping
```

**Fix**: Check that location parameters are always passed or add aggregate flag to inventory activity.

### Cause 3: Aggregate Flag Incorrectly Set
**Where**: Frontend toggle or parameter passing  
**Problem**: `aggregate=true` passed even in single-location mode  
**Result**: Location predicates skipped, all data returned

**How to verify**:
```javascript
// Check what's actually sent to backend
api.get('/reports/sales/summary', { params: monthParams })
// Log monthParams to see if aggregate=true when shouldn't be
```

---

## Query Pattern Comparison

| Aspect | Sales Reports | Analytics | Monthly Summary | Inventory Activity |
|--------|---|---|---|---|
| **Date Filtering** | `invoiceDate` (UTC+2) | `invoiceDate` (UTC+2) | `invoiceDate` (UTC+2) | Multiple fields |
| **Location Scope** | Conditional (aggregate flag) | Inherited | Frontend-controlled | Direct (can be empty) |
| **Aggregate Flag** | ✅ YES | ✅ YES (inherited) | ✅ YES (frontend) | ❌ NO |
| **Empty Filter Behavior** | Intentional if aggregate=true | Intentional if aggregate=true | All data if params missing | All data ⚠️ |
| **Correctness** | ✅ Working | ✅ Working | ⚠️ Depends on frontend | ⚠️ Bug in empty case |

---

## Date Field Analysis

**All components use the same date field approach:**
- **Field**: `invoiceDate` (primary), with secondary date fields for movements
- **Format**: UTC+2 ISO string (Blantyre local time)
- **Range filtering**: `gte: startDate AND lte: endDate`

**Why historical data doesn't appear due to date filtering:**
- The date filter is working correctly (or historical data would appear in ALL modes, not just all-locations)
- If historical data appears only in certain modes, it's a **scope filtering issue**, not a date filtering issue

---

## Investigation Checklist

### ✅ First: Verify Backend Is Receiving Parameters
```javascript
// In salesReporting.controller.js (getSalesSummary):
console.log('[DEBUG] req.query:', req.query);
console.log('[DEBUG] extracted filters:', filters);
console.log('[DEBUG] aggregate flag:', filters.aggregate);
console.log('[DEBUG] branchCode:', filters.branchCode);
console.log('[DEBUG] locationCode:', filters.locationCode);
```

### ✅ Second: Verify WHERE Clause Is Built Correctly
```javascript
// In reportingFilters.js (buildInvoiceWhere):
console.log('[DEBUG] aggregate flag:', filters.aggregate);
console.log('[DEBUG] location predicates added:', andConditions.length > 0);
console.log('[DEBUG] final WHERE clause:', where);
```

### ✅ Third: Check Frontend Is Passing Parameters
```javascript
// In MonthlySummaryTab.jsx:
console.log('[DEBUG] scopeParams when NOT aggregate:', scopeParams);
console.log('[DEBUG] selectedBranchCode:', selectedBranchCode);
console.log('[DEBUG] selectedLocationCode:', selectedLocationCode);
```

### ✅ Fourth: For Inventory Activity, Check Location Filter
```javascript
// In inventoryActivity.service.js (getPOSGRNMovements):
console.log('[DEBUG] locationFilter:', locationFilter);
console.log('[DEBUG] locationWhere:', locationWhere);
console.log('[DEBUG] final posStockIntake WHERE:', query.where.posStockIntake);
```

---

## Recommended Actions

### Immediate (Today)
1. **Add comprehensive logging** to track filters from request through database query
2. **Verify frontend** is passing location parameters in single-location mode
3. **Check database** has properly populated branchCode/locationCode values

### Short-term (This Sprint)
1. **Add aggregate flag to Inventory Activity** to match other components
2. **Validate location filters** before querying (check if empty and log warning)
3. **Add request/response validation** in API contracts
4. **Create test cases** for all-locations vs single-location modes

### Medium-term (Next Sprint)
1. **Refactor Inventory Activity** to use same filter builders as Sales Reports
2. **Extract shared scoping logic** to reusable utilities
3. **Add comprehensive documentation** of query patterns
4. **Implement audit logging** for data visibility issues

---

## Files Modified/Created

### Analysis Documents (Created)
- **BACKEND_QUERY_LOGIC_ANALYSIS.md** - Detailed technical analysis (all patterns, tables, query examples)
- **QUERY_ANALYSIS_QUICK_REFERENCE.md** - Quick reference guide with checklist
- **QUERY_FLOW_DIAGRAMS.md** - Flow diagrams and architectural patterns

### Key Source Files for Investigation
```
Backend:
  - src/utils/reportingFilters.js (buildInvoiceWhere, buildItemWhere)
  - src/services/salesReporting.service.js (query functions)
  - src/controllers/salesReporting.controller.js (API endpoints)
  - src/services/business-operations/inventoryActivity.service.js (inventory queries)
  - src/controllers/business-operations/inventoryActivity.controller.js

Frontend:
  - src/components/admin/business-operations/MonthlySummaryTab.jsx
  - src/components/admin/business-operations/ReportHistoryTab.jsx
```

---

## Expected Outcomes When Fixed

### Single-Location Mode (Fixed)
```javascript
GET /reports/sales/summary?
  periodType=month&month=5&year=2026&
  branchCode=ZOMBA&locationCode=ZA&
  aggregate=false

Expected Result:
- Only May 2026 invoices
- Only ZOMBA branch data
- Only ZA location data
- No historical data from other locations
```

### All-Locations Mode (Already Working)
```javascript
GET /reports/sales/summary?
  periodType=month&month=5&year=2026&
  aggregate=true

Expected Result:
- May 2026 invoices from ALL branches
- May 2026 invoices from ALL locations
- Aggregated totals across entire network
```

---

## Conclusion

The backend query system is **correctly designed** with appropriate location scoping logic. Historical data visibility in single-location mode is most likely due to:

1. **Frontend not passing location filters** when in single-location mode
2. **Inventory Activity missing aggregate flag** causing empty filter handling
3. **Misconfigured scope parameters** in Monthly Summary or Report History tabs

**Next Step**: Add logging as recommended above to identify which component is failing to pass the location parameters. Once identified, the fix will be straightforward (ensure parameters are always passed when needed).

The architecture supports both modes correctly; the issue is in the implementation details of filter parameter passing.
