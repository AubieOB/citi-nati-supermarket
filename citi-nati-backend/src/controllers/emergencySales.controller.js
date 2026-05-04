const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { resolveEffectiveStock, enrichProductStock } = require('../utils/stockResolver');
const { notifyLowStock } = require('../utils/messageService');
const { recordPosSyncEvent } = require('../services/posSyncMonitor.service');
const { getConfiguredVatRatePercent, getVatSettings, normalizeVatRatePercent, splitInclusiveVatAtRate } = require('../utils/vat');
const { formatBusinessDateKey, formatBusinessTimeKey } = require('../utils/businessTime');
const {
  normalizeScopeCode,
  expandLocationScopeCodes: expandOperationalLocationScopeCodes,
  deriveBranchCodeFromLocationCode: deriveBranchFromOperationalLocation,
  ZOMBA_LOCATION_CODES: CORE_ZOMBA_LOCATION_CODES,
} = require('../utils/operationalScope');

const prisma = new PrismaClient();
const EMERGENCY_SALE_MAX_RETRIES = Number.parseInt(process.env.EMERGENCY_SALE_MAX_RETRIES || '10', 10);

const SYNC_STATUS = {
  PENDING: 'pending_pos_sync',
  SYNCED: 'synced_to_pos',
  FAILED: 'sync_failed',
};

const ZOMBA_LOCATION_CODES = ['ZA'].concat(CORE_ZOMBA_LOCATION_CODES);
const SUPPORTED_LOCATION_CODES = ['BT', 'ZA', 'SH', 'BAR', 'ST999', 'WH'];
const BRANCH_CODE_ALIASES = {
  ZOMBA: 'ZOMBA',
  ZA: 'ZOMBA',
  ZOMBA_SH: 'ZOMBA',
  BLANTYRE: 'BLANTYRE',
  BT: 'BLANTYRE',
  BLANTYRE_SH: 'BLANTYRE',
};
const SCOPED_PRODUCT_CODES_CACHE_TTL_MS = Number.parseInt(process.env.EMERGENCY_SCOPE_CODES_CACHE_TTL_MS || '30000', 10);
const EMERGENCY_LOOKUP_CACHE_TTL_MS = Number.parseInt(process.env.EMERGENCY_LOOKUP_CACHE_TTL_MS || '8000', 10);
const scopedProductCodesCache = new Map();
const emergencyLookupCache = new Map();

function normalizeLocationCode(value) {
  // Handle cases like "SH:1" by extracting the location code before the colon
  const cleanValue = String(value || '').trim().split(':')[0];
  return normalizeScopeCode(cleanValue);
}

function normalizeBranchCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (Object.prototype.hasOwnProperty.call(BRANCH_CODE_ALIASES, normalized)) {
    return BRANCH_CODE_ALIASES[normalized];
  }
  return normalized;
}

function isZombaLocationCode(locationCode) {
  return !!locationCode && ZOMBA_LOCATION_CODES.includes(locationCode);
}

function isConcreteZombaOperationalLocationCode(locationCode) {
  return CORE_ZOMBA_LOCATION_CODES.includes(String(locationCode || '').trim().toUpperCase());
}

function getDefaultAgentLocationCode(branchCode, requestedLocationCode) {
  if (branchCode === 'BLANTYRE') return 'BT';
  if (branchCode === 'ZOMBA') {
    const normalizedRequested = normalizeLocationCode(requestedLocationCode);
    if (normalizedRequested && CORE_ZOMBA_LOCATION_CODES.includes(normalizedRequested)) {
      return normalizedRequested;
    }
    return null;
  }
  return null;
}

function getBranchNameFromLocationCode(locationCode) {
  if (locationCode === 'BT') return 'Blantyre';
  if (isZombaLocationCode(locationCode)) return 'Zomba';
  return locationCode || 'Unknown';
}

function getBranchCodeFromLocationCode(locationCode) {
  const normalized = normalizeLocationCode(locationCode);
  if (!normalized) return null;

  return deriveBranchFromOperationalLocation(normalized);
}

function resolveSaleScopeFromSnapshot(sale) {
  const snapshot = sale?.cartSnapshot && typeof sale.cartSnapshot === 'object' ? sale.cartSnapshot : {};
  const locationCode = normalizeLocationCode(snapshot.posLocationCode || snapshot.locationCode || null);
  const branchCode = normalizeBranchCode(snapshot.branchCode || null) || getBranchCodeFromLocationCode(locationCode);
  const branchName = String(snapshot.branchName || getBranchNameFromLocationCode(locationCode) || '').trim() || null;
  return { locationCode, branchCode, branchName };
}

function expandLocationScopeCodes(locationCode) {
  return expandOperationalLocationScopeCodes(locationCode);
}

function buildLocationCodeScopeWhere(locationCodes) {
  if (!Array.isArray(locationCodes) || locationCodes.length === 0) {
    return null;
  }

  return {
    OR: locationCodes.map((code) => ({
      locationCode: {
        equals: code,
        mode: 'insensitive',
      },
    })),
  };
}

function deriveBranchCodeFromScopeCodes(scopeCodes = []) {
  for (const code of scopeCodes) {
    const branchCode = deriveBranchFromOperationalLocation(code);
    if (branchCode) return branchCode;
  }
  return null;
}

function getScopeCacheKey(locationCode) {
  const scopeCodes = expandLocationScopeCodes(locationCode);
  return scopeCodes.join('|') || String(locationCode || 'NONE');
}

function getLookupCacheKey(locationCode, branchCode, query) {
  return `${String(branchCode || '').toUpperCase()}|${String(locationCode || '').toUpperCase()}|${String(query || '').trim().toLowerCase()}`;
}

function invalidateLookupCacheForLocation(locationCode, branchCode = null, reason = 'unspecified') {
  const prefix = `${String(branchCode || '').toUpperCase()}|${String(locationCode || '').trim().toUpperCase()}|`;
  if (!prefix || prefix === '|') return;

  let deleted = 0;
  for (const key of emergencyLookupCache.keys()) {
    if (key.startsWith(prefix)) {
      emergencyLookupCache.delete(key);
      deleted += 1;
    }
  }

  if (deleted > 0) {
    console.log('[EMERGENCY SALES][LOOKUP CACHE][INVALIDATE]', {
      locationCode,
      reason,
      deletedEntries: deleted,
    });
  }
}

async function hasLocationLookupStockChangedSince(locationCode, sinceTimestampMs) {
  if (!Number.isFinite(sinceTimestampMs) || sinceTimestampMs <= 0) {
    return false;
  }

  const scopeCodes = expandLocationScopeCodes(locationCode);
  const branchCode = deriveBranchCodeFromScopeCodes(scopeCodes);
  const sinceDate = new Date(sinceTimestampMs);

  const where = {
    enabled: true,
    updatedAt: {
      gt: sinceDate,
    },
    ...(branchCode ? { branchCode } : {}),
  };

  if (branchCode === 'ZOMBA' && isConcreteZombaOperationalLocationCode(locationCode)) {
    where.locationCode = {
      equals: locationCode,
      mode: 'insensitive',
    };
  }

  const changedCount = await prisma.product.count({ where });
  return changedCount > 0;
}

