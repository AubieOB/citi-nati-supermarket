# Backend Business Operations Query Logic Analysis
**Date**: May 15, 2026  
**Focus**: Understanding why historical data is visible in all-locations mode but not in single-location mode

---

## Executive Summary

The historical data visibility issue stems from **how location filtering is conditionally applied** in the query builders, NOT from date field differences. The system works as designed but may have a bug in single-location mode where filters are not being passed correctly.

---

## 1. Sales Reports Query Pattern (Reference - Working)

### Location: `src/services/salesReporting.service.js` & `src/controllers/salesReporting.controller.js`

### Query Functions
1. **querySalesSummary(invoiceWhere)** - High-level metrics (total invoices, items, sales)
2. **queryInvoiceList(invoiceWhere, pagination, sort)** - Paginated invoice rows
3. **queryProductReport(itemWhere, pagination, sort)** - Product-level aggregation
4. **queryUserReport(invoiceWhere, pagination, sort)** - Cashier aggregation
5. **queryPaymentReport(invoiceWhere)** - Payment method totals
6. **queryLatestCostProfitAnalytics(itemWhere, filters)** - Profit analytics with GRN costs

### Tables Queried
- **Primary**: `salesInvoice` (invoice aggregates), `salesInvoiceItem` (line items)
- **Secondary**: `product` (category lookup), `posStockIntake` (for cost basis)
- **Related**: `expense`, `payrollEntry` (for expense totals in analytics)

### Date Field Used
- **Main field**: `invoiceDate` (Blantyre local date)
- **Format**: Midnight UTC ± offset for Blantyre (UTC+2)
- **Range**: `invoiceDate >= startDate AND invoiceDate <= endDate`

### Scope Filtering Logic

#### Controller Setup (`salesReporting.controller.js`)
```javascript
async function getSalesSummary(req, res) {
  const period = resolvePeriodOrRespond(req, res);
  if (!period) return;

  const filters = extractFilters(req.query);  // Extract raw query params
  const dateRange = formatDateRange(period.startDate, period.endDate);
  const invoiceWhere = buildInvoiceWhere(period, filters);  // Build WHERE clause

  const data = await querySalesSummary(invoiceWhere);
  // ...
}
```

#### Filter Building (`src/utils/reportingFilters.js`)
```javascript
function extractFilters(query) {
  return {
    branchCode: sanitizeStr(query.branchCode),
    locationCode: sanitizeStr(query.locationCode),
    locationId: parseOptionalInt(query.locationId),
    aggregate: query.aggregate === 'true' || query.aggregate === true,
    // ... other filters
  };
}

function buildInvoiceWhere(dateRange, filters = {}) {
  const where = {};
  const andConditions = [];

  // Date range filtering
  if (dateRange) {
    where.invoiceDate = {
      gte: dateRange.startDate,
      lte: dateRange.endDate,
    };
  }

  // ⭐ CRITICAL: Location scoping is CONDITIONAL on aggregate flag
  if (!filters.aggregate) {  // Only apply if NOT in aggregate mode
    const branchScopePredicate = buildBranchScopePredicate(filters.branchCode);
    if (branchScopePredicate) {
      andConditions.push(branchScopePredicate);
    }

    const locationScopePredicate = buildLocationScopePredicate(
      filters.locationCode,
      filters.branchCode
    );
    if (locationScopePredicate) {
      andConditions.push(locationScopePredicate);
    }
  }

  // Add locationId if provided
  if (filters.locationId !== null && filters.locationId !== undefined) {
    where.locationId = filters.locationId;
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  console.log('[REPORTING SCOPE]', {
    aggregate: filters.aggregate || false,
    branchCode: filters.branchCode || null,
    locationCode: filters.locationCode || null,
    locationId: filters.locationId || null,
  });

  return where;
}
```

