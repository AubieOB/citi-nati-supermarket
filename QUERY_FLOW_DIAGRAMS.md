# Query Logic Flow Diagrams & Architecture

## Flow: All-Locations vs Single-Location Query Execution

### Sales Reports Query Flow (All-Locations Mode)

```
User Request
    ↓
GET /reports/sales/summary?periodType=month&month=5&year=2026&aggregate=true
    ↓
Controller: getSalesSummary()
    ├─ extractFilters(req.query)
    │   └─ filters = { aggregate: true, branchCode: null, locationCode: null, ... }
    ├─ resolvePeriod()
    │   └─ period = { startDate: Date(2026-05-01), endDate: Date(2026-05-31) }
    └─ buildInvoiceWhere(period, filters)
        └─ Create Prisma WHERE clause:
            ├─ where.invoiceDate = {
            │     gte: 2026-05-01 00:00:00 UTC+2
            │     lte: 2026-05-31 23:59:59 UTC+2
            │   }
            └─ if (!filters.aggregate) { // FALSE - skipped!
                ├─ branchScopePredicate not added
                └─ locationScopePredicate not added
            
Service: querySalesSummary(invoiceWhere)
    └─ prisma.salesInvoice.aggregate({
        where: {
            invoiceDate: { gte: ..., lte: ... }  // ← Only date filtering!
        }
    })
    
Database Result
    └─ All invoices from ALL locations in May 2026 ✓
```

### Sales Reports Query Flow (Single-Location Mode)

```
User Request
    ↓
GET /reports/sales/summary?periodType=month&month=5&year=2026&branchCode=ZOMBA&locationCode=ZA&aggregate=false
    ↓
Controller: getSalesSummary()
    ├─ extractFilters(req.query)
    │   └─ filters = { 
    │       aggregate: false,
    │       branchCode: 'ZOMBA',
    │       locationCode: 'ZA',
    │       locationId: null,
    │       ...
    │     }
    ├─ resolvePeriod()
    │   └─ period = { startDate: Date(2026-05-01), endDate: Date(2026-05-31) }
    └─ buildInvoiceWhere(period, filters)
        └─ Create Prisma WHERE clause:
            ├─ where.invoiceDate = {
            │     gte: 2026-05-01 00:00:00 UTC+2
            │     lte: 2026-05-31 23:59:59 UTC+2
            │   }
            └─ if (!filters.aggregate) { // TRUE - conditions execute!
                ├─ buildBranchScopePredicate('ZOMBA')
                │   └─ {
                │       OR: [
                │           { branchCode: { equals: 'ZOMBA', mode: 'insensitive' } },
                │           { syncSourceCode: { startsWith: 'ZOMBA', mode: 'insensitive' } },
                │           { syncSourceCode: { startsWith: 'ZA', mode: 'insensitive' } }
                │       ]
                │     }
                ├─ buildLocationScopePredicate('ZA', 'ZOMBA')
                │   └─ { locationCode: { equals: 'ZA', mode: 'insensitive' } }
                └─ where.AND = [ branchPredicate, locationPredicate ]
            
Service: querySalesSummary(invoiceWhere)
    └─ prisma.salesInvoice.aggregate({
        where: {
            invoiceDate: { gte: ..., lte: ... },
            AND: [
                { OR: [branch predicates] },
                { locationCode: 'ZA' }
            ]
        }
    })
    
Database Result
    └─ Invoices from ZOMBA/ZA location only in May 2026 ✓
```

### Inventory Activity Query Flow - POS GRN (⚠️ Potential Bug)