async function readLookupCache(locationCode, branchCode, query) {
  const key = getLookupCacheKey(locationCode, branchCode, query);
  const entry = emergencyLookupCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.cachedAt) > EMERGENCY_LOOKUP_CACHE_TTL_MS) {
    emergencyLookupCache.delete(key);
    return null;
  }
  const changedSinceCache = await hasLocationLookupStockChangedSince(locationCode, entry.cachedAt);
  if (changedSinceCache) {
    emergencyLookupCache.delete(key);
    console.log('[EMERGENCY SALES][LOOKUP CACHE][REVALIDATE]', {
      locationCode,
      query,
      action: 'evicted_after_stock_change',
    });
    return null;
  }
  return entry.products;
}

function writeLookupCache(locationCode, branchCode, query, products) {
  const key = getLookupCacheKey(locationCode, branchCode, query);
  emergencyLookupCache.set(key, {
    cachedAt: Date.now(),
    products,
  });
}

async function resolveLocationSpecificStockBySourceCode(_db, products = [], _locationCode) {
  const resolved = new Map();

  for (const product of products || []) {
    const sourceCode = String(product?.sourceCode || '').trim();
    if (!sourceCode) continue;
    resolved.set(sourceCode, {
      stock: Number(product?.stock || 0),
      source: 'LocationSpecificPersistedProductStock',
    });
  }

  return resolved;
}

async function resolveLocationScopedProductCodesFromSales(scopeCodes = []) {
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
    return [];
  }

  // Preserve branch-level fallback only for legacy Blantyre rows.
  const derivedBranchCode = scopeCodes.includes('BT')
    ? deriveBranchCodeFromScopeCodes(scopeCodes)
    : null;
  const locationPredicates = scopeCodes.map((code) => ({
    locationCode: {
      equals: code,
      mode: 'insensitive',
    },
  }));

  const rows = await prisma.salesInvoiceItem.findMany({
    where: {
      productCode: { not: null },
      salesInvoice: {
        OR: [
          ...locationPredicates,
          ...(derivedBranchCode ? [{ branchCode: derivedBranchCode }] : []),
        ],
      },
    },
    select: { productCode: true },
    distinct: ['productCode'],
  });

  return rows
    .map((row) => String(row.productCode || '').trim())
    .filter(Boolean);
}

async function resolveLocationScopedProductCodesFromLatestCosts(scopeCodes = []) {
  if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
    return [];
  }

  // Preserve branch-level fallback only for legacy Blantyre rows.
  const derivedBranchCode = scopeCodes.includes('BT')
    ? deriveBranchCodeFromScopeCodes(scopeCodes)
    : null;
  const locationPredicates = scopeCodes.map((code) => ({
    locationCode: {
      equals: code,
      mode: 'insensitive',
    },
  }));

  const rows = await prisma.posLatestProductCost.findMany({
    where: {
      OR: [
        ...locationPredicates,
        ...(derivedBranchCode ? [{ branchCode: derivedBranchCode }] : []),
      ],
    },
    select: { productCode: true },
    distinct: ['productCode'],
  });

  return rows
    .map((row) => String(row.productCode || '').trim())
    .filter(Boolean);
}

  function buildEmergencySalesLocationScopeFilters(locationCode, requestedBranchCode = null) {
  const scopeCodes = expandLocationScopeCodes(locationCode);
  if (scopeCodes.length === 0) {
    return [];
  }

  const branchCode = requestedBranchCode || getBranchCodeFromLocationCode(locationCode);
  const includeBranchFallback = scopeCodes.includes('BT');
  const base = scopeCodes.flatMap((code) => ([
    { cartSnapshot: { path: ['locationCode'], equals: code } },
    { cartSnapshot: { path: ['posLocationCode'], equals: code } },
  ]));

  if (branchCode && includeBranchFallback) {
    base.push({ cartSnapshot: { path: ['branchCode'], equals: branchCode } });
  }

  // Preserve legacy Blantyre emergency-sale rows created before location tagging.
  if (scopeCodes.includes('BT')) {
    base.push({ cartSnapshot: { path: ['branchCode'], equals: null } });
  }

  return base;
}

async function resolveLocationScopedProductCodes(locationCode) {
  const cacheKey = getScopeCacheKey(locationCode);
  const cached = scopedProductCodesCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.cachedAt) < SCOPED_PRODUCT_CODES_CACHE_TTL_MS) {
    return cached.codes;
  }

  const scopeCodes = expandLocationScopeCodes(locationCode);
  if (scopeCodes.length === 0) return null;

  const scopedWhere = buildLocationCodeScopeWhere(scopeCodes);

  const expiryRows = await prisma.productExpiryBatch.findMany({
    where: scopedWhere || undefined,
    select: { productCode: true },
    distinct: ['productCode'],
  });

  const scopedCodes = new Set(
    expiryRows
      .map((row) => String(row.productCode || '').trim())
      .filter(Boolean)
  );

  const costCodes = await resolveLocationScopedProductCodesFromLatestCosts(scopeCodes);
  costCodes.forEach((code) => scopedCodes.add(code));

  const salesCodes = await resolveLocationScopedProductCodesFromSales(scopeCodes);
  salesCodes.forEach((code) => scopedCodes.add(code));

  const isZombaScope = scopeCodes.some((code) => CORE_ZOMBA_LOCATION_CODES.includes(code));
  if (isZombaScope) {
    console.log('[EMERGENCY SALES][SCOPE][ZOMBA] code-source diagnostics', {
      scopeCodes,
      expiryDistinctCount: expiryRows.length,
      latestCostDistinctCount: costCodes.length,
      salesDistinctCount: salesCodes.length,
      combinedDistinctCount: scopedCodes.size,
    });
  }

  if (scopedCodes.size === 0 && scopeCodes.includes('BT')) {
    const legacyRows = await prisma.product.findMany({
      where: { sourceCode: { not: null } },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });

    legacyRows
      .map((row) => String(row.sourceCode || '').trim())
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
  }

  // Zomba fallback: if no activity-table records exist yet for the requested
  // Zomba location, fall back to products stored with branchCode='ZOMBA' AND
  // the specific locationCode (SH/BAR/ST999).
  if (scopedCodes.size === 0 && isZombaScope) {
    const locationWhere = buildLocationCodeScopeWhere(scopeCodes);
    const zombaRows = await prisma.product.findMany({
      where: { 
        branchCode: 'ZOMBA', 
        sourceCode: { not: null },
        ...(locationWhere || {})
      },
      select: { sourceCode: true },
      distinct: ['sourceCode'],
    });
    zombaRows
      .map((row) => String(row.sourceCode || '').trim())
      .filter(Boolean)
      .forEach((code) => scopedCodes.add(code));
    console.log('[EMERGENCY SALES][ZOMBA_SCOPE][FALLBACK] fell back to Product table branchCode=ZOMBA + locationCodes', {
      scopeCodes,
      fallbackCodeCount: scopedCodes.size,
    });
  }

  const codes = Array.from(scopedCodes.values());
  scopedProductCodesCache.set(cacheKey, { codes, cachedAt: now });
  return codes;
}

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function toSafeInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function generateEmergencySaleRef(scopeCode = 'GEN') {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `EMR-${scopeCode}-${yyyy}${mm}${dd}-${hh}${min}${sec}-${suffix}`;
}

async function getCashierIdentity(req) {
  const cashierId = String(req.user?.userId || '').trim() || null;
  let cashierName = String(req.user?.name || '').trim();

  if (!cashierName && cashierId) {
    const user = await prisma.user.findUnique({
      where: { id: cashierId },
      select: { name: true, email: true },
    });

    if (user?.name) {
      cashierName = String(user.name).trim();
    } else if (user?.email) {
      cashierName = String(user.email).split('@')[0].trim();
    }
  }

  if (!cashierName && req.user?.email) {
    cashierName = String(req.user.email).split('@')[0].trim();
  }

  if (!cashierName) {
    cashierName = String(req.user?.userId || 'admin').trim();
  }

  return { cashierId, cashierName };
}