#### Scope Predicate Builders
```javascript
// Branch scoping with sync source prefix matching
function buildBranchScopePredicate(branchCode) {
  const normalizedBranch = normalizeBranchCode(branchCode);
  if (!normalizedBranch) return null;

  const syncPrefixes = BRANCH_SYNC_SOURCE_PREFIXES[normalizedBranch] || [normalizedBranch];

  return {
    OR: [
      { branchCode: { equals: normalizedBranch, mode: 'insensitive' } },
      ...syncPrefixes.map((prefix) => ({
        syncSourceCode: { startsWith: prefix, mode: 'insensitive' },
      })),
    ],
  };
}

// Location scoping with operational scope expansion
function buildLocationScopePredicate(locationCode, branchCode) {
  const normalizedLocation = normalizeScopeCode(locationCode);
  if (!normalizedLocation) return null;

  const normalizedBranch = normalizeBranchCode(branchCode);
  const isBranchAlias = normalizedLocation === 'ZA' || normalizedLocation === 'BT';

  if (normalizedBranch && !isBranchAlias) {
    return { locationCode: { equals: normalizedLocation, mode: 'insensitive' } };
  }

  const scopeCodes = expandOperationalLocationScopeCodes(normalizedLocation);
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) return null;
  if (scopeCodes.length === 1) {
    return { locationCode: { equals: scopeCodes[0], mode: 'insensitive' } };
  }

  return {
    OR: scopeCodes.map((code) => ({
      locationCode: { equals: code, mode: 'insensitive' },
    })),
  };
}
```

### Query Pattern Examples

#### All-Locations Mode (aggregate=true)
```javascript
// Frontend request
GET /reports/sales/summary?periodType=month&month=5&year=2026&aggregate=true

// filters = { aggregate: true, branchCode: null, locationCode: null, ... }
// WHERE clause built:
where = {
  invoiceDate: {
    gte: Date(2026-05-01 00:00:00+2),
    lte: Date(2026-05-31 23:59:59+2),
  }
  // NO location/branch filtering because aggregate=true
}

// Result: All invoices from ALL locations in May 2026
```

#### Single-Location Mode (aggregate=false)
```javascript
// Frontend request
GET /reports/sales/summary?periodType=month&month=5&year=2026&branchCode=ZOMBA&locationCode=ZA&aggregate=false

// filters = { aggregate: false, branchCode: 'ZOMBA', locationCode: 'ZA', ... }
// WHERE clause built:
where = {
  invoiceDate: {
    gte: Date(2026-05-01 00:00:00+2),
    lte: Date(2026-05-31 23:59:59+2),
  },
  AND: [
    {
      OR: [
        { branchCode: { equals: 'ZOMBA', mode: 'insensitive' } },
        { syncSourceCode: { startsWith: 'ZOMBA', mode: 'insensitive' } },
        { syncSourceCode: { startsWith: 'ZA', mode: 'insensitive' } },
      ]
    },
    {
      locationCode: { equals: 'ZA', mode: 'insensitive' }
    }
  ]
}

// Result: Only invoices from ZOMBA branch AND ZA location in May 2026
```

---

## 2. Analytics Query Pattern (queryLatestCostProfitAnalytics)

### Location: `src/services/salesReporting.service.js` (lines 445-end)

### Endpoint
```javascript
// Controller: GET /reports/sales/profit-latest-cost
async function getSalesProfitLatestCost(req, res) {
  const period = resolvePeriodOrRespond(req, res);
  const filters = extractFilters(req.query);
  const itemWhere = buildItemWhere(period, filters);  // Uses same filter builder!
  const data = await queryLatestCostProfitAnalytics(itemWhere, filters);
  // ...
}
```

### Tables Queried
- **SalesInvoiceItem** (groupBy syncSourceCode, productCode, productName)
- **SalesInvoice** (via nested WHERE through itemWhere)
- **Product** (master data for categories)
- **LatestProductCost** (custom resolver for GRN costs)
- **Expense** (operating expenses)
- **PayrollEntry** (payroll expenses)

### Date Field
- **Field**: `invoiceDate` (inherited from salesInvoice via nested WHERE)
- **Range**: Same as Sales Reports