```
User Request
    ↓
GET /business-operations/inventory-activity/ledger?periodType=day&date=2026-05-15&locationCode=ZA
    ↓
Controller: getInventoryActivityLedger()
    ├─ Parse filters:
    │   └─ filters = {
    │       periodType: 'day',
    │       date: '2026-05-15',
    │       locationCode: 'ZA',
    │       branchCode: null,  // ← Not provided
    │       locationId: null,
    │       ...
    │     }
    ├─ Service: getInventoryActivityLedgerData({ filters })
    │   └─ buildPeriod(filters)
    │       └─ period = {
    │           startDate: 2026-05-15 00:00:00,
    │           endDate: 2026-05-15 23:59:59
    │         }
    │
    └─ getSaleMovements(period, filters)  // Uses buildItemWhere ✓
        └─ Applies location filtering correctly
            
    └─ getIntakeMovements(period, filters) → getPOSGRNMovements(period, filters)  // ⚠️
        ├─ buildLocationFilter(filters)
        │   ├─ locationFilter = {}
        │   ├─ if (filters.locationId) {...}  // false, not added
        │   ├─ if (filters.locationCode) { ... }  // adds 'ZA'
        │   └─ return { locationCode: 'ZA' }
        │
        ├─ Build locationWhere:
        │   ├─ locationWhere = {}
        │   ├─ if (locationFilter.branchCode) { ... }  // skipped
        │   └─ if (locationFilter.locationCode) {
        │       locationWhere.locationCode = 'ZA'
        │     }
        │
        ├─ Build dateWhere:
        │   └─ OR: [
        │       { grnDate: { gte, lte } },
        │       { sourceUpdatedAt: { gte, lte } }
        │     ]
        │
        └─ Query:
            └─ prisma.posStockIntakeItem.findMany({
                where: {
                    posStockIntake: {
                        is: {
                            ...dateWhere,           // Both date conditions
                            ...locationWhere,       // locationCode: 'ZA'
                        }
                    }
                }
            })
            
Database Result
    └─ POS GRNs for ZA location on 2026-05-15 ✓

---

HOWEVER - Bug Scenario:

User Request
    ↓
GET /business-operations/inventory-activity/ledger?periodType=day&date=2026-05-15
    ↓ (No locationCode provided!)
    
Controller receives:
    └─ filters = {
        periodType: 'day',
        date: '2026-05-15',
        locationCode: null,  // ← MISSING
        branchCode: null,
        locationId: null,
        ...
    }
    
Service: getInventoryActivityLedgerData()
    └─ getPOSGRNMovements(period, filters)
        ├─ buildLocationFilter(filters)
        │   ├─ locationFilter = {}
        │   ├─ if (filters.locationId) {...}  // false
        │   ├─ if (filters.locationCode) {...}  // false
        │   ├─ if (filters.branchCode) {...}  // false
        │   └─ return {}  // ← EMPTY!
        │
        ├─ Build locationWhere:
        │   ├─ locationWhere = {}
        │   ├─ if (locationFilter.branchCode) {...}  // skipped, not in locationFilter
        │   ├─ if (locationFilter.locationCode) {...}  // skipped, not in locationFilter
        │   └─ return {} // ← Still EMPTY!
        │
        ├─ Build dateWhere:
        │   └─ OR: [{ grnDate: { gte, lte } }, { sourceUpdatedAt: { gte, lte } }]
        │
        └─ Query:
            └─ prisma.posStockIntakeItem.findMany({
                where: {
                    posStockIntake: {
                        is: {
                            ...dateWhere,        // Both date conditions
                            ...locationWhere,   // Spreads NOTHING (empty object)
                        }
                        // Effectively: { grnDate: {...} OR sourceUpdatedAt: {...} }
                        // NO LOCATION FILTERING!
                    }
                }
            })
            
Database Result
    └─ POS GRNs from ALL locations on 2026-05-15 ❌
```

---

## Architecture: Query Building Hierarchy