async function resolveCashierNamesForSales(sales) {
  const records = Array.isArray(sales) ? sales : [];
  if (records.length === 0) return records;

  const cashierIds = new Set();
  const cashierEmails = new Set();

  for (const sale of records) {
    const cashierId = String(sale.cashierId || '').trim();
    const cashierName = String(sale.cashierName || '').trim();

    if (cashierId) cashierIds.add(cashierId);
    if (cashierName.includes('@')) cashierEmails.add(cashierName.toLowerCase());
  }

  if (cashierIds.size === 0 && cashierEmails.size === 0) {
    return records;
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...(cashierIds.size > 0 ? [{ id: { in: Array.from(cashierIds) } }] : []),
        ...(cashierEmails.size > 0 ? [{ email: { in: Array.from(cashierEmails) } }] : []),
      ],
    },
    select: { id: true, name: true, email: true },
  });

  const usersById = new Map();
  const usersByEmail = new Map();

  for (const user of users) {
    if (user?.id) usersById.set(String(user.id), user);
    if (user?.email) usersByEmail.set(String(user.email).toLowerCase(), user);
  }

  return records.map((sale) => {
    const currentCashierName = String(sale.cashierName || '').trim();
    const currentCashierId = String(sale.cashierId || '').trim();

    const matchedById = currentCashierId ? usersById.get(currentCashierId) : null;
    const matchedByEmail = currentCashierName.includes('@')
      ? usersByEmail.get(currentCashierName.toLowerCase())
      : null;
    const preferredName = String(matchedById?.name || matchedByEmail?.name || '').trim();

    if (!preferredName) return sale;
    if (preferredName === currentCashierName) return sale;

    return {
      ...sale,
      cashierName: preferredName,
    };
  });
}

function computeUnitPrice(product) {
  const isOnSale = product?.isOnSale === true;
  const discountPrice = Number(product?.discountPrice);
  if (isOnSale && Number.isFinite(discountPrice) && discountPrice >= 0) {
    return discountPrice;
  }
  return Number(product?.price || 0);
}

function normalizePaymentMethod(rawMethod) {
  const method = String(rawMethod || 'CASH').trim().toUpperCase();
  if (!method) return 'CASH';
  return method.slice(0, 20);
}

function formatLocalDateKey(dateValue) {
  return formatBusinessDateKey(dateValue) || '';
}

function getSaleVatContext(sale) {
  const snapshot = sale?.cartSnapshot && typeof sale.cartSnapshot === 'object' ? sale.cartSnapshot : null;
  const snapshotEnabled = snapshot?.vat_enabled ?? snapshot?.vatEnabled;
  const vatEnabled = typeof snapshotEnabled === 'boolean' ? snapshotEnabled : true;
  const configuredRatePercent = normalizeVatRatePercent(
    snapshot?.configured_vat_rate_percent ?? snapshot?.configuredVatRatePercent ?? snapshot?.vat_rate_percent ?? snapshot?.vatRatePercent,
    getConfiguredVatRatePercent()
  );
  const appliedRatePercent = vatEnabled ? configuredRatePercent : 0;
  const snapshotVat = Number(snapshot?.vat);

  return {
    vatEnabled,
    configuredRatePercent,
    ratePercent: appliedRatePercent,
    vatAmount: Number.isFinite(snapshotVat) ? toMoney(snapshotVat) : null,
  };
}

function buildPosWriteInvoicePayload(emergencySale) {
  const saleScope = resolveSaleScopeFromSnapshot(emergencySale);
  let locationCode = normalizeLocationCode(saleScope.locationCode || process.env.POS_LOCATION_CODE || null);
  // For Blantyre emergency sales, use the same location as online orders to ensure stock consistency
  if (saleScope.branchCode === 'BLANTYRE') {
    locationCode = process.env.POS_LOCATION_CODE || 'SH';
  }
  if (!locationCode) {
    throw new Error(`Emergency sale ${emergencySale?.id || '(unknown)'} is missing location scope for POS write-back`);
  }
  const priceTypeCode = process.env.POS_PRICE_TYPE_CODE || 'RT';
  const vatContext = getSaleVatContext(emergencySale);

  const items = (emergencySale.items || []).map((item) => ({
    productCode: String(item.productCode || '').trim(),
    productName: String(item.productName || '').trim() || `PRODUCT-${item.productCode}`,
    qty: Number(item.qty),
    unitPrice: Number(item.unitPrice),
    discount: 0,
    amount: Number(item.lineTotal),
    taxRate: vatContext.ratePercent,
    taxAmount: splitInclusiveVatAtRate(Number(item.lineTotal), vatContext.ratePercent).vatAmount,
    fPrice: Number(item.unitPrice),
    locationCode,
    costPrice: 0,
    priceTypeCode,
  }));

  const subtotalAfterDiscount = Number(emergencySale.subtotal || 0) - Number(emergencySale.discount || 0);
  const invoiceTotals = splitInclusiveVatAtRate(subtotalAfterDiscount, vatContext.ratePercent);

  return {
    orderId: `EMERGENCY-${emergencySale.id}`,
    reference: emergencySale.saleRef,
    locationCode,
    customerCode: 'CASH',
    invoiceDate: formatLocalDateKey(emergencySale.createdAt || new Date()),
    invoiceTime: formatBusinessTimeKey(emergencySale.createdAt || new Date()),
    grossSale: invoiceTotals.gross,
    vat: invoiceTotals.vatAmount,
    discount: Number(emergencySale.discount || 0),
    // POS intake for emergency sales expects the VAT-inclusive sell amount.
    netSale: invoiceTotals.gross,
    payMethod1: normalizePaymentMethod(emergencySale.paymentMethod),
    tenAmt1: Number(emergencySale.tenderedAmount || invoiceTotals.gross),
    payMethod2: '',
    tenAmt2: 0,
    userName: String(emergencySale.cashierName || 'EMERGENCY').slice(0, 20),
    priceTypeCode,
    invoiceType: 'CS',
    tillId: 'WEB',
    items,
    emergencySaleId: emergencySale.id,
    saleRef: emergencySale.saleRef,
    branchCode: saleScope.branchCode,
    branchName: saleScope.branchName,
    locationScopeCode: saleScope.locationCode,
  };
}

function formatEmergencySale(sale) {
  const subtotal = Number(sale.subtotal || 0);
  const discount = Number(sale.discount || 0);
  const total = Number(sale.total || 0);
  const vatContext = getSaleVatContext(sale);
  const vat = vatContext.vatAmount ?? splitInclusiveVatAtRate(total, vatContext.ratePercent).vatAmount;
  const tenderedAmount = Number(sale.tenderedAmount || 0);
  const changeAmount = Number(sale.changeAmount || 0);
  const balanceDue = Math.max(0, Number((total - tenderedAmount).toFixed(2)));

  return {
    ...sale,
    subtotal,
    discount,
    vat,
    vatEnabled: vatContext.vatEnabled,
    vatRatePercent: vatContext.ratePercent,
    configuredVatRatePercent: vatContext.configuredRatePercent,
    total,
    tenderedAmount,
    tendered_amount: tenderedAmount,
    changeAmount,
    change_amount: changeAmount,
    balanceDue,
    balance_due: balanceDue,
    paymentMethod: sale.paymentMethod,
    payment_method: sale.paymentMethod,
    saleRef: sale.saleRef,
    sale_ref: sale.saleRef,
    cashierId: sale.cashierId,
    cashier_id: sale.cashierId,
    cashierName: sale.cashierName,
    cashier_name: sale.cashierName,
    syncStatus: sale.syncStatus,
    sync_status: sale.syncStatus,
    posInvoiceNo: sale.posInvoiceNo,
    pos_invoice_no: sale.posInvoiceNo,
    syncedAt: sale.syncedAt,
    synced_at: sale.syncedAt,
    lastSyncAttemptAt: sale.lastSyncAttemptAt,
    last_sync_attempt_at: sale.lastSyncAttemptAt,
    retryCount: sale.retryCount,
    retry_count: sale.retryCount,
    syncError: sale.syncError,
    sync_error: sale.syncError,
  };
}