### Scope Filtering
```javascript
// Uses buildItemWhere which nests salesInvoice WHERE:
function buildItemWhere(dateRange, filters = {}) {
  const where = {
    salesInvoice: buildInvoiceWhere(dateRange, filters),
  };
  
  if (filters.productCode) {
    where.productCode = { contains: filters.productCode, mode: 'insensitive' };
  }
  if (filters.productName) {
    where.productName = { contains: filters.productName, mode: 'insensitive' };
  }

  return where;
}
```

**Result**: Analytics queries use **identical location scoping** as Sales Reports

### Query Implementation
```javascript
async function queryLatestCostProfitAnalytics(itemWhere, filters = {}) {
  // 1. Group sales by syncSourceCode, productCode, productName
  const [groupedProducts, salesItems] = await Promise.all([
    prisma.salesInvoiceItem.groupBy({
      by: ['syncSourceCode', 'productCode', 'productName'],
      where: itemWhere,  // ⭐ Scope filtering applied here!
      _sum: { qty: true, amount: true, taxAmount: true, discountAmount: true },
      _avg: { unitPrice: true },
      _count: { id: true },
    }),
    prisma.salesInvoiceItem.findMany({
      where: itemWhere,  // ⭐ Same scope filtering
      select: { /* ... */ },
    }),
  ]);

  // 2. Extract product codes and get cost basis
  const productCodes = Array.from(new Set(
    groupedProducts
      .map((row) => normalizeProductCode(row.productCode))
      .filter(Boolean),
  ));

  // 3. Resolve latest costs from posStockIntake
  const [latestCostMap, productDetails] = await Promise.all([
    resolveLatestProductCosts({ productKeys, filters }),
    prisma.product.findMany({
      where: { sourceCode: { in: productCodes } },
      select: { sourceCode: true, name: true, category: true },
    }),
  ]);

  // 4. Build final product records with profit calculations
  const branchScopedProducts = groupedProducts.map((group) => {
    // Calculate: revenue - (latestUnitCost * qty) = grossProfit
    // ...
  });

  // 5. Aggregate and calculate summary metrics
  const summary = {
    totalProducts: 0,
    completeProducts: 0,  // Has valid latest cost
    incompleteProducts: 0,  // Missing cost basis
    totalRevenue: 0,
    completeRevenue: 0,
    totalCostOfGoodsSold: 0,
    totalGrossProfit: 0,
    totalExpenses: 0,  // Operating + Payroll
    netProfit: 0,
    // ...
  };

  // 6. Fetch expense data with same scope
  const expenseWhere = buildExpenseWhere(itemWhere, filters);
  if (expenseWhere) {
    const expenseAgg = await prisma.expense.aggregate({
      where: expenseWhere,
      _sum: { amount: true },
    });
  }

  return { products, summary };
}
```

---

## 3. Monthly Summary Tab Query Pattern

### Location: `src/components/admin/business-operations/MonthlySummaryTab.jsx`

### Frontend Parameters Construction
```javascript
const effectiveBranchCode = normalizeCode(selectedBranchCode);
const effectiveLocationCode = normalizeCode(selectedLocationCode);

const scopeParams = useMemo(
  () => {
    const params = {};

    if (!isAggregateMode) {
      params.branchCode = effectiveBranchCode || undefined;
      params.locationCode = effectiveLocationCode || undefined;
      params.locationId = selectedLocationId || undefined;
    }

    if (isAggregateMode) {
      params.aggregate = true;
    }

    return compactParams(params);  // Remove undefined values
  },
  [effectiveBranchCode, effectiveLocationCode, selectedLocationId, isAggregateMode]
);
```

### API Endpoints Called
```javascript
// When NOT in aggregate mode, calls with location filters:
GET /business-operations/reports/sales/summary?
  periodType=month&month=5&year=2026&
  branchCode=ZOMBA&locationCode=ZA&locationId=1

// When in aggregate mode, calls with aggregate flag:
GET /business-operations/reports/sales/summary?
  periodType=month&month=5&year=2026&
  aggregate=true
```

### Supported Sections
1. **Overview Cards** - Key metrics cards
2. **Sales Overview** - Sales summary, payment methods, top products
3. **Expenses Overview** - Total expenses breakdown
4. **Payroll Overview** - Payroll period data
5. **Suppliers Overview** - Supplier transaction data
6. **Net Overview** - Combined profit/loss metrics

