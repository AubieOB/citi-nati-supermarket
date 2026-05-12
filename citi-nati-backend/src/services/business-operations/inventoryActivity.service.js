'use strict';

const { PrismaClient } = require('@prisma/client');
const { resolveEffectiveStock } = require('../../utils/stockResolver');

const prisma = new PrismaClient();

function toNum(value, decimals = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function roundMoney(value) {
  return toNum(value, 2);
}

function normalize(value) {
  return String(value || '').trim();
}

function normalizeUpper(value) {
  return normalize(value).toUpperCase();
}

/**
 * Build period from filter parameters using Africa/Blantyre local time (UTC+2)
 */
function buildPeriod(filters = {}) {
  const TZ_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Blantyre UTC+2
  const now = new Date();
  let startDate, endDate;

  const buildBounds = (year, month, day) => ({
    startDate: new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - TZ_OFFSET_MS),
    endDate: new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - TZ_OFFSET_MS),
  });

  switch (filters.periodType) {
    case 'day': {
      const d = filters.date ? new Date(filters.date) : now;
      const dayYear = d.getUTCFullYear();
      const dayMonth = d.getUTCMonth();
      const dayDay = d.getUTCDate();
      ({ startDate, endDate } = buildBounds(dayYear, dayMonth, dayDay));
      break;
    }
    case 'month': {
      const month = parseInt(filters.month || (now.getUTCMonth() + 1), 10);
      const year = parseInt(filters.year || now.getUTCFullYear(), 10);
      startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - TZ_OFFSET_MS);
      endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999) - TZ_OFFSET_MS);
      break;
    }
    case 'year': {
      const yr = parseInt(filters.year || now.getUTCFullYear(), 10);
      startDate = new Date(Date.UTC(yr, 0, 1, 0, 0, 0, 0) - TZ_OFFSET_MS);
      endDate = new Date(Date.UTC(yr, 11, 31, 23, 59, 59, 999) - TZ_OFFSET_MS);
      break;
    }
    case 'custom': {
      const start = filters.startDate ? new Date(filters.startDate) : now;
      const end = filters.endDate ? new Date(filters.endDate) : now;
      ({ startDate } = buildBounds(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
      ({ endDate } = buildBounds(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
      break;
    }
    default: {
      const localNow = new Date(now.getTime() + TZ_OFFSET_MS);
      ({ startDate, endDate } = buildBounds(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()));
      break;
    }
  }

  return { startDate, endDate };
}

/**
 * Build location filter
 */
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
  
  return locationFilter;
}

/**
 * Get sales movements for a period and location
 */
async function getSaleMovements(period, filters = {}) {
  const normalizedProductCode = normalize(filters.productCode);
  const normalizedProductName = normalize(filters.productName);

  const productFilter = normalizedProductCode || normalizedProductName ? {
    OR: [
      normalizedProductCode ? { productCode: { equals: normalizedProductCode, mode: 'insensitive' } } : null,
      normalizedProductName ? { productName: { contains: normalizedProductName, mode: 'insensitive' } } : null,
    ].filter(Boolean)
  } : {};

  // Build salesInvoice filter with location scoping
  const salesInvoiceFilter = {
    OR: [
      { invoiceDate: { gte: period.startDate, lte: period.endDate } },
      { invoiceTime: { gte: period.startDate, lte: period.endDate } },
    ],
  };
  if (filters.locationId) {
    salesInvoiceFilter.locationId = Number(filters.locationId);
  }
  if (filters.locationCode) {
    salesInvoiceFilter.locationCode = normalizeUpper(filters.locationCode);
  }
  if (filters.branchCode) {
    salesInvoiceFilter.branchCode = normalizeUpper(filters.branchCode);
  }
  if (filters.branchCode) {
    salesInvoiceFilter.branchCode = normalizeUpper(filters.branchCode);
  }

  const where = {
    ...productFilter,
    salesInvoice: salesInvoiceFilter,
  };

  const rows = await prisma.salesInvoiceItem.findMany({
    where,
    select: {
      id: true,
      productCode: true,
      productName: true,
      qty: true,
      unitPrice: true,
      amount: true,
      locationCode: true,
      createdAt: true,
      salesInvoice: {
        select: {
          invoiceDate: true,
          invoiceTime: true,
          sourceInvoiceNo: true,
          refNo: true,
          userName: true,
          locationCode: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });

  return rows.map((row) => ({
    movementDate: row.salesInvoice?.invoiceTime || row.salesInvoice?.invoiceDate || row.createdAt,
    movementType: 'SALE',
    referenceNo: row.salesInvoice?.refNo || String(row.salesInvoice?.sourceInvoiceNo || ''),
    cashierName: row.salesInvoice?.userName || null,
    productCode: row.productCode,
    productName: row.productName,
    qtyIn: 0,
    qtyOut: toNum(row.qty),
    runningBalance: null,
    unitPrice: roundMoney(row.unitPrice),
    lineAmount: roundMoney(row.amount),
    locationCode: row.salesInvoice?.locationCode || row.locationCode || null,
  }));
}

/**
 * Get intake movements for a period and location
 */
async function getIntakeMovements(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const normalizedProductCode = normalize(filters.productCode);
  const normalizedProductName = normalize(filters.productName);

  const productFilter = normalizedProductCode || normalizedProductName ? {
    OR: [
      normalizedProductCode ? { product: { sourceCode: { equals: normalizedProductCode, mode: 'insensitive' } } } : null,
      normalizedProductName ? { productName: { contains: normalizedProductName, mode: 'insensitive' } } : null,
    ].filter(Boolean)
  } : {};

  const where = {
    ...productFilter,
    goodsIntake: {
      ...locationFilter,
      status: { not: 'draft' },
      finalizedAt: { gte: period.startDate, lte: period.endDate },
    },
  };

  const rows = await prisma.goodsIntakeItem.findMany({
    where,
    select: {
      id: true,
      productName: true,
      quantity: true,
      unitCost: true,
      totalCost: true,
      createdAt: true,
      product: {
        select: { sourceCode: true },
      },
      goodsIntake: {
        select: {
          intakeRef: true,
          finalizedAt: true,
          enteredBy: true,
          locationCode: true,
          locationId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });

  return rows.map((row) => ({
    movementDate: row.goodsIntake?.finalizedAt || row.createdAt,
    movementType: 'STOCK_INTAKE',
    referenceNo: row.goodsIntake?.intakeRef || null,
    cashierName: row.goodsIntake?.enteredBy || null,
    productCode: row.product?.sourceCode || null,
    productName: row.productName,
    qtyIn: toNum(row.quantity),
    qtyOut: 0,
    runningBalance: null,
    unitPrice: roundMoney(row.unitCost),
    lineAmount: roundMoney(row.totalCost),
    locationCode: row.goodsIntake?.locationCode || null,
  }));
}

/**
 * Get emergency sales movements for a period and location
 */
async function getEmergencySalesMovements(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const normalizedProductCode = normalize(filters.productCode);
  const normalizedProductName = normalize(filters.productName);

  const searchTerm = normalizedProductCode || normalizedProductName;
  const productFilter = searchTerm ? {
    productName: { contains: searchTerm, mode: 'insensitive' }
  } : {};

  const where = {
    ...productFilter,
    ...locationFilter,
    status: { in: ['approved', 'completed'] },
    createdAt: { gte: period.startDate, lte: period.endDate },
  };

  const rows = await prisma.emergencySale?.findMany?.({
    where,
    select: {
      id: true,
      productName: true,
      quantity: true,
      unitPrice: true,
      totalAmount: true,
      approvedBy: true,
      approvalDate: true,
      locationCode: true,
      createdAt: true,
      referenceNo: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  }) || [];

  return rows.map((row) => ({
    movementDate: row.approvalDate || row.createdAt,
    movementType: 'EMERGENCY_SALE',
    referenceNo: row.referenceNo || null,
    cashierName: row.approvedBy || 'Emergency',
    productCode: null,
    productName: row.productName,
    qtyIn: 0,
    qtyOut: toNum(row.quantity),
    runningBalance: null,
    unitPrice: roundMoney(row.unitPrice),
    lineAmount: roundMoney(row.totalAmount),
    locationCode: row.locationCode || null,
  }));
}

/**
 * Get stock adjustment movements for a period and location
 * Note: Stock adjustments are handled through POS sync and stored in external tables
 */
async function getAdjustmentMovements(period, filters = {}) {
  // Stock adjustments are not stored in Prisma database
  // They are handled through POS sync agents in external tables
  return [];
}

/**
 * Get opening stock balance for a product at period start
 * Formula: currentSyncedStock + (qtyOut after period - qtyIn after period)
 * This represents the stock that existed at the START of the period
 */
async function getOpeningBalance(productCode, productName, locationCode, periodStartDate, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const normalizedProductCode = normalize(productCode);
  const normalizedBranchCode = locationFilter.branchCode ? normalizeUpper(locationFilter.branchCode) : null;
  const normalizedLocationCode = locationFilter.locationCode ? normalizeUpper(locationFilter.locationCode) : null;

  console.log('[OPENING_BALANCE_DEBUG] Input:', {
    productCode: normalizedProductCode,
    productName,
    branchCode: normalizedBranchCode,
    locationCode: normalizedLocationCode,
    locationId: filters.locationId || null,
    periodStartDate: periodStartDate.toISOString(),
  });

  if (!normalizedProductCode) {
    console.warn('[OPENING BALANCE] Missing productCode - cannot compute exact opening balance', {
      productName,
      branchCode: normalizedBranchCode,
      locationCode: normalizedLocationCode,
    });
    return 0;
  }

  if (!normalizedBranchCode || !normalizedLocationCode) {
    console.warn('[OPENING BALANCE] branchCode+locationCode required for exact stock lookup', {
      productCode: normalizedProductCode,
      branchCode: normalizedBranchCode,
      locationCode: normalizedLocationCode,
    });
    return 0;
  }

  try {
    // 1. Get current synced POS stock from the same Product table used by Products / Emergency Sales
    const currentSyncedStock = await resolveExactPersistedProduct(
      normalizedProductCode,
      normalizedBranchCode,
      normalizedLocationCode,
      productName
    );

    const latestStockBalance = currentSyncedStock ? toNum(resolveEffectiveStock(currentSyncedStock)) : null;
    const stockSource = currentSyncedStock ? 'PersistedProduct.stock' : 'PersistedProduct.not_found';

    console.log('[OPENING_BALANCE_DEBUG] Exact stock query:', {
      productCode: normalizedProductCode,
      branchCode: normalizedBranchCode,
      locationCode: normalizedLocationCode,
      found: !!currentSyncedStock,
      latestStockBalance,
      stockSource,
    });

    // 2. Get all transactions AFTER the period start (to calculate what's happened since period began)
    const [salesAfter, intakeAfter] = await Promise.all([
      prisma.salesInvoiceItem.findMany({
        where: {
          productCode: { equals: normalizedProductCode, mode: 'insensitive' },
          salesInvoice: {
            ...locationFilter,
            invoiceDate: { gte: periodStartDate },
          },
        },
        select: { qty: true },
      }),
      prisma.goodsIntakeItem.findMany({
        where: {
          product: { sourceCode: { equals: normalizedProductCode, mode: 'insensitive' } },
          goodsIntake: {
            ...locationFilter,
            status: { not: 'draft' },
            finalizedAt: { gte: periodStartDate },
          },
        },
        select: { quantity: true },
      }),
    ]);

    const totalQtyOutInSelectedPeriod = salesAfter.reduce((sum, row) => sum + toNum(row.qty), 0);
    const totalQtyInInSelectedPeriod = intakeAfter.reduce((sum, row) => sum + toNum(row.quantity), 0);

    const openingBal = latestStockBalance != null
      ? toNum(latestStockBalance + totalQtyOutInSelectedPeriod - totalQtyInInSelectedPeriod)
      : 0;

    console.log('[OPENING BALANCE] Product:', {
      productCode: normalizedProductCode,
      productName,
      branchCode: normalizedBranchCode,
      locationCode: normalizedLocationCode,
    }, 'PeriodStart:', periodStartDate.toISOString(), 'Calculation:', {
      latestStockBalance,
      totalQtyOutInSelectedPeriod,
      totalQtyInInSelectedPeriod,
      openingBalance: openingBal,
      stockSource,
    });

    return openingBal;
  } catch (err) {
    console.error('[OPENING BALANCE] Error:', err);
    return 0;
  }
}

/**
 * Get product summary for the period and location
 */
async function getProductSummary(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);

  const [salesItems, intakeItems] = await Promise.all([
    prisma.salesInvoiceItem.findMany({
      where: {
        salesInvoice: {
          ...locationFilter,
          invoiceDate: { gte: period.startDate, lte: period.endDate },
        },
      },
      select: {
        productCode: true,
        productName: true,
        qty: true,
        amount: true,
      },
      take: 5000,
    }),
    prisma.goodsIntakeItem.findMany({
      where: {
        goodsIntake: {
          ...locationFilter,
          status: { not: 'draft' },
          finalizedAt: { gte: period.startDate, lte: period.endDate },
        },
      },
      select: {
        productName: true,
        quantity: true,
        totalCost: true,
        product: { select: { sourceCode: true } },
      },
      take: 5000,
    }),
  ]);

  const map = new Map();

  // Aggregate sales
  for (const row of salesItems) {
    const key = normalizeUpper(row.productCode || row.productName);
    const existing = map.get(key) || {
      productCode: row.productCode,
      productName: row.productName,
      totalQtyIn: 0,
      totalQtyOut: 0,
      totalSalesAmount: 0,
      movementCount: 0,
    };
    existing.totalQtyOut += toNum(row.qty);
    existing.totalSalesAmount += roundMoney(row.amount);
    existing.movementCount += 1;
    map.set(key, existing);
  }

  // Aggregate intakes
  for (const row of intakeItems) {
    const key = normalizeUpper(row.product?.sourceCode || row.productName);
    const existing = map.get(key) || {
      productCode: row.product?.sourceCode || null,
      productName: row.productName,
      totalQtyIn: 0,
      totalQtyOut: 0,
      totalSalesAmount: 0,
      movementCount: 0,
    };
    existing.totalQtyIn += toNum(row.quantity);
    existing.movementCount += 1;
    map.set(key, existing);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      totalQtyIn: toNum(row.totalQtyIn),
      totalQtyOut: toNum(row.totalQtyOut),
      netMovement: toNum(row.totalQtyIn - row.totalQtyOut),
    }))
    .sort((a, b) => b.movementCount - a.movementCount)
    .slice(0, 100);
}

/**
 * Get current product stock for a location
 */
async function resolveExactPersistedProduct(productCode, branchCode, locationCode, productName = null) {
  if ((!productCode && !productName) || !branchCode || !locationCode) {
    return null;
  }

  const normalizedProductCode = normalize(productCode);
  const normalizedProductName = normalize(productName);
  const normalizedBranchCode = normalizeUpper(branchCode);
  const normalizedLocationCode = normalizeUpper(locationCode);

  const select = {
    id: true,
    stock: true,
    overrideActive: true,
    overrideStock: true,
    sourceCode: true,
    barcode: true,
    name: true,
    branchCode: true,
    locationCode: true,
  };

  // 1. Exact lookup by sourceCode/barcode
  if (normalizedProductCode) {
    const byCode = await prisma.product.findFirst({
      where: {
        branchCode: normalizedBranchCode,
        locationCode: normalizedLocationCode,
        OR: [
          {
            sourceCode: {
              equals: normalizedProductCode,
              mode: 'insensitive',
            },
          },
          {
            barcode: {
              equals: normalizedProductCode,
              mode: 'insensitive',
            },
          },
        ],
      },
      select,
    });

    if (byCode) {
      return byCode;
    }
  }

  // 2. Fallback exact product name lookup
  if (normalizedProductName) {
    const byName = await prisma.product.findFirst({
      where: {
        branchCode: normalizedBranchCode,
        locationCode: normalizedLocationCode,
        name: {
          equals: normalizedProductName,
          mode: 'insensitive',
        },
      },
      select,
    });

    if (byName) {
      return byName;
    }
  }

  return null;
}
async function getCurrentProductStock(productCode, locationCode, branchCode, locationId) {
  const product = await resolveExactPersistedProduct(productCode, branchCode, locationCode);
  return product ? toNum(resolveEffectiveStock(product)) : null;
}

/**
 * Main function to get inventory activity data
 */
async function getInventoryActivityLedgerData({ period: periodParams, filters = {} }) {
  try {
    console.log('[INVENTORY_LEDGER_SERVICE] Active implementation loaded');
    const period = buildPeriod(filters);
    const hasProductFilter = Boolean(normalize(filters.productCode) || normalize(filters.productName));
    const isAllLocations = !filters.locationId && !filters.locationCode;

    // Determine if the queried period is today (ongoing)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodStartDay = new Date(period.startDate.getFullYear(), period.startDate.getMonth(), period.startDate.getDate());
    const isPeriodToday = periodStartDay.getTime() === today.getTime();

    console.log('[INVENTORY LEDGER] Period is today:', isPeriodToday, 'startDate:', period.startDate.toISOString(), 'today:', today.toISOString());
    console.log('[INVENTORY LEDGER] Product filter:', { hasProductFilter, productCode: filters.productCode, productName: filters.productName });
    console.log('[INVENTORY LEDGER] Location filter:', {
      isAllLocations,
      branchCode: filters.branchCode,
      locationCode: filters.locationCode,
      locationId: filters.locationId,
    });

    if ((filters.locationId || filters.branchCode || filters.locationCode) && (!filters.branchCode || !filters.locationCode)) {
      console.warn('[INVENTORY LEDGER] Incomplete canonical location scope. Exact opening balance requires branchCode + locationCode.', {
        branchCode: filters.branchCode,
        locationCode: filters.locationCode,
        locationId: filters.locationId,
      });
    }

    // Get all movement types in parallel
    const [saleMovements, intakeMovements, emergencySalesMovements, adjustmentMovements] = await Promise.all([
      getSaleMovements(period, filters),
      getIntakeMovements(period, filters),
      getEmergencySalesMovements(period, filters).catch(() => []),
      getAdjustmentMovements(period, filters),
    ]);

    console.log('[INVENTORY LEDGER] Movements fetched:', { sales: saleMovements.length, intakes: intakeMovements.length, emergencySales: emergencySalesMovements.length, adjustments: adjustmentMovements.length });

    // Combine and sort movements chronologically
    let allMovements = [...saleMovements, ...intakeMovements, ...emergencySalesMovements, ...adjustmentMovements]
      .filter((row) => {
        if (!filters.movementType) return true;
        return row.movementType === normalizeUpper(filters.movementType);
      })
      .sort((a, b) => new Date(b.movementDate).getTime() - new Date(a.movementDate).getTime());

    // Get unique product keys from movements (use productCode if present, else normalized productName)
    const productKeyLookup = new Map();
    allMovements.forEach((movement) => {
      const key = movement.productCode || normalizeUpper(movement.productName || '');
      if (!key) return;
      if (!productKeyLookup.has(key)) {
        productKeyLookup.set(key, {
          productCode: movement.productCode || null,
          productName: movement.productName || null,
        });
      }
    });

    const uniqueProductKeys = Array.from(productKeyLookup.keys());

    // Calculate opening balances for each product key
    const productOpeningBalances = {};
    const productClosingBalances = {};
    const productCurrentBalances = {};
    const productDiagnostics = new Map();

    console.log('[INVENTORY LEDGER] Processing opening balances for', uniqueProductKeys.length, 'unique products');

    let diagnosticCounter = 0;

    for (const productKey of uniqueProductKeys) {
      const { productCode, productName } = productKeyLookup.get(productKey) || {};
      const openingBal = await getOpeningBalance(
        productCode,
        productName,
        filters.locationCode || null,
        period.startDate,
        filters
      );
      productOpeningBalances[productKey] = toNum(openingBal);
      productCurrentBalances[productKey] = toNum(openingBal);

      console.log('[INVENTORY LEDGER] Opening balance set for', { productCode, productName }, 'value:', openingBal);

      if (diagnosticCounter < 10) {
        let currentStock = null;
        let stockSource = 'PersistedProduct.not_found';

        if (productCode && filters.branchCode && filters.locationCode) {
          const currentProduct = await resolveExactPersistedProduct(
            productCode,
            filters.branchCode,
            filters.locationCode,
            productName
          );

          if (currentProduct) {
            currentStock = toNum(resolveEffectiveStock(currentProduct));
            stockSource = 'PersistedProduct.stock';
          }
        }

        let totalQtyOutInSelectedPeriod = 0;
        let totalQtyInInSelectedPeriod = 0;

        if (productCode) {
          const [salesAfter, intakeAfter] = await Promise.all([
            prisma.salesInvoiceItem.findMany({
              where: {
                productCode: { equals: productCode, mode: 'insensitive' },
                salesInvoice: {
                  ...(filters.branchCode ? { branchCode: normalizeUpper(filters.branchCode) } : {}),
                  ...(filters.locationCode ? { locationCode: { equals: normalizeUpper(filters.locationCode), mode: 'insensitive' } } : {}),
                  ...(filters.locationId ? { locationId: Number(filters.locationId) } : {}),
                  invoiceDate: { gt: period.startDate },
                },
              },
              select: { qty: true },
            }),
            prisma.goodsIntakeItem.findMany({
              where: {
                product: { sourceCode: { equals: productCode, mode: 'insensitive' } },
                goodsIntake: {
                  ...(filters.branchCode ? { branchCode: normalizeUpper(filters.branchCode) } : {}),
                  ...(filters.locationCode ? { locationCode: { equals: normalizeUpper(filters.locationCode), mode: 'insensitive' } } : {}),
                  ...(filters.locationId ? { locationId: Number(filters.locationId) } : {}),
                  status: { not: 'draft' },
                  finalizedAt: { gt: period.startDate },
                },
              },
              select: { quantity: true },
            }),
          ]);

          totalQtyOutInSelectedPeriod = salesAfter.reduce((sum, row) => sum + toNum(row.qty), 0);
          totalQtyInInSelectedPeriod = intakeAfter.reduce((sum, row) => sum + toNum(row.quantity), 0);
        }

        productDiagnostics.set(productKey, {
          productCode: productCode || null,
          latestStockBalance: currentStock,
          totalQtyOutInSelectedPeriod,
          totalQtyInInSelectedPeriod,
          computedOpeningBalance: openingBal,
          firstBalanceAfterTransaction: null,
          computedClosingBalance: null,
          stockSource,
        });

        console.log(`[LEDGER DIAGNOSTIC ${diagnosticCounter + 1}/10]`, {
          productCode,
          productName,
          branchCode: filters.branchCode || null,
          locationCode: filters.locationCode || null,
          latestStockBalance: currentStock,
          stockSource,
          totalQtyOutInSelectedPeriod,
          totalQtyInInSelectedPeriod,
          computedOpeningBalance: openingBal,
          firstBalanceAfterTransaction: null,
          computedClosingBalance: null,
        });

        diagnosticCounter++;
      }
    }

    // Calculate running balances per product key
    const firstBalanceLogged = new Set();
    const movementProductCache = new Map();

    for (const movement of allMovements) {
      const productKey = movement.productCode || normalizeUpper(movement.productName || '');
      const movementBranchCode = movement.branchCode || filters.branchCode || null;
      const movementLocationCode = movement.locationCode || filters.locationCode || null;
      const lookupKey = `${normalize(movement.productCode || '')}|${normalizeUpper(movementBranchCode || '')}|${normalizeUpper(movementLocationCode || '')}`;

      let resolvedProduct = movementProductCache.get(lookupKey);
      if (!resolvedProduct && movement.productCode && movementBranchCode && movementLocationCode) {
        resolvedProduct = await resolveExactPersistedProduct(
        movement.productCode,
        movementBranchCode,
        movementLocationCode,
        movement.productName
      );
        movementProductCache.set(lookupKey, resolvedProduct || null);
      }

      if (productKey && productCurrentBalances.hasOwnProperty(productKey)) {
               // Initialize from opening balance once
      if (productCurrentBalances[productKey] == null) {
        productCurrentBalances[productKey] =
          productOpeningBalances[productKey] ?? 0;
      }

      const prevBalance = toNum(productCurrentBalances[productKey]);

      // Apply movement chronologically
      const nextBalance = toNum(
        prevBalance +
        movement.qtyIn -
        movement.qtyOut
      );

      movement.balanceBeforeTransaction = prevBalance;
      movement.balanceAfterTransaction = nextBalance;

      // Persist running balance
      productCurrentBalances[productKey] = nextBalance;
      productClosingBalances[productKey] = nextBalance;
        if (productDiagnostics.has(productKey) && !firstBalanceLogged.has(productKey)) {
          const diag = productDiagnostics.get(productKey);
          diag.firstBalanceAfterTransaction = movement.balanceAfterTransaction;
          console.log(`[LEDGER DIAGNOSTIC UPDATE] First balance after transaction for ${movement.productCode || movement.productName}: ${movement.balanceAfterTransaction}`);
          firstBalanceLogged.add(productKey);
        }

        console.log('[LEDGER BALANCE] Movement:', {
          productCode: movement.productCode,
          branchCode: movementBranchCode,
          locationCode: movementLocationCode,
          resolvedProductId: resolvedProduct?.id || null,
          resolvedProductSourceCode: resolvedProduct?.sourceCode || null,
          resolvedProductStock: resolvedProduct ? toNum(resolveEffectiveStock(resolvedProduct)) : null,
          matched: Boolean(resolvedProduct),
          movementType: movement.movementType,
          timestamp: movement.movementDate,
          qtyIn: movement.qtyIn,
          qtyOut: movement.qtyOut,
          balanceBeforeTransaction: prevBalance,
          balanceAfterTransaction: movement.balanceAfterTransaction,
        });
      } else {
        movement.balanceAfterTransaction =
        productCurrentBalances[productKey] ??
        productOpeningBalances[productKey] ??
        null;
        console.warn('[LEDGER BALANCE] No balance tracking for productKey:', productKey, {
          branchCode: movementBranchCode,
          locationCode: movementLocationCode,
          matched: Boolean(resolvedProduct),
          resolvedProductId: resolvedProduct?.id || null,
        });
      }
    }

    // Set closing balances
    for (const productKey of uniqueProductKeys) {
      productClosingBalances[productKey] = productCurrentBalances[productKey];
      if (productDiagnostics.has(productKey)) {
        productDiagnostics.get(productKey).computedClosingBalance = productClosingBalances[productKey];
      }
    }

    // Calculate summary totals
    let totalQtyIn = 0;
    let totalQtyOut = 0;
    let totalSalesAmount = 0;
    let totalOpeningBalance = 0;
    let totalClosingBalance = 0;

    allMovements.forEach((movement) => {
      totalQtyIn += Number(movement.qtyIn || 0);
      totalQtyOut += Number(movement.qtyOut || 0);
      totalSalesAmount += Number(movement.lineAmount || 0);
    });

    uniqueProductKeys.forEach((productKey) => {
      totalOpeningBalance += productOpeningBalances[productKey] || 0;
      totalClosingBalance += productClosingBalances[productKey] || 0;
      
      // Log summary per product
      const { productCode, productName } = productKeyLookup.get(productKey) || {};
      console.log('[LEDGER SUMMARY PER PRODUCT]', {
        productCode,
        productName,
        openingBalance: productOpeningBalances[productKey],
        closingBalance: productClosingBalances[productKey],
        netMovement: (productClosingBalances[productKey] || 0) - (productOpeningBalances[productKey] || 0),
      });
    });

    for (const [productKey, diag] of productDiagnostics.entries()) {
      console.log('[LEDGER DIAGNOSTIC SUMMARY]', {
        productCode: diag.productCode,
        latestStockBalance: diag.latestStockBalance,
        totalQtyOutInSelectedPeriod: diag.totalQtyOutInSelectedPeriod,
        totalQtyInInSelectedPeriod: diag.totalQtyInInSelectedPeriod,
        computedOpeningBalance: diag.computedOpeningBalance,
        firstBalanceAfterTransaction: diag.firstBalanceAfterTransaction,
        computedClosingBalance: diag.computedClosingBalance,
        stockSource: diag.stockSource,
      });
    }

    // Get product summary if no product filter
    const products = hasProductFilter ? [] : await getProductSummary(period, filters);

    // Get current product stock if product filter and location specified
    let currentProductStock = null;
    let productInfo = null;
    
    if (hasProductFilter && !isAllLocations) {
      currentProductStock = await getCurrentProductStock(
        filters.productCode,
        filters.locationCode,
        filters.branchCode,
        filters.locationId,
      );
      
      if (currentProductStock !== null) {
        productInfo = {
          productCode: filters.productCode || null,
          productName: filters.productName || null,
          currentStock: currentProductStock,
        };
      }
    }

    // Build ledger rows in the expected frontend shape with local time
    const ledger = allMovements.map((movement, idx) => {
      const productKey = movement.productCode || normalizeUpper(movement.productName || '');
      const openingBalance = productOpeningBalances[productKey] || 0;
      // Only show closing balance for completed periods (not today)
      const closingBalance = !isPeriodToday ? (productClosingBalances[productKey] || 0) : null;
      const timestampValue = movement.movementDate instanceof Date ? movement.movementDate.toISOString() : movement.movementDate;

      // Diagnostic log for each ledger row
      console.log('[LEDGER ROW]', {
        productCode: movement.productCode,
        branchCode: filters.branchCode,
        locationCode: movement.locationCode,
        movementType: movement.movementType,
        timestamp: timestampValue,
        openingBalance,
        qtyIn: movement.qtyIn,
        qtyOut: movement.qtyOut,
        balanceAfterTransaction: movement.balanceAfterTransaction,
      });

      return {
        transactionId: movement.transactionId || `${movement.movementType}-${idx}`,
        timestamp: timestampValue,
        movementType: movement.movementType,
        referenceNo: movement.referenceNo,
        user: movement.cashierName,
        productCode: movement.productCode,
        productName: movement.productName,
        openingBalance,
        qtyIn: movement.qtyIn,
        qtyOut: movement.qtyOut,
        balanceAfterTransaction: movement.balanceAfterTransaction,
        closingBalance,
        unitPrice: movement.unitPrice,
        lineAmount: movement.lineAmount,
        locationCode: movement.locationCode,
      };
    });

    // Build summary (closing balance only for completed periods)
    const summary = {
      totalQtyIn: toNum(totalQtyIn),
      totalQtyOut: toNum(totalQtyOut),
      totalSalesAmount: roundMoney(totalSalesAmount),
      movementCount: allMovements.length,
      transactionCount: allMovements.length,
      productCount: products.length,
      currentProductStock,
      productInfo,
      openingBalance: toNum(totalOpeningBalance),
      closingBalance: !isPeriodToday ? toNum(totalClosingBalance) : null,
      isPeriodToday,
    };

    // Data quality info
    let dataQuality = {
      level: 'ok',
      message: null,
    };

    if (isAllLocations && hasProductFilter) {
      dataQuality = {
        level: 'warning',
        message: 'Select a specific location for accurate running balance. Stock is location-specific.',
      };
    } else if (hasProductFilter && currentProductStock === null) {
      dataQuality = {
        level: 'warning',
        message: 'Product not found at this location. Showing movement data only.',
      };
    }

    return {
      success: true,
      mode: hasProductFilter ? 'ledger' : 'summary',
      period: {
        startDate: period.startDate,
        endDate: period.endDate,
        periodType: filters.periodType || 'day',
      },
      location: {
        locationId: filters.locationId || null,
        locationCode: filters.locationCode || null,
        isAllLocations,
      },
      summary,
      products,
      movements: allMovements,
      ledger,
      dataQuality,
    };
  } catch (error) {
    console.error('Inventory Activity Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to load inventory activity data',
      mode: 'summary',
      summary: {},
      products: [],
      movements: [],
      dataQuality: { level: 'error', message: error.message },
    };
  }
}

module.exports = {
  getInventoryActivityLedgerData,
};