function validateAgentSecret(req) {
  const provided = req.headers['x-pos-secret'];
  const expected = process.env.POS_SECRET;
  return !!provided && !!expected && provided === expected;
}

async function lookupEmergencyProducts(req, res) {
  try {
    const startedAt = Date.now();
    const query = String(req.query.q || req.query.search || '').trim();
    const locationCode = normalizeLocationCode(req.query.locationCode);
    const requestedBranchCode = normalizeBranchCode(req.query.branchCode);
    const derivedBranchCode = requestedBranchCode || getBranchCodeFromLocationCode(locationCode);
    const bypassCache = ['1', 'true', 'yes'].includes(String(req.query.forceRefresh || '').trim().toLowerCase());
    if (!query) {
      return res.status(200).json({ success: true, products: [] });
    }

    if (!locationCode || !SUPPORTED_LOCATION_CODES.includes(locationCode)) {
      return res.status(400).json({ success: false, error: 'locationCode is required and must be one of BT, SH, BAR, ST999, or WH' });
    }

    if (locationCode === 'ZA') {
      return res.status(400).json({
        success: false,
        error: 'Concrete locationCode is required for Zomba emergency lookup (use SH, BAR, or ST999)',
      });
    }

    const normalizedQuery = query.toLowerCase();
    const isLikelyCodeLookup = /^[0-9a-z-]+$/i.test(query) && query.length >= 3;
    if (!isLikelyCodeLookup && normalizedQuery.length < 2) {
      return res.status(200).json({ success: true, products: [] });
    }

    const cachedProducts = bypassCache ? null : await readLookupCache(locationCode, derivedBranchCode, query);
    if (cachedProducts) {
      console.log('[EMERGENCY SALES][LOOKUP] cache-hit', {
        selectedLocation: req.query.locationCode || req.query.branchCode || '(none)',
        resolvedStockLocation: locationCode,
        locationCode,
        query,
        stockSource: cachedProducts[0]?.stockSource || 'LocationSpecificPersistedProductStock',
        sampleProductCode: cachedProducts[0]?.sourceCode || cachedProducts[0]?.productCode || null,
        sampleStock: cachedProducts[0] ? Number(cachedProducts[0].stock || 0) : null,
        resultCount: cachedProducts.length,
        durationMs: Date.now() - startedAt,
      });
      return res.status(200).json({ success: true, products: cachedProducts });
    }

    // const derivedBranchCode = deriveBranchCodeFromScopeCodes(expandLocationScopeCodes(locationCode));// Commented for a purpose
    const isZombaScope = derivedBranchCode === 'ZOMBA';
    let scopedProductCodes = null;

    if (isZombaScope) {
      console.log('[PRODUCT QUERY]', {
        view: 'Emergency sale product search',
        uiLocation: req.query.locationCode || req.query.branchCode || '(none)',
        selectedLocation: locationCode,
        resolvedStockLocation: locationCode,
        branchCode: 'ZOMBA',
        locationCode,
        querySource: 'LocationSpecificPersistedProductStock',
      });
    } else {
      scopedProductCodes = await resolveLocationScopedProductCodes(locationCode);
      if (!scopedProductCodes || scopedProductCodes.length === 0) {
        return res.status(200).json({ success: true, products: [] });
      }
      console.log('[PRODUCT QUERY]', {
        uiLocation: req.query.locationCode || req.query.branchCode || '(none)',
        branchCode: derivedBranchCode || '(any)',
        locationCode,
      });
    }

    const baseWhere = {
      enabled: true,
      ...(derivedBranchCode ? { branchCode: derivedBranchCode } : {}),
      ...(isZombaScope
        ? {
            locationCode: { equals: locationCode, mode: 'insensitive' },
            sourceCode: { not: null },
            // Only products with a valid location-specific price row (price > 0).
            // Products synced from POS without a price row for this location get price=0.
            price: { gt: 0 },
          }
        : { sourceCode: { in: scopedProductCodes } }),
    };

    // Single combined query: exact matches (barcode/sourceCode) + contains matches (name/barcode/sourceCode).
    // Sorting via frontend ensures exact matches appear first, while contains matches still show for flexibility.
    const products = await prisma.product.findMany({
      where: {
        ...baseWhere,
        OR: [
          // Exact matches (barcode or sourceCode)
          { barcode: { equals: query, mode: 'insensitive' } },
          { sourceCode: { equals: query, mode: 'insensitive' } },
          // Contains matches (name, barcode, or sourceCode)
          { name: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
          { sourceCode: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        sourceCode: true,
        barcode: true,
        price: true,
        discountPrice: true,
        isOnSale: true,
        stock: true,
        branchCode: true,
        locationCode: true,
        overrideActive: true,
        overrideStock: true,
        lowStockThreshold: true,
      },
      take: 30,
      orderBy: [
        { name: 'asc' },
      ],
    });

    console.log('[PRODUCT RESULT COUNT]', products.length);

    const resolvedLocationStockBySourceCode = await resolveLocationSpecificStockBySourceCode(
      prisma,
      products,
      locationCode
    );

    // Log location-availability decision for each result (diagnostics).
    if (isZombaScope) {
      products.forEach((product) => {
        const masterExists = true; // already filtered to existing rows
        const locationPriceExists = Number(product.price || 0) > 0;
        console.log(
          `[LOCATION AVAILABILITY] product=${product.sourceCode || product.id} location=${locationCode}` +
          ` masterExists=${masterExists} locationPriceExists=${locationPriceExists}` +
          ` availability=${locationPriceExists}` +
          `${locationPriceExists ? '' : ' reason=NO_LOCATION_PRICE_ROW'}`
        );
      });
    }

    const mapped = products
      .map((product) => {
        const sourceCode = String(product.sourceCode || '').trim();
        const stockResolution = resolvedLocationStockBySourceCode.get(sourceCode) || {
          stock: Number(product.stock || 0),
          source: 'LocationSpecificPersistedProductStock',
        };
        const enriched = enrichProductStock({
          ...product,
          stock: Number(stockResolution.stock || 0),
          posStock: Number(stockResolution.stock || 0),
        });
        const unitPrice = computeUnitPrice(product);
        return {
          ...enriched,
          stockSource: stockResolution.source,
          productCode: enriched.sourceCode,
          product_code: enriched.sourceCode,
          unitPrice,
          unit_price: unitPrice,
        };
      })
      .sort((a, b) => {
        const aExact = String(a.barcode || '').toLowerCase() === normalizedQuery || String(a.sourceCode || '').toLowerCase() === normalizedQuery;
        const bExact = String(b.barcode || '').toLowerCase() === normalizedQuery || String(b.sourceCode || '').toLowerCase() === normalizedQuery;
        if (aExact === bExact) return String(a.name || '').localeCompare(String(b.name || ''));
        return aExact ? -1 : 1;
      });

    writeLookupCache(locationCode, derivedBranchCode, query, mapped);

    if (isZombaLocationCode(locationCode) && mapped.length > 0) {
      const sample = mapped[0];
      console.log(`[ZOMBA STOCK][EMERGENCY_LOOKUP] selectedLocation=${req.query.locationCode || req.query.branchCode || '(none)'} resolvedStockLocation=${locationCode} querySource=${sample.stockSource || 'LocationSpecificPersistedProductStock'} product=${sample.sourceCode || sample.productCode || 'UNKNOWN'} stock=${Number(sample.stock || 0)} cache=miss`);
      const verifyProduct = mapped.find((row) => String(row.sourceCode || row.productCode || '').trim() === '9501100002174');
      if (verifyProduct) {
        console.log(`[ZOMBA STOCK][VERIFY][EMERGENCY_LOOKUP] selectedLocation=${req.query.locationCode || req.query.branchCode || '(none)'} resolvedStockLocation=${locationCode} querySource=${verifyProduct.stockSource || 'LocationSpecificPersistedProductStock'} product=9501100002174 stock=${Number(verifyProduct.stock || 0)} cache=miss`);
      }
    }

    console.log('[EMERGENCY SALES][LOOKUP] performance', {
      locationCode,
      mode: isZombaScope ? 'ZOMBA_FAST_PATH' : 'SCOPED_CODES_PATH',
      query,
      resultCount: mapped.length,
      durationMs: Date.now() - startedAt,
    });

    return res.status(200).json({ success: true, products: mapped });
  } catch (error) {
    console.error('[EMERGENCY SALES] lookup failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to search products' });
  }
}

async function createEmergencySale(req, res) {
  try {
    const locationCode = normalizeLocationCode(req.body?.locationCode || req.query?.locationCode);
    const requestedBranchCode = normalizeBranchCode(req.body?.branchCode || req.query?.branchCode);
    if (!locationCode || !SUPPORTED_LOCATION_CODES.includes(locationCode)) {
      return res.status(400).json({ success: false, error: 'locationCode is required and must be one of BT, SH, BAR, ST999, WH, or ZA' });
    }

    // For ambiguous Zomba locations, require explicit branchCode
    if (locationCode === 'SH' && !requestedBranchCode) {
      return res.status(400).json({
        success: false,
        error: 'Ambiguous location code SH requires explicit branchCode parameter',
      });
    }

    const branchCode = requestedBranchCode || getBranchCodeFromLocationCode(locationCode);
    const branchName = getBranchNameFromLocationCode(locationCode);
    const posLocationCode = getDefaultAgentLocationCode(branchCode, locationCode);
    if (branchCode === 'ZOMBA' && !isConcreteZombaOperationalLocationCode(posLocationCode)) {
      return res.status(400).json({
        success: false,
        error: 'Concrete locationCode is required for Zomba emergency sale (use SH, BAR, or ST999)',
      });
    }
    // For Zomba: availability is determined directly by location+price row, not the indirect
    // scopedProductCodes set (which requires prior sales/expiry/cost history that BAR/ST999 may lack).
    const isZombaCreateScope = branchCode === 'ZOMBA' && isConcreteZombaOperationalLocationCode(posLocationCode);
    let scopedProductCodes = null;
    if (!isZombaCreateScope) {
      scopedProductCodes = await resolveLocationScopedProductCodes(locationCode);
      if (!scopedProductCodes || scopedProductCodes.length === 0) {
        return res.status(400).json({ success: false, error: `No products are available for location ${locationCode}` });
      }
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one invoice item is required' });
    }

    const quantityByProductId = new Map();

    for (const line of rawItems) {
      const productId = toSafeInt(line.product_id ?? line.productId);
      const qty = toSafeInt(line.qty ?? line.quantity);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ success: false, error: 'Each item must include a valid productId' });
      }

      if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ success: false, error: 'Each item qty must be a positive integer' });
      }

      quantityByProductId.set(productId, (quantityByProductId.get(productId) || 0) + qty);
    }

    const productIds = Array.from(quantityByProductId.keys());
    const { cashierId, cashierName } = await getCashierIdentity(req);
    const requestedDiscount = toMoney(req.body?.discount ?? req.body?.discount_amount ?? 0);
    const paymentMethod = normalizePaymentMethod(req.body?.payment_method ?? req.body?.paymentMethod ?? 'CASH');
    const vatSettings = await getVatSettings();

    const created = await prisma.$transaction(async (tx) => {
      // Build location-aware product query.
      // Zomba: validate by branchCode=ZOMBA + exact locationCode + price>0 (= location price row exists).
      // Non-Zomba: validate by scopedProductCodes derived from activity history.
      const productQueryWhere = isZombaCreateScope
        ? {
            id: { in: productIds },
            branchCode: 'ZOMBA',
            locationCode: { equals: posLocationCode, mode: 'insensitive' },
            sourceCode: { not: null },
          }
        : {
            id: { in: productIds },
            sourceCode: { in: scopedProductCodes },
            ...(branchCode ? { branchCode } : {}),
          };

      const products = await tx.product.findMany({
        where: productQueryWhere,
        select: {
          id: true,
          name: true,
          sourceCode: true,
          barcode: true,
          price: true,
          discountPrice: true,
          isOnSale: true,
          stock: true,
          overrideActive: true,
          overrideStock: true,
          lowStockThreshold: true,
        },
      });

      // Log location-availability decision for each product in the cart.
      if (isZombaCreateScope) {
        const productMap = new Map(products.map((p) => [p.id, p]));
        for (const productId of productIds) {
          const found = productMap.get(productId);
          const masterExists = !!found;
          const locationPriceExists = masterExists && Number(found.price || 0) > 0;
          console.log(
            `[LOCATION AVAILABILITY] product=${found?.sourceCode || productId} location=${posLocationCode}` +
            ` masterExists=${masterExists} locationPriceExists=${locationPriceExists}` +
            ` availability=${locationPriceExists}` +
            `${locationPriceExists ? '' : ` reason=${masterExists ? 'NO_LOCATION_PRICE_ROW' : 'NOT_FOUND'}`}`
          );
        }
      }

      if (products.length !== productIds.length) {
        // For Zomba provide a specific error distinguishing global-only products from missing ones.
        if (isZombaCreateScope) {
          const foundIds = new Set(products.map((p) => p.id));
          const missingIds = productIds.filter((id) => !foundIds.has(id));
          // Diagnose: are the missing IDs present at all for this branch?
          const globalCheck = await tx.product.findMany({
            where: { id: { in: missingIds }, branchCode: 'ZOMBA' },
            select: { id: true, name: true, locationCode: true, price: true },
          });
          const noPriceRow = globalCheck.filter((p) => Number(p.price || 0) === 0);
          const wrongLocation = globalCheck.filter((p) => Number(p.price || 0) > 0 && p.locationCode !== posLocationCode);
          if (noPriceRow.length > 0) {
            const names = noPriceRow.map((p) => p.name).join(', ');
            return Promise.reject(new Error(
              `Product(s) not configured for ${posLocationCode}: ${names}. No price row exists for this location.`
            ));
          }
          if (wrongLocation.length > 0) {
            const names = wrongLocation.map((p) => `${p.name} (${p.locationCode})`).join(', ');
            return Promise.reject(new Error(
              `Product(s) not available in ${posLocationCode}: ${names}`
            ));
          }
        }
        return Promise.reject(new Error('One or more products do not exist'));
      }

      // Enforce location price row for Zomba: reject products with price=0 even if found.
      if (isZombaCreateScope) {
        const noPriceProducts = products.filter((p) => Number(p.price || 0) === 0);
        if (noPriceProducts.length > 0) {
          const names = noPriceProducts.map((p) => p.name).join(', ');
          return Promise.reject(new Error(
            `Product(s) not configured for ${posLocationCode} (no price row): ${names}`
          ));
        }
      }

      const productsById = new Map(products.map((product) => [product.id, product]));
      const itemRows = [];
      let subtotal = 0;

      for (const [productId, qty] of quantityByProductId.entries()) {
        const product = productsById.get(productId);
        if (!product) {
          return Promise.reject(new Error(`Product ${productId} not found`));
        }

        if (!product.sourceCode) {
          return Promise.reject(new Error(`Product ${product.name} has no POS product code and cannot be synced`));
        }

        const effectiveStock = resolveEffectiveStock(product);
        if (effectiveStock < qty) {
          return Promise.reject(
            new Error(`Insufficient stock for ${product.name}. Available ${effectiveStock}, requested ${qty}`)
          );
        }

        const unitPrice = toMoney(computeUnitPrice(product));
        const lineTotal = toMoney(unitPrice * qty);
        subtotal = toMoney(subtotal + lineTotal);

        itemRows.push({
          product,
          productId,
          qty,
          unitPrice,
          lineTotal,
        });
      }

      const discount = Math.max(0, Math.min(requestedDiscount, subtotal));
      const vatTotals = splitInclusiveVatAtRate(subtotal - discount, vatSettings.ratePercent, {
        vatEnabled: vatSettings.enabled,
        configuredVatRatePercent: vatSettings.configuredRatePercent,
      });
      const total = toMoney(vatTotals.gross);
      const tenderedAmountRaw = req.body?.tendered_amount ?? req.body?.tenderedAmount;
      const tenderedAmount = tenderedAmountRaw == null || tenderedAmountRaw === '' ? total : Math.max(0, toMoney(tenderedAmountRaw));
      const changeAmount = tenderedAmount > total ? toMoney(tenderedAmount - total) : 0;

      let saleRef = generateEmergencySaleRef(locationCode);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const existing = await tx.emergencySale.findUnique({ where: { saleRef } });
        if (!existing) break;
        saleRef = generateEmergencySaleRef(locationCode);
      }

      const sale = await tx.emergencySale.create({
        data: {
          saleRef,
          cashierId,
          cashierName,
          subtotal,
          discount,
          total,
          tenderedAmount,
          changeAmount,
          paymentMethod,
          syncStatus: SYNC_STATUS.PENDING,
          cartSnapshot: {
            items: itemRows.map((line) => ({
              product_id: line.productId,
              product_code: line.product.sourceCode,
              barcode: line.product.barcode || null,
              product_name: line.product.name,
              unit_price: line.unitPrice,
              qty: line.qty,
              line_total: line.lineTotal,
            })),
            subtotal,
            discount,
            vat: vatTotals.vatAmount,
            vat_enabled: vatSettings.enabled,
            vat_rate_percent: vatSettings.configuredRatePercent,
            configured_vat_rate_percent: vatSettings.configuredRatePercent,
            total,
            tendered_amount: tenderedAmount,
            change_amount: changeAmount,
            payment_method: paymentMethod,
            locationCode: posLocationCode,
            posLocationCode,
            locationScopeCode: locationCode,
            branchCode,
            branchName,
          },
        },
      });

      await tx.emergencySaleItem.createMany({
        data: itemRows.map((line) => ({
          emergencySaleId: sale.id,
          productId: line.productId,
          productCode: line.product.sourceCode,
          barcode: line.product.barcode || null,
          productName: line.product.name,
          unitPrice: line.unitPrice,
          qty: line.qty,
          lineTotal: line.lineTotal,
        })),
      });

      const updatedProducts = [];
      for (const line of itemRows) {
        const product = line.product;
        const nextPosStock = Math.max(0, Number(product.stock || 0) - line.qty);
        const nextOverrideStock = product.overrideActive && product.overrideStock != null
          ? Math.max(0, Number(product.overrideStock || 0) - line.qty)
          : null;

        const updatedProduct = await tx.product.update({
          where: { id: line.productId },
          data: {
            stock: nextPosStock,
            ...(nextOverrideStock != null ? { overrideStock: nextOverrideStock } : {}),
          },
        });

        updatedProducts.push(updatedProduct);
      }

      const fullSale = await tx.emergencySale.findUnique({
        where: { id: sale.id },
        include: {
          items: true,
        },
      });

      return {
        sale: fullSale,
        updatedProducts,
      };
    });

    for (const product of created.updatedProducts || []) {
      try {
        await notifyLowStock(product);
      } catch (notifyErr) {
        console.warn('[EMERGENCY SALES] low stock notification failed:', notifyErr.message);
      }
    }

    const formattedSale = formatEmergencySale(created.sale);
    const posWritePayload = buildPosWriteInvoicePayload(created.sale);

    invalidateLookupCacheForLocation(locationCode, branchCode, 'emergency_sale_stock_update');

    console.log('[EMERGENCY SALES][CREATE] created sale', {
      saleRef: formattedSale.sale_ref,
      locationCode,
      posLocationCode,
      branchCode,
      itemCount: rawItems.length,
    });

    return res.status(201).json({
      success: true,
      message: 'Emergency sale recorded successfully',
      sale: formattedSale,
      receipt: {
        sale_ref: formattedSale.sale_ref,
        created_at: formattedSale.createdAt,
        cashier_name: formattedSale.cashier_name,
        sync_status: formattedSale.sync_status,
        note: 'Pending POS Sync',
        items: (formattedSale.items || []).map((item) => ({
          product_name: item.productName,
          product_code: item.productCode,
          barcode: item.barcode,
          qty: item.qty,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
        })),
        subtotal: formattedSale.subtotal,
        discount: formattedSale.discount,
        vat: formattedSale.vat,
        total: formattedSale.total,
        tendered_amount: formattedSale.tendered_amount,
        change_amount: formattedSale.change_amount,
        balance_due: formattedSale.balance_due,
        payment_method: formattedSale.payment_method,
      },
      pos_write_payload: posWritePayload,
    });
  } catch (error) {
    console.error('[EMERGENCY SALES] create failed:', error.message);
    return res.status(400).json({ success: false, error: error.message || 'Failed to create emergency sale' });
  }
}