### Multi-Location Toggle
```javascript
const renderAggregateToggle = () => {
  // Toggle button that switches between single-location and all-locations mode
  // When clicked, calls onToggleAggregateMode() which refreshes queries with new isAggregateMode
};
```

### Critical Issue
**The toggle only works if `onToggleAggregateMode` is defined and passed from parent component.**

---

## 4. Report History Tab Query Pattern

### Location: `src/components/admin/business-operations/ReportHistoryTab.jsx`

### Frontend Parameters
```javascript
const monthParams = {
  ...getCurrentMonthParams(),  // Defaults to current month
  ...(isAggregateMode ? { aggregate: true } : {
    ...(selectedLocationId && { locationId: selectedLocationId }),
    ...(normalizedLocationCode && { locationCode: normalizedLocationCode }),
    ...(normalizedBranchCode && { branchCode: normalizedBranchCode }),
  }),
};

function getCurrentMonthParams() {
  const today = new Date();
  return {
    periodType: 'month',
    month: String(today.getMonth() + 1),
    year: String(today.getFullYear()),
  };
}
```

### API Calls
```javascript
// All use monthParams with same pattern as MonthlySummaryTab:
Promise.all([
  api.get('/business-operations/reports/sales/summary', { params: monthParams }),
  api.get('/business-operations/reports/sales/invoices', 
    { params: { ...monthParams, page: 1, pageSize: 5, sortBy: 'invoiceDate', sortOrder: 'desc' } }),
  api.get('/business-operations/expenses', 
    { params: { page: 1, pageSize: 5, ...(selectedLocationId && !isAggregateMode && { locationId: selectedLocationId }) } }),
  api.get('/business-operations/suppliers/transactions/list', 
    { params: { page: 1, pageSize: 5, ...(selectedLocationId && !isAggregateMode && { locationId: selectedLocationId }) } }),
  api.get('/business-operations/payroll/periods', 
    { params: { page: 1, pageSize: 5, ...(selectedLocationId && !isAggregateMode && { locationId: selectedLocationId }) } }),
]);
```

### Auto-Refresh
- Default: Every 30 seconds (AUTO_REFRESH_MS = 30000)
- Debounce: 350ms after visibility change (AUTO_REFRESH_DEBOUNCE_MS)

---

## 5. Inventory Activity Query Pattern

### Location: `src/services/business-operations/inventoryActivity.service.js`

### Endpoint
```javascript
// Controller: GET /business-operations/inventory-activity/ledger
async function getInventoryActivityLedger(req, res) {
  const filters = {
    periodType: req.query.periodType || 'day',
    date: req.query.date || null,
    month: req.query.month ? parseInt(req.query.month, 10) : null,
    year: req.query.year ? parseInt(req.query.year, 10) : null,
    startDate: req.query.startDate || null,
    endDate: req.query.endDate || null,
    locationId: req.query.locationId ? Number(req.query.locationId) : null,
    locationCode: normalizeQueryValue(req.query.locationCode),
    branchCode: normalizeQueryValue(req.query.branchCode),
    productCode: normalizeQueryValue(req.query.productCode),
    productName: normalizeQueryValue(req.query.productName),
    movementType: normalizeQueryValue(req.query.movementType),
  };

  const data = await getInventoryActivityLedgerData({ filters });
  return res.json({ success: true, data, error: null });
}
```

### Tables Queried

#### 1. Sales Movements (SALE)
- **Table**: `salesInvoiceItem`
- **Relation**: `salesInvoice` for invoice details
- **Date Field**: `invoiceDate`
- **Filter**: Uses `buildItemWhere()` (same as Sales Reports)

#### 2. Stock Intake Movements (STOCK_IN)
- **Table**: `posStockIntakeItem`
- **Relation**: `posStockIntake` (GRN header)
- **Date Fields** (OR condition):
  - `grnDate` (goods received date)
  - `sourceUpdatedAt` (sync update time)
- **Filter**: Custom location filtering (see below)