```
REQUEST
  │
  ├─ Sales Reports
  │   │
  │   ├─ Controller: getSalesSummary(), getSalesInvoices(), getSalesProducts()
  │   │   └─ extractFilters(req.query) → buildInvoiceWhere() or buildItemWhere()
  │   │       ├─ Checks: filters.aggregate flag
  │   │       ├─ If false: buildBranchScopePredicate(), buildLocationScopePredicate()
  │   │       └─ Returns WHERE clause with conditional location scoping
  │   │
  │   └─ Service: querySalesSummary(), queryInvoiceList(), queryProductReport()
  │       ├─ Receives: invoiceWhere or itemWhere (with scoping already applied)
  │       └─ Executes: prisma query with WHERE clause
  │
  ├─ Analytics
  │   │
  │   ├─ Controller: getSalesProfitLatestCost()
  │   │   └─ extractFilters(req.query) → buildItemWhere()
  │   │       └─ Delegates to Sales Reports filter builder ✓
  │   │
  │   └─ Service: queryLatestCostProfitAnalytics()
  │       ├─ Receives: itemWhere with scoping
  │       ├─ Queries: SalesInvoiceItem (with scoping)
  │       ├─ Nested: PosStockIntake relations (inherits scoping)
  │       └─ Resolves: Latest product costs
  │
  ├─ Monthly Summary Tab (Frontend)
  │   │
  │   ├─ State: isAggregateMode (toggle switch)
  │   │
  │   ├─ Build Parameters:
  │   │   if (isAggregateMode) {
  │   │       params.aggregate = true
  │   │   } else {
  │   │       params.branchCode = selectedBranchCode
  │   │       params.locationCode = selectedLocationCode
  │   │       params.locationId = selectedLocationId
  │   │   }
  │   │
  │   └─ API Calls: Pass params to backend (Sales Reports endpoints)
  │
  ├─ Report History Tab (Frontend)
  │   │
  │   ├─ State: isAggregateMode
  │   │
  │   ├─ Build Parameters: (Same logic as Monthly Summary)
  │   │
  │   └─ API Calls: Pass params to backend
  │
  └─ Inventory Activity
      │
      ├─ Controller: getInventoryActivityLedger()
      │   └─ extractFilters(req.query) → buildLocationFilter()
      │       ├─ No aggregate flag!
      │       ├─ Returns: locationFilter with locationId, locationCode, branchCode
      │       └─ Can return empty {} if no filters provided ⚠️
      │
      └─ Service: getInventoryActivityLedgerData()
          ├─ getSaleMovements() → buildItemWhere() ✓ (uses Sales Reports builder)
          │
          ├─ getIntakeMovements() → getPOSGRNMovements()
          │   └─ locationWhere = {}  if locationFilter is empty ⚠️
          │
          ├─ getEmergencySalesMovements()
          │   └─ where = { ...locationFilter, ...dateFilter }
          │       → Can also have empty location filter ⚠️
          │
          └─ getProductSummary()
              ├─ SalesInvoiceItem query (uses locationFilter directly)
              └─ GoodsIntakeItem query (uses locationFilter directly)
```

---

## Critical Code Patterns

### Pattern 1: Conditional Location Scoping (Sales Reports)

```javascript
// ✅ CORRECT PATTERN
function buildInvoiceWhere(dateRange, filters = {}) {
  const where = { invoiceDate: dateRange };
  const andConditions = [];

  if (!filters.aggregate) {  // ← Conditional check
    // Add location predicates only if NOT in aggregate mode
    const predicate = buildLocationScopePredicate(filters.locationCode, filters.branchCode);
    if (predicate) andConditions.push(predicate);
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}
```

### Pattern 2: Direct Location Filtering (Inventory Activity)

```javascript
// ⚠️ BUG PATTERN
function buildLocationFilter(filters = {}) {
  const filter = {};  // ← Empty object

  if (filters.locationId) filter.locationId = filters.locationId;
  if (filters.locationCode) filter.locationCode = filters.locationCode;
  if (filters.branchCode) filter.branchCode = filters.branchCode;

  return filter;  // ← Can be empty!
}

// Used as:
const locationWhere = {};
if (locationFilter.branchCode) { /* add */ }
if (locationFilter.locationCode) { /* add */ }
// If no filters provided, locationWhere remains {}
```

### Pattern 3: Frontend Parameter Construction (Monthly Summary)

```javascript
// ✅ CORRECT PATTERN (when working)
const scopeParams = useMemo(() => {
  const params = {};

  if (!isAggregateMode) {
    params.branchCode = effectiveBranchCode || undefined;  // ← Must not be undefined!
    params.locationCode = effectiveLocationCode || undefined;
    params.locationId = selectedLocationId || undefined;
  }

  if (isAggregateMode) {
    params.aggregate = true;
  }

  return compactParams(params);  // Removes undefined values
}, [...dependencies]);

// ❌ BUG PATTERN (when filters missing)
const scopeParams = {};  // ← Empty if not carefully constructed
// Result: Backend receives no location filters
```