async function listEmergencySales(req, res) {
  try {
    const reportMode = String(req.query.reportMode || '').trim().toLowerCase() === 'all';
    const page = reportMode ? 1 : Math.max(1, toSafeInt(req.query.page, 1));
    const pageSize = reportMode ? 5000 : Math.min(100, Math.max(1, toSafeInt(req.query.pageSize, 20)));
    const skip = reportMode ? 0 : (page - 1) * pageSize;
    const status = String(req.query.status || '').trim();
    const search = String(req.query.search || '').trim();
    const cashier = String(req.query.cashier || '').trim();
    const product = String(req.query.product || '').trim();
    const locationCode = normalizeLocationCode(req.query.locationCode);
    const requestedBranchCode = normalizeBranchCode(req.query.branchCode);
    const branchCode = requestedBranchCode || getBranchCodeFromLocationCode(locationCode);
    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    const requesterRole = String(req.user?.role || '').trim().toLowerCase();
    const requesterUserId = String(req.user?.userId || '').trim();

    // For ambiguous Zomba locations, require explicit branchCode
    if (locationCode === 'SH' && !requestedBranchCode) {
      return res.status(400).json({
        success: false,
        error: 'Ambiguous location code SH requires explicit branchCode parameter',
      });
    }

    const andClauses = [];

    if (status && status !== 'all') {
      andClauses.push({ syncStatus: status });
    }

    if (search) {
      andClauses.push({
        OR: [
          { saleRef: { contains: search, mode: 'insensitive' } },
          { cashierName: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (cashier) {
      andClauses.push({
        OR: [
          { cashierName: { contains: cashier, mode: 'insensitive' } },
          { cashierId: { contains: cashier, mode: 'insensitive' } },
        ],
      });
    }

    // Cashier role must only see their own emergency sales, regardless of query filters.
    if (requesterRole === 'cashier' && requesterUserId) {
      andClauses.push({ cashierId: requesterUserId });
    }

    const createdAt = {};
    if (startDate) {
      const parsedStartDate = new Date(startDate);
      if (Number.isFinite(parsedStartDate.getTime())) {
        parsedStartDate.setHours(0, 0, 0, 0);
        createdAt.gte = parsedStartDate;
      }
    }
    if (endDate) {
      const parsedEndDate = new Date(endDate);
      if (Number.isFinite(parsedEndDate.getTime())) {
        parsedEndDate.setHours(23, 59, 59, 999);
        createdAt.lte = parsedEndDate;
      }
    }
    if (Object.keys(createdAt).length > 0) {
      andClauses.push({ createdAt });
    }

    if (product) {
      const productId = toSafeInt(product);
      andClauses.push({
        items: {
          some: {
            OR: [
              { productName: { contains: product, mode: 'insensitive' } },
              { productCode: { contains: product, mode: 'insensitive' } },
              { barcode: { contains: product, mode: 'insensitive' } },
              ...(productId ? [{ productId }] : []),
            ],
          },
        },
      });
    }

    if (locationCode) {
      const locationScopeFilters = buildEmergencySalesLocationScopeFilters(locationCode, requestedBranchCode || branchCode);
      if (locationScopeFilters.length > 0) {
        andClauses.push({ OR: locationScopeFilters });
      }
    } else if (branchCode) {
      andClauses.push({ cartSnapshot: { path: ['branchCode'], equals: branchCode } });
    }

    const where = andClauses.length > 0 ? { AND: andClauses } : {};

    const [total, sales] = await Promise.all([
      prisma.emergencySale.count({ where }),
      prisma.emergencySale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          items: true,
        },
      }),
    ]);

    const salesWithResolvedCashierNames = await resolveCashierNamesForSales(sales);

    const summaryGroup = await prisma.emergencySale.groupBy({
      where,
      by: ['syncStatus'],
      _count: { _all: true },
    });

    const summary = {
      pending_pos_sync: 0,
      synced_to_pos: 0,
      sync_failed: 0,
    };
    for (const row of summaryGroup) {
      summary[row.syncStatus] = row._count._all;
    }

    return res.status(200).json({
      success: true,
      sales: salesWithResolvedCashierNames.map((sale) => formatEmergencySale(sale)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      summary,
    });
  } catch (error) {
    console.error('[EMERGENCY SALES] list failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch emergency sales' });
  }
}

async function getEmergencySaleById(req, res) {
  try {
    const id = toSafeInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid emergency sale id' });
    }

    const sale = await prisma.emergencySale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Emergency sale not found' });
    }

    const [resolvedSale] = await resolveCashierNamesForSales([sale]);
    return res.status(200).json({ success: true, sale: formatEmergencySale(resolvedSale || sale) });
  } catch (error) {
    console.error('[EMERGENCY SALES] get by id failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch emergency sale' });
  }
}