#### 3. Emergency Sales (EMERGENCY_SALE)
- **Table**: `emergencySale`
- **Date Field**: `createdAt`
- **Filter**: Direct location filter

#### 4. Stock Adjustments
- **Table**: Not available (returns empty array)
- **Note**: Stock adjustments handled through external POS tables

### Location Filtering Logic

```javascript
function buildLocationFilter(filters = {}) {
  const locationFilter = {};
  
  if (filters.locationId) {
    locationFilter.locationId = Number(filters.locationId);
  }
  if (filters.locationCode) {
    locationFilter.locationCode = normalizeUpper(filters.locationCode);
  }
  if (filters.branchCode) {
    locationFilter.branchCode = normalizeUpper(filters.branchCode);
  }
  
  return locationFilter;  // ⚠️ Returns empty {} if no filters provided!
}
```

**CRITICAL DIFFERENCE**: Unlike Sales Reports, **there is NO aggregation flag**. The location filter is applied directly without conditional logic.

### Sale Movements Query
```javascript
async function getSaleMovements(period, filters = {}) {
  const where = buildItemWhere(period, filters);  // Uses Sales Reports filter builder

  const rows = await prisma.salesInvoiceItem.findMany({
    where,
    select: { /* ... */ },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });

  return rows.map((row) => ({
    movementDate: row.salesInvoice?.invoiceDate || row.createdAt,
    movementType: 'SALE',
    // ...
  }));
}
```

### POS GRN Movements Query (⚠️ POTENTIAL BUG LOCATION)
```javascript
async function getPOSGRNMovements(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);  // Can be empty {}!

  // Build location WHERE clause
  const locationWhere = {};
  if (locationFilter.branchCode) {
    locationWhere.branchCode = {
      equals: locationFilter.branchCode,
      mode: 'insensitive',
    };
  }
  if (locationFilter.locationCode) {
    locationWhere.locationCode = {
      equals: locationFilter.locationCode,
      mode: 'insensitive',
    };
  }

  // Build date WHERE clause
  const dateWhere = {
    OR: [
      { grnDate: { gte: period.startDate, lte: period.endDate } },
      { sourceUpdatedAt: { gte: period.startDate, lte: period.endDate } },
    ],
  };

  // ⭐ MAIN QUERY
  const grnItems = await prisma.posStockIntakeItem.findMany({
    where: {
      ...productFilter,
      posStockIntake: {
        is: {
          ...dateWhere,        // Date filtering
          ...locationWhere,    // Location filtering - can be empty!
        },
      },
      quantity: { gt: 0 },
    },
    include: {
      posStockIntake: {
        select: { /* GRN details */ },
      },
    },
    orderBy: [
      { posStockIntake: { grnDate: 'asc' } },
      { posStockIntake: { grnNo: 'asc' } },
      { productCode: 'asc' },
    ],
  });
}
```

**The Bug**: When `locationFilter` is empty (no locationId, locationCode, or branchCode provided):
- `locationWhere` remains `{}`
- `...locationWhere` spreads nothing
- `posStockIntake: { is: dateWhere }` applies ONLY date filtering
- **Result: Returns GRN movements from ALL locations**

### Opening Balance Calculation
```javascript
async function getOpeningBalance(productCode, productName, locationCode, periodStartDate, filters = {}) {
  const locationFilter = buildLocationFilter(filters);

  // Gets current synced stock
  const currentSyncedStock = await resolveExactPersistedProduct(
    productCode,
    locationFilter.branchCode,
    locationFilter.locationCode,
    productName
  );

  // Gets transactions after period start
  const [salesAfter, posGrnAfter] = await Promise.all([
    prisma.salesInvoiceItem.findMany({
      where: {
        productCode: { equals: productCode, mode: 'insensitive' },
        salesInvoice: {
          ...(filters.branchCode ? { branchCode: normalizeUpper(filters.branchCode) } : {}),
          ...(filters.locationCode ? { locationCode: { equals: normalizeUpper(filters.locationCode), mode: 'insensitive' } } : {}),
          OR: [{ invoiceDate: { gt: periodStartDate } }, { invoiceTime: { gt: periodStartDate } }],
        },
      },
      select: { qty: true },
    }),
    // ... similar for posGrnAfter
  ]);

  // Formula: current + (qtyIn - qtyOut) = opening balance at period start
  const openingBal = latestStockBalance + totalQtyInInSelectedPeriod - totalQtyOutInSelectedPeriod;
}
```

