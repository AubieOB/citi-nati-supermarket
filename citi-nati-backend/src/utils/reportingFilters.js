'use strict';

// ---------------------------------------------------------------------------
// Allowed filter field sets — controls what can be sorted or filtered.
// ---------------------------------------------------------------------------

const ALLOWED_INVOICE_SORT_FIELDS = new Set([
  'invoiceDate',
  'netSale',
  'grossSale',
  'vatAmount',
  'discount',
  'userName',
  'locationCode',
  'branchCode',
  'sourceInvoiceNo',
]);

const ALLOWED_PRODUCT_SORT_FIELDS = new Set([
  'totalQuantitySold',
  'totalSales',
  'productCode',
  'productName',
  'totalTax',
  'totalDiscount',
]);

const ALLOWED_USER_SORT_FIELDS = new Set([
  'totalInvoices',
  'totalSales',
  'grossSales',
  'vatTotal',
  'averageInvoiceValue',
  'userName',
]);

const ALLOWED_PAYMENT_SORT_FIELDS = new Set(['payMethod', 'totalAmount', 'invoiceCount']);

const ALLOWED_SORT_ORDERS = new Set(['asc', 'desc']);

const BRANCH_SYNC_SOURCE_PREFIXES = {
  BLANTYRE: ['BLANTYRE', 'BT'],
  ZOMBA: ['ZOMBA', 'ZA'],
};

const { normalizeScopeCode, expandOperationalLocationScopeCodes } = require('./operationalScope');

function normalizeBranchCode(branchCode) {
  const normalized = sanitizeStr(branchCode)?.toUpperCase();
  if (!normalized) return null;
  if (['BT', 'BLANTYRE', 'BLANTYRE_SH'].includes(normalized)) return 'BLANTYRE';
  if (['ZA', 'ZOMBA', 'ZOMBA_SH', 'ZOMBA_BAR', 'ZOMBA_RES'].includes(normalized)) return 'ZOMBA';
  return normalized;
}

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

// ---------------------------------------------------------------------------
// Filter extraction from raw query params
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Filter extraction from raw query params
// ---------------------------------------------------------------------------

/**
 * Extract and sanitize the common reporting filter fields from req.query.
 * Returns a plain object — all values are either a non-empty string or null.
 */
function extractFilters(query) {
  return {
    branchCode: sanitizeStr(query.branchCode),
    syncSourceCode: sanitizeStr(query.syncSourceCode),
    locationCode: sanitizeStr(query.locationCode),
    locationId: parseOptionalInt(query.locationId),
    userName: sanitizeStr(query.userName),
    productCode: sanitizeStr(query.productCode),
    productName: sanitizeStr(query.productName),
    payMethod: sanitizeStr(query.payMethod),
    invoiceType: sanitizeStr(query.invoiceType),
    aggregate: query.aggregate === 'true' || query.aggregate === true,
  };
}

// ---------------------------------------------------------------------------
// Prisma WHERE clause builders
// ---------------------------------------------------------------------------

/**
 * Build a Prisma WHERE clause for SalesInvoice from a resolved date range
 * and a sanitized filters object (from extractFilters).
 *
 * All conditions are optional – only those with a non-null value are added.
 */
function buildLocationScopePredicate(locationCode) {
  const normalizedLocation = normalizeScopeCode(locationCode);
  if (!normalizedLocation) return null;

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

function buildInvoiceWhere(dateRange, filters = {}) {
  const where = {};
  const andConditions = [];

  if (dateRange) {
    where.invoiceDate = {
      gte: dateRange.startDate,
      lte: dateRange.endDate,
    };
  }

  // Skip branch and location scoping when aggregate mode is enabled
  if (!filters.aggregate) {
    const branchScopePredicate = buildBranchScopePredicate(filters.branchCode);
    if (branchScopePredicate) {
      andConditions.push(branchScopePredicate);
    }

    const locationScopePredicate = buildLocationScopePredicate(filters.locationCode);
    if (locationScopePredicate) {
      andConditions.push(locationScopePredicate);
    }
  }

  if (filters.syncSourceCode) {
    where.syncSourceCode = filters.syncSourceCode;
  }

  if (filters.locationId !== null && filters.locationId !== undefined) {
    where.locationId = filters.locationId;
  }

  if (filters.userName) {
    where.userName = { contains: filters.userName, mode: 'insensitive' };
  }

  if (filters.invoiceType) {
    where.invoiceType = { equals: filters.invoiceType, mode: 'insensitive' };
  }

  // payMethod can match either payMethod1 or payMethod2
  if (filters.payMethod) {
    andConditions.push({ OR: [
      { payMethod1: { equals: filters.payMethod, mode: 'insensitive' } },
      { payMethod2: { equals: filters.payMethod, mode: 'insensitive' } },
    ] });
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

/**
 * Build a Prisma WHERE clause for SalesInvoiceItem that filters through the
 * parent SalesInvoice.  Accepts the same dateRange + filters as buildInvoiceWhere
 * plus optional product-level filters.
 */
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

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Parse page / pageSize query params into { page, pageSize, skip, take }.
 * Always returns valid, bounded values – never throws.
 */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate sortBy / sortOrder against an allowed field set.
 * Returns { sortBy, sortOrder } or { error: string }.
 */
function parseSort(query, allowedFields, defaultField, defaultOrder = 'desc') {
  const rawSortBy = query.sortBy || defaultField;
  const rawSortOrder = (query.sortOrder || defaultOrder).toLowerCase();

  if (!allowedFields.has(rawSortBy)) {
    return {
      error: `Invalid sortBy '${rawSortBy}'. Allowed: ${[...allowedFields].join(', ')}`,
    };
  }

  if (!ALLOWED_SORT_ORDERS.has(rawSortOrder)) {
    return { error: "sortOrder must be 'asc' or 'desc'" };
  }

  return { sortBy: rawSortBy, sortOrder: rawSortOrder };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Build the `filters` block included in every API response so consumers can
 * confirm which filters were applied.
 */
function buildResponseFilters(rawQuery, dateRange) {
  const applied = {};

  const keys = [
    'periodType', 'date', 'month', 'year', 'quarter',
    'startDate', 'endDate',
    'branchCode', 'syncSourceCode', 'locationCode', 'locationId',
    'userName', 'productCode', 'productName', 'payMethod', 'invoiceType',
  ];

  for (const key of keys) {
    const val = rawQuery[key];
    if (val !== undefined && val !== null && val !== '') {
      applied[key] = val;
    }
  }

  return applied;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function sanitizeStr(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (normalized === 'all') return null;
  return trimmed;
}

function parseOptionalInt(val) {
  if (val === undefined || val === null || val === '') return null;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  extractFilters,
  buildInvoiceWhere,
  buildItemWhere,
  parsePagination,
  parseSort,
  buildResponseFilters,
  ALLOWED_INVOICE_SORT_FIELDS,
  ALLOWED_PRODUCT_SORT_FIELDS,
  ALLOWED_USER_SORT_FIELDS,
  ALLOWED_PAYMENT_SORT_FIELDS,
};