async function retryEmergencySaleSync(req, res) {
  try {
    const id = toSafeInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid emergency sale id' });
    }

    const sale = await prisma.emergencySale.findUnique({ where: { id } });
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Emergency sale not found' });
    }

    if (sale.syncStatus === SYNC_STATUS.SYNCED) {
      return res.status(400).json({ success: false, error: 'Sale is already synced to POS' });
    }

    const updated = await prisma.emergencySale.update({
      where: { id },
      data: {
        syncStatus: SYNC_STATUS.PENDING,
        syncError: null,
      },
      include: { items: true },
    });

    return res.status(200).json({ success: true, sale: formatEmergencySale(updated) });
  } catch (error) {
    console.error('[EMERGENCY SALES] retry failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to retry emergency sale sync' });
  }
}

async function getPendingEmergencySalesForPosSync(req, res) {
  try {
    const branchCode = normalizeBranchCode(req.headers['x-branch-code'] || req.query.branchCode || req.query.locationCode || req.body?.branchCode || req.body?.locationCode);
    
    // For Zomba branch, support multiple sub-locations (SH, BAR, WH)
    // For other branches, use the single location code
    let locationCodes = [];
    
    if (branchCode === 'ZOMBA') {
      // Zomba supports multiple sub-locations; if explicit location provided, use it; otherwise fetch all
      const explicitLocation = normalizeLocationCode(req.query.locationCode || req.body?.locationCode);
      if (explicitLocation && SUPPORTED_LOCATION_CODES.includes(explicitLocation)) {
        locationCodes = [explicitLocation];
      } else {
        // Fetch emergency sales from all canonical Zomba location scopes that can appear in payload snapshots.
        locationCodes = ['ZA', 'SH', 'BAR', 'ST999', 'WH'];
      }
    } else if (branchCode === 'BLANTYRE') {
      locationCodes = ['BT'];
    } else {
      const locationCode = normalizeLocationCode(req.query.locationCode || req.body?.locationCode);
      if (!locationCode || !SUPPORTED_LOCATION_CODES.includes(locationCode)) {
        return res.status(400).json({ success: false, error: 'Agent branch/location scope is required for pending emergency sales polling' });
      }
      locationCodes = [locationCode];
    }

    if (locationCodes.length === 0) {
      return res.status(400).json({ success: false, error: 'Unable to determine valid location codes for branch' });
    }

    const limit = Math.min(50, Math.max(1, toSafeInt(req.query.limit ?? req.body?.limit, 10)));
    const locationScopeFilter = locationCodes.flatMap((locationCode) => ([
      { cartSnapshot: { path: ['locationCode'], equals: locationCode } },
      { cartSnapshot: { path: ['posLocationCode'], equals: locationCode } },
      // Legacy rows may only store the admin-facing location scope code.
      { cartSnapshot: { path: ['locationScopeCode'], equals: locationCode } },
    ]));
    const branchScopeFilters = [];
    if (branchCode === 'BLANTYRE') {
      branchScopeFilters.push({ cartSnapshot: { path: ['branchCode'], equals: 'BLANTYRE' } });
      branchScopeFilters.push({ cartSnapshot: { path: ['branchCode'], equals: null } });
    } else if (branchCode === 'ZOMBA') {
      // Backward compatibility: older rows can have missing/null branchCode or ZA-like scope tagging.
      branchScopeFilters.push({ cartSnapshot: { path: ['branchCode'], equals: 'ZOMBA' } });
      branchScopeFilters.push({ cartSnapshot: { path: ['branchCode'], equals: 'ZA' } });
      branchScopeFilters.push({ cartSnapshot: { path: ['branchCode'], equals: null } });
    }

    const sales = await prisma.emergencySale.findMany({
      where: {
        syncStatus: {
          in: [SYNC_STATUS.PENDING, SYNC_STATUS.FAILED],
        },
        retryCount: {
          lt: Number.isFinite(EMERGENCY_SALE_MAX_RETRIES) ? EMERGENCY_SALE_MAX_RETRIES : 10,
        },
        OR: locationScopeFilter,
        ...(branchScopeFilters.length > 0 ? { AND: [{ OR: branchScopeFilters }] } : {}),
      },
      include: {
        items: true,
      },
      orderBy: [
        { retryCount: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });

    const now = new Date();
    if (sales.length > 0) {
      await prisma.emergencySale.updateMany({
        where: { id: { in: sales.map((sale) => sale.id) } },
        data: { lastSyncAttemptAt: now },
      });
    }

    console.log('[EMERGENCY SALES][POLL] scope', {
      agentBranchCode: branchCode,
      locationCodes,
      claimedCount: sales.length,
    });

    return res.status(200).json({
      success: true,
      sales: sales.map((sale) => ({
        emergency_sale_id: sale.id,
        sale_ref: sale.saleRef,
        sync_status: sale.syncStatus,
        retry_count: sale.retryCount,
        created_at: sale.createdAt,
        payload: buildPosWriteInvoicePayload(sale),
      })),
    });
  } catch (error) {
    console.error('[EMERGENCY SALES] pending sync fetch failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch pending emergency sales' });
  }
}

async function ackEmergencySaleSynced(req, res) {
  try {
    const agentBranchCode = normalizeBranchCode(req.headers['x-branch-code'] || req.body?.branchCode || req.body?.locationCode);
    const explicitAgentLocationCode = normalizeLocationCode(req.body?.locationCode);

    const saleRef = String(req.body?.sale_ref || req.body?.saleRef || '').trim();
    const emergencySaleId = toSafeInt(req.body?.emergency_sale_id ?? req.body?.emergencySaleId);
    const posInvoiceNo = req.body?.pos_invoice_no ?? req.body?.posInvoiceNo;

    if (!saleRef && !emergencySaleId) {
      return res.status(400).json({ success: false, error: 'sale_ref or emergency_sale_id is required' });
    }

    const sale = await prisma.emergencySale.findFirst({
      where: saleRef ? { saleRef } : { id: emergencySaleId },
    });

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Emergency sale not found' });
    }

    const saleScope = resolveSaleScopeFromSnapshot(sale);
    if (agentBranchCode && saleScope.branchCode && saleScope.branchCode !== agentBranchCode) {
      return res.status(403).json({ success: false, error: 'Emergency sale does not belong to this branch scope' });
    }

    if (explicitAgentLocationCode && saleScope.locationCode && saleScope.locationCode !== explicitAgentLocationCode) {
      return res.status(403).json({ success: false, error: 'Emergency sale does not belong to this location scope' });
    }

    if (sale.syncStatus === SYNC_STATUS.SYNCED) {
      return res.status(200).json({ success: true, sale_ref: sale.saleRef, already_synced: true });
    }

    const updated = await prisma.emergencySale.update({
      where: { id: sale.id },
      data: {
        syncStatus: SYNC_STATUS.SYNCED,
        posInvoiceNo: posInvoiceNo != null ? String(posInvoiceNo) : sale.posInvoiceNo,
        syncedAt: new Date(),
        syncError: null,
      },
    });

    await recordPosSyncEvent({
      eventType: 'emergency-sale-synced',
      source: 'pos-sync-agent',
      status: 'success',
      level: 'info',
      title: 'Emergency sale synced to POS',
      message: `Emergency sale ${updated.saleRef} was acknowledged as synced to POS.`,
      suggestion: 'No action required unless the POS invoice number is missing or inconsistent.',
      entityType: 'EmergencySale',
      entityId: String(updated.id),
      metadata: {
        saleRef: updated.saleRef,
        posInvoiceNo: updated.posInvoiceNo,
        locationCode: saleScope.locationCode,
        branchCode: saleScope.branchCode,
      },
    });

    return res.status(200).json({
      success: true,
      sale_ref: updated.saleRef,
      sync_status: updated.syncStatus,
      pos_invoice_no: updated.posInvoiceNo,
    });
  } catch (error) {
    console.error('[EMERGENCY SALES] ack synced failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to acknowledge synced emergency sale' });
  }
}