---

## Comparison Matrix

| Aspect | Sales Reports | Analytics | Monthly Summary | Report History | Inventory Activity |
|--------|---------------|-----------|-----------------|----------------|-------------------|
| **Primary Table** | SalesInvoice | SalesInvoiceItem | (inherited) | (inherited) | SalesInvoiceItem + PosStockIntakeItem |
| **Date Field** | invoiceDate | invoiceDate | invoiceDate | invoiceDate | invoiceDate, grnDate, sourceUpdatedAt, createdAt |
| **Branch Filter** | buildBranchScopePredicate() | (inherited) | (inherited) | (inherited) | Direct branchCode equality |
| **Location Filter** | buildLocationScopePredicate() | (inherited) | (inherited) | (inherited) | Direct locationCode/locationId equality |
| **Aggregate Flag** | ✅ YES - conditionally disables scoping | ✅ YES - inherited | ✅ YES - frontend logic | ✅ YES - frontend logic | ❌ NO - no aggregate flag |
| **Empty Filter Behavior** | Returns ALL data (intended if aggregate=true) | Returns ALL data | Returns ALL data | Returns ALL data | Returns ALL data ⚠️ |
| **Scope Builder** | buildInvoiceWhere() + buildItemWhere() | buildItemWhere() | Query param pass-through | Query param pass-through | buildLocationFilter() |
| **Logging** | ✅ Extensive scope logging | ✅ Inherited logging | ❌ Frontend only | ❌ Frontend only | ✅ Diagnostic logging |

---

## Root Cause Analysis: Historical Data Visibility

### The Issue
Historical data (from prior periods/locations) appears in:
- ✅ **All-Locations Mode** - EXPECTED and correct
- ❌ **Single-Location Mode** - SHOULD NOT happen, indicates bug

### Why It Works Correctly in All-Locations Mode
```javascript
// Frontend passes: aggregate=true
// Backend logic:
if (!filters.aggregate) {  // false, so condition is skipped
  // Location predicates are NOT added
}

// WHERE clause only has:
where.invoiceDate = { gte: startDate, lte: endDate }

// Result: All invoices from ALL locations in the date range
```

### Why It Should Work in Single-Location Mode
```javascript
// Frontend passes: aggregate=false, branchCode='ZOMBA', locationCode='ZA'
// Backend logic:
if (!filters.aggregate) {  // true, so condition executes
  const branchScopePredicate = buildBranchScopePredicate('ZOMBA');
  const locationScopePredicate = buildLocationScopePredicate('ZA', 'ZOMBA');
  andConditions.push(branchScopePredicate, locationScopePredicate);
}

// WHERE clause has:
where.invoiceDate = { gte: startDate, lte: endDate }
where.AND = [
  { OR: [{ branchCode: 'ZOMBA' }, { syncSourceCode: { startsWith: 'ZOMBA' } }, ...] },
  { locationCode: 'ZA' }
]

// Result: Only invoices from ZOMBA branch AND ZA location
```

### Why Historical Data Might Appear in Single-Location Mode (Bug Scenarios)

#### Scenario 1: Frontend Not Passing Location Filters
```javascript
// Frontend might pass:
GET /reports/sales/summary?periodType=month&month=5&year=2026
// Missing: branchCode, locationCode, locationId

// Backend receives:
filters = { aggregate: false, branchCode: null, locationCode: null, locationId: null }

// Location predicates not built:
branchScopePredicate = buildBranchScopePredicate(null) → returns null
locationScopePredicate = buildLocationScopePredicate(null, null) → returns null

// Result: No location filtering applied, all data returned
```

**Check**: In MonthlySummaryTab.jsx, verify that `scopeParams` is correctly built with branchCode/locationCode/locationId when NOT in aggregate mode.