---

## Data Flow: Where Does Historical Data Come From?

### Scenario: Historical data from 3 months ago appears in current month view

```
User selects: May 2026, Single Location (ZOMBA/ZA)

✓ Frontend correctly passes: branchCode=ZOMBA, locationCode=ZA, aggregate=false

✓ Backend receives: filters.aggregate = false

✓ buildInvoiceWhere() executes: if (!filters.aggregate) { add location predicates }

✓ WHERE clause built with location filtering

✗ BUT: Database still returns April invoices!

INVESTIGATION:
  1. Check if invoices in database have invoiceDate = April (not May)
     → If yes, why are they matching May date range?
     → Check invoiceDate values, possibly timezone issue?

  2. Check if invoices have wrong branchCode/locationCode
     → If yes, location filtering not working properly
     → Check buildLocationScopePredicate() logic

  3. Check if sales came from different location (e.g., BT instead of ZA)
     → buildBranchScopePredicate() may have expanded scope too wide
     → Check BRANCH_SYNC_SOURCE_PREFIXES mapping

  4. For Inventory Activity specifically:
     → Check if locationCode was passed
     → If not, buildLocationFilter() returns empty {}
     → No location scoping applied
```

---

## Testing Patterns

### Test Case 1: All-Locations Mode Should Return All Data
```javascript
GET /reports/sales/summary?periodType=month&month=5&year=2026&aggregate=true

Expected:
- SUM of all branches (BLANTYRE, ZOMBA)
- SUM of all locations (BT, ZA, SH, BAR, WH)
- Total invoices from entire network

If receives 0:
  → Check database has data for May 2026
  → Check invoiceDate format

If receives filtered data:
  → Check aggregate flag is actually true
  → Check buildInvoiceWhere() is not applying unexpected predicates
```

### Test Case 2: Single-Location Mode Should Return Only That Location
```javascript
GET /reports/sales/summary?periodType=month&month=5&year=2026&branchCode=ZOMBA&locationCode=ZA

Expected:
- Only invoices with branchCode=ZOMBA AND locationCode=ZA
- Only invoices with invoiceDate in May 2026

If receives all locations:
  → Check parameters were received (log req.query)
  → Check buildInvoiceWhere() received filters
  → Check aggregate flag is actually false
  → Check buildLocationScopePredicate() is building non-null predicate

If receives 0:
  → Check database has ZOMBA/ZA invoices for May
  → Check invoiceDate is in UTC+2 format correctly
```

### Test Case 3: Inventory Activity With Location Filter
```javascript
GET /business-operations/inventory-activity/ledger?periodType=day&date=2026-05-15&locationCode=ZA

Expected:
- Only movements from ZA location
- Only movements from 2026-05-15

If receives all locations:
  → Check locationCode parameter was received
  → Check buildLocationFilter() returned correct object
  → Check locationWhere was populated in getPOSGRNMovements()

If receives 0:
  → Check database has data for ZA on that date
  → Check createdAt/grnDate/sourceUpdatedAt format
```

---

## Summary Table: What Gets Filtered Where

| Component | Aggregate Flag | Location Predicates | Result |
|-----------|---|---|---|
| Sales Reports, aggregate=true | YES (true) | NOT ADDED | All locations ✓ |
| Sales Reports, aggregate=false | YES (false) | ADDED | Single location ✓ |
| Analytics, aggregate=true | YES (inherited) | NOT ADDED | All locations ✓ |
| Analytics, aggregate=false | YES (inherited) | ADDED | Single location ✓ |
| Inventory Activity, with filters | NO | ADDED (if not empty) | Single location ✓ |
| Inventory Activity, no filters | NO | NOT ADDED (empty object) | All locations ❌ |

The system works correctly **IF**:
1. Aggregate flag is used consistently
2. Location filters are passed when needed
3. Empty filter objects are handled properly