async function ackEmergencySaleSyncFailed(req, res) {
  try {
    const agentBranchCode = normalizeBranchCode(req.headers['x-branch-code'] || req.body?.branchCode || req.body?.locationCode);
    const explicitAgentLocationCode = normalizeLocationCode(req.body?.locationCode);

    const saleRef = String(req.body?.sale_ref || req.body?.saleRef || '').trim();
    const emergencySaleId = toSafeInt(req.body?.emergency_sale_id ?? req.body?.emergencySaleId);
    const syncError = String(req.body?.sync_error || req.body?.error || req.body?.errorMessage || 'Unknown POS sync error').slice(0, 1000);

    if (!saleRef && !emergencySaleId) {
      return res.status(400).json({ success: false, error: 'sale_ref or emergency_sale_id is required' });
    }

    const sale = await prisma.emergencySale.findFirst({
      where: saleRef ? { saleRef } : { id: emergencySaleId },
    });

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Emergency sale not found' });
    }

    const saleScope = resolveSaleScopeFromSnapshot(sale);
    if (agentBranchCode && saleScope.branchCode && saleScope.branchCode !== agentBranchCode) {
      return res.status(403).json({ success: false, error: 'Emergency sale does not belong to this branch scope' });
    }

    if (explicitAgentLocationCode && saleScope.locationCode && saleScope.locationCode !== explicitAgentLocationCode) {
      return res.status(403).json({ success: false, error: 'Emergency sale does not belong to this location scope' });
    }

    if (sale.syncStatus === SYNC_STATUS.SYNCED) {
      return res.status(200).json({ success: true, sale_ref: sale.saleRef, already_synced: true });
    }

    const updated = await prisma.emergencySale.update({
      where: { id: sale.id },
      data: {
        syncStatus: SYNC_STATUS.FAILED,
        retryCount: { increment: 1 },
        syncError,
        lastSyncAttemptAt: new Date(),
      },
    });

    await recordPosSyncEvent({
      eventType: 'emergency-sale-sync-failed',
      source: 'pos-sync-agent',
      status: 'failed',
      level: 'error',
      title: 'Emergency sale failed to sync to POS',
      message: `Emergency sale ${updated.saleRef} failed to sync to POS.`,
      reason: syncError,
      suggestion: 'Inspect the invoice payload and the agent-side invoice write path, then retry after the root cause is fixed.',
      entityType: 'EmergencySale',
      entityId: String(updated.id),
      metadata: {
        saleRef: updated.saleRef,
        retryCount: updated.retryCount,
        locationCode: saleScope.locationCode,
        branchCode: saleScope.branchCode,
      },
    });

    return res.status(200).json({
      success: true,
      sale_ref: updated.saleRef,
      sync_status: updated.syncStatus,
      retry_count: updated.retryCount,
    });
  } catch (error) {
    console.error('[EMERGENCY SALES] ack failed failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to acknowledge failed emergency sale sync' });
  }
}

module.exports = {
  lookupEmergencyProducts,
  createEmergencySale,
  listEmergencySales,
  getEmergencySaleById,
  retryEmergencySaleSync,
  getPendingEmergencySalesForPosSync,
  ackEmergencySaleSynced,
  ackEmergencySaleSyncFailed,
  SYNC_STATUS,
};