#### Scenario 2: Aggregate Flag Incorrectly Set
```javascript
// Frontend accidentally passes aggregate=true even in single-location mode
GET /reports/sales/summary?periodType=month&month=5&year=2026&branchCode=ZOMBA&aggregate=true

// Backend receives:
filters = { aggregate: true, branchCode: 'ZOMBA', locationCode: null }

// Location filtering SKIPPED:
if (!filters.aggregate) {  // false because aggregate=true
  // This block never runs!
}

// Result: No location filtering, all data returned
```

**Check**: Ensure toggle between aggregate/non-aggregate modes properly sets the flag.

#### Scenario 3: Inventory Activity - Missing Location Parameters
```javascript
// For inventory activity specifically:
const locationFilter = buildLocationFilter(filters);
// If filters has NO locationCode/branchCode/locationId, locationFilter = {}

// When building posStockIntake WHERE:
const locationWhere = {};
// If filters.branchCode is null/undefined, nothing added
// If filters.locationCode is null/undefined, nothing added

// Result: locationWhere = {} (empty)
// Query: posStockIntake: { is: { ...dateWhere, ...locationWhere } }
// Effective: posStockIntake: { is: dateWhere }
// Matches: ALL GRNs matching date range from ALL locations
```

---

## Key Implementation Details

### Date Range Building
```javascript
function buildPeriod(filters = {}) {
  const now = new Date();
  let startDate, endDate;

  const localNow = new Date(now.getTime() + BLANTYRE_TZ_OFFSET_MS);
  const currentYear = localNow.getUTCFullYear();
  const currentMonth = localNow.getUTCMonth() + 1;

  switch (filters.periodType) {
    case 'day':
      // Specific date or today
      startDate = buildBlantyreDate(year, month, day, 0, 0, 0, 0);    // 00:00:00
      endDate = buildBlantyreDate(year, month, day, 23, 59, 59, 999); // 23:59:59
      break;
    case 'month':
      // Entire month
      startDate = buildBlantyreDate(year, month, 1, 0, 0, 0, 0);
      endDate = buildBlantyreDate(year, month, lastDayOfMonth, 23, 59, 59, 999);
      break;
    // ... other period types
  }

  return { startDate, endDate };
}
```

**Important**: Times are UTC strings with +02:00 offset, not JavaScript Date objects in UTC.

### Timezone Handling
```javascript
// Blantyre timezone offset: UTC+2
const BLANTYRE_TZ_OFFSET_MS = 2 * 60 * 60 * 1000;

function buildBlantyreDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${String(ms).padStart(3, '0')}+02:00`);
}

// For displaying to user:
function formatBlantyreDateTimeParts(dateValue) {
  const shifted = new Date(dateValue.getTime() + BLANTYRE_TZ_OFFSET_MS);
  return {
    transactionDate: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    transactionTime: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
  };
}
```

---

## Conclusion

### System Design
The codebase correctly implements conditional location scoping:
- **All-Locations Mode**: Aggregate flag bypasses location predicates → returns data from all locations
- **Single-Location Mode**: Location predicates applied → returns only scoped location data

### Most Likely Cause of Bug
**Historical data visible in single-location mode** is most likely caused by:

1. **Frontend not passing location filters** when supposed to be in single-location mode
   - Check: MonthlySummaryTab.jsx `scopeParams` construction
   - Check: ReportHistoryTab.jsx parameter passing

2. **Aggregate mode incorrectly enabled** even in single-location context
   - Check: Toggle button state management
   - Check: Whether `aggregate=true` is accidentally being passed

3. **For Inventory Activity specifically**: Location filters missing from request
   - Check: Controller receives locationCode/branchCode/locationId
   - Check: `buildLocationFilter()` is not receiving values

### Recommended Actions
1. Add request logging in controllers to see what filters are actually received
2. Add response logging showing which WHERE clauses are built
3. Check frontend passes location parameters in single-location mode
4. Verify aggregate flag is correctly toggled in UI
5. For inventory activity, ensure locationCode is explicitly passed
