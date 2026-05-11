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
 * Build period from filter parameters
 */
function buildPeriod(filters = {}) {
  const now = new Date();
  let startDate, endDate;

  switch (filters.periodType) {
    case 'day':
      startDate = new Date(filters.date || now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(filters.date || now);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'month':
      const month = parseInt(filters.month || (now.getMonth() + 1));
      const year = parseInt(filters.year || now.getFullYear());
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0, 23, 59, 59, 999);
      break;
    case 'year':
      const yr = parseInt(filters.year || now.getFullYear());
      startDate = new Date(yr, 0, 1);
      endDate = new Date(yr, 11, 31, 23, 59, 59, 999);
      break;
    case 'custom':
      startDate = new Date(filters.startDate || now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(filters.endDate || now);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
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

  const productFilter = productCode || productName ? {
    OR: [
      productCode ? { sourceCode: { equals: productCode, mode: 'insensitive' } } : null,
      productName ? { name: { contains: productName, mode: 'insensitive' } } : null,
    ].filter(Boolean)
  } : {};

  // Separate product filter for goodsIntakeItem (uses product.sourceCode)
  const intakeProductFilter = productCode || productName ? {
    OR: [
      productCode ? { product: { sourceCode: { equals: productCode, mode: 'insensitive' } } } : null,
      productName ? { productName: { contains: productName, mode: 'insensitive' } } : null,
    ].filter(Boolean)
  } : {};

  try {
    // 1. Get current synced POS stock - try exact location match first, then fallback to branch-level
    let currentSyncedStock = await prisma.product.findFirst({
      where: {
        OR: [
          productCode ? { sourceCode: { equals: productCode, mode: 'insensitive' } } : null,
          productName ? { name: { contains: productName, mode: 'insensitive' } } : null,
        ].filter(Boolean),
        ...(locationFilter.branchCode ? { branchCode: locationFilter.branchCode } : {}),
        ...(locationFilter.locationCode ? { locationCode: locationFilter.locationCode } : {}),
      },
      select: {
        stock: true,
        overrideActive: true,
        overrideStock: true,
        sourceCode: true,
        name: true,
        locationCode: true,
        branchCode: true,
      },
    });

    // Fallback: if not found with location code, try branch level only
    if (!currentSyncedStock && locationFilter.branchCode) {
      currentSyncedStock = await prisma.product.findFirst({
        where: {
          OR: [
            productCode ? { sourceCode: { equals: productCode, mode: 'insensitive' } } : null,
            productName ? { name: { contains: productName, mode: 'insensitive' } } : null,
          ].filter(Boolean),
          branchCode: locationFilter.branchCode,
        },
        select: {
          stock: true,
          overrideActive: true,
          overrideStock: true,
          sourceCode: true,
          name: true,
          locationCode: true,
          branchCode: true,
        },
      });
    }

    const currentStock = currentSyncedStock ? toNum(resolveEffectiveStock(currentSyncedStock)) : 0;

    // 2. Get all transactions AFTER the period start (to calculate what's happened since period began)
    const [salesAfter, intakeAfter, emergencySalesAfter] = await Promise.all([
      prisma.salesInvoiceItem.findMany({
        where: {
          ...productFilter,
          salesInvoice: {
            ...locationFilter,
            invoiceDate: { gt: periodStartDate },
          },
        },
        select: { qty: true },
      }),
      prisma.goodsIntakeItem.findMany({
        where: {
          ...intakeProductFilter,
          goodsIntake: {
            ...locationFilter,
            status: { not: 'draft' },
            finalizedAt: { gt: periodStartDate },
          },
        },
        select: { quantity: true },
      }),
      prisma.emergencySale?.findMany?.({
        where: {
          ...locationFilter,
          status: { in: ['approved', 'completed'] },
          createdAt: { gt: periodStartDate },
          productName: productName ? { contains: productName, mode: 'insensitive' } : undefined,
        },
        select: { quantity: true },
      }) || [],
    ]);

    const qtyOutAfter = salesAfter.reduce((sum, row) => sum + toNum(row.qty), 0)
      + emergencySalesAfter.reduce((sum, row) => sum + toNum(row.quantity), 0);
    const qtyInAfter = intakeAfter.reduce((sum, row) => sum + toNum(row.quantity), 0);

    // Opening Balance = current stock + (sales after period - intakes after period)
    // Because sales reduce stock and intakes increase it, we're calculating what was there at period start
    const openingBal = toNum(currentStock + qtyOutAfter - qtyInAfter);

    console.log('[OPENING BALANCE] Product:', { productCode, productName, locationCode }, 'PeriodStart:', periodStartDate.toISOString(), 'Calculation:', {
      currentSyncedStock: currentStock,
      qtyOutAfter,
      qtyInAfter,
      openingBalance: openingBal,
      stockSource: 'Product.stock (effective via resolveEffectiveStock)',
      branchCode: currentSyncedStock?.branchCode || null,
      locationCode: currentSyncedStock?.locationCode || null,
      productFound: !!currentSyncedStock,
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
async function getCurrentProductStock(productCode, locationCode, branchCode, locationId) {
  if (!productCode) return null;

  // Try exact location match first
  let product = locationCode ? await prisma.product.findFirst({
    where: {
      OR: [
        { sourceCode: { equals: productCode, mode: 'insensitive' } },
        { name: { contains: productCode, mode: 'insensitive' } },
      ],
      ...(branchCode ? { branchCode: normalizeUpper(branchCode) } : {}),
      locationCode: normalizeUpper(locationCode),
    },
    select: {
      stock: true,
      overrideActive: true,
      overrideStock: true,
      name: true,
      sourceCode: true,
    },
  }) : null;

  // Fallback to branch level if exact location not found
  if (!product && branchCode) {
    product = await prisma.product.findFirst({
      where: {
        OR: [
          { sourceCode: { equals: productCode, mode: 'insensitive' } },
          { name: { contains: productCode, mode: 'insensitive' } },
        ],
        branchCode: normalizeUpper(branchCode),
      },
      select: {
        stock: true,
        overrideActive: true,
        overrideStock: true,
        name: true,
        sourceCode: true,
      },
    });
  }

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
    console.log('[INVENTORY LEDGER] Location filter:', { isAllLocations, locationCode: filters.locationCode, locationId: filters.locationId });

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
      .sort((a, b) => new Date(a.movementDate).getTime() - new Date(b.movementDate).getTime());

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

    console.log('[INVENTORY LEDGER] Processing opening balances for', uniqueProductKeys.length, 'unique products');

    let diagnosticCounter = 0;
    const diagnosticLoggedProducts = new Set();

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

      // Diagnostic logging for first 10 products
      if (diagnosticCounter < 10) {
        // Get current stock info for diagnostics - try exact location first, then fallback
        let currentProduct = await prisma.product.findFirst({
          where: {
            OR: [
              productCode ? { sourceCode: { equals: productCode, mode: 'insensitive' } } : null,
              productName ? { name: { contains: productName, mode: 'insensitive' } } : null,
            ].filter(Boolean),
            ...(filters.branchCode ? { branchCode: normalizeUpper(filters.branchCode) } : {}),
            ...(filters.locationCode ? { locationCode: { equals: normalizeUpper(filters.locationCode), mode: 'insensitive' } } : {}),
          },
          select: { stock: true, overrideActive: true, overrideStock: true, branchCode: true, locationCode: true },
        });

        // Fallback: try branch level only if exact location not found
        if (!currentProduct && filters.branchCode) {
          currentProduct = await prisma.product.findFirst({
            where: {
              OR: [
                productCode ? { sourceCode: { equals: productCode, mode: 'insensitive' } } : null,
                productName ? { name: { contains: productName, mode: 'insensitive' } } : null,
              ].filter(Boolean),
              branchCode: normalizeUpper(filters.branchCode),
            },
            select: { stock: true, overrideActive: true, overrideStock: true, branchCode: true, locationCode: true },
          });
        }

        const currentStock = currentProduct ? toNum(resolveEffectiveStock(currentProduct)) : 0;

        // Get movements after period start for diagnostics
        const [salesAfter, intakeAfter] = await Promise.all([
          prisma.salesInvoiceItem.findMany({
            where: {
              OR: [
                productCode ? { productCode: { equals: productCode, mode: 'insensitive' } } : null,
                productName ? { productName: { contains: productName, mode: 'insensitive' } } : null,
              ].filter(Boolean),
              salesInvoice: {
                ...(filters.branchCode ? { branchCode: filters.branchCode } : {}),
                ...(filters.locationCode ? { locationCode: { equals: filters.locationCode, mode: 'insensitive' } } : {}),
                ...(filters.locationId ? { locationId: Number(filters.locationId) } : {}),
                invoiceDate: { gt: period.startDate },
              },
            },
            select: { qty: true },
          }),
          prisma.goodsIntakeItem.findMany({
            where: {
              OR: [
                productCode ? { product: { sourceCode: { equals: productCode, mode: 'insensitive' } } } : null,
                productName ? { productName: { contains: productName, mode: 'insensitive' } } : null,
              ].filter(Boolean),
              goodsIntake: {
                ...(filters.branchCode ? { branchCode: filters.branchCode } : {}),
                ...(filters.locationCode ? { locationCode: { equals: filters.locationCode, mode: 'insensitive' } } : {}),
                ...(filters.locationId ? { locationId: Number(filters.locationId) } : {}),
                status: { not: 'draft' },
                finalizedAt: { gt: period.startDate },
              },
            },
            select: { quantity: true },
          }),
        ]);

        const qtyOutAfter = salesAfter.reduce((sum, row) => sum + toNum(row.qty), 0);
        const qtyInAfter = intakeAfter.reduce((sum, row) => sum + toNum(row.quantity), 0);

        console.log(`[LEDGER DIAGNOSTIC ${diagnosticCounter + 1}/10]`, {
          productCode,
          productName,
          branchCode: currentProduct?.branchCode || null,
          locationCode: currentProduct?.locationCode || null,
          currentStockFound: currentStock,
          stockSource: 'Product.stock (effective via resolveEffectiveStock)',
          qtyOutAfterPeriodStart: qtyOutAfter,
          qtyInAfterPeriodStart: qtyInAfter,
          computedOpeningBalance: openingBal,
          firstBalanceAfterTransaction: null, // Will be set later
        });
        diagnosticLoggedProducts.add(productKey);
        diagnosticCounter++;
      }
    }

    // Calculate running balances per product key
    const firstBalanceLogged = new Set();
    allMovements.forEach((movement) => {
      const productKey = movement.productCode || normalizeUpper(movement.productName || '');
      if (productKey && productCurrentBalances.hasOwnProperty(productKey)) {
        const prevBalance = productCurrentBalances[productKey];
        productCurrentBalances[productKey] = toNum(prevBalance + movement.qtyIn - movement.qtyOut);
        movement.balanceAfterTransaction = productCurrentBalances[productKey];
        
        // Update diagnostic first balance if this is the first movement for a logged product
        if (diagnosticLoggedProducts.has(productKey) && !firstBalanceLogged.has(productKey)) {
          console.log(`[LEDGER DIAGNOSTIC UPDATE] First balance after transaction for ${movement.productCode || movement.productName}: ${movement.balanceAfterTransaction}`);
          firstBalanceLogged.add(productKey);
        }
        
        // Diagnostic logging for each movement
        console.log('[LEDGER BALANCE] Movement:', {
          productCode: movement.productCode,
          productName: movement.productName,
          movementType: movement.movementType,
          timestamp: movement.movementDate,
          qtyIn: movement.qtyIn,
          qtyOut: movement.qtyOut,
          balanceBeforeTransaction: prevBalance,
          balanceAfterTransaction: movement.balanceAfterTransaction,
        });
      } else {
        movement.balanceAfterTransaction = 0; // fallback
        console.warn('[LEDGER BALANCE] No balance tracking for productKey:', productKey);
      }
    });

    // Set closing balances
    for (const productKey of uniqueProductKeys) {
      productClosingBalances[productKey] = productCurrentBalances[productKey];
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

    // Get product summary if no product filter
    const products = hasProductFilter ? [] : await getProductSummary(period, filters);

    // Get current product stock if product filter and location specified
    let currentProductStock = null;
    let productInfo = null;
    
    if (hasProductFilter && !isAllLocations) {
      currentProductStock = await getCurrentProductStock(
        filters.productCode || filters.productName,
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
      const timestampLocal = new Date(movement.movementDate).toLocaleString('en-US', { 
        timeZone: 'Africa/Blantyre',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Diagnostic log for each ledger row
      console.log('[LEDGER ROW]', {
        productCode: movement.productCode,
        branchCode: filters.branchCode,
        locationCode: movement.locationCode,
        movementType: movement.movementType,
        timestamp: movement.movementDate,
        openingBalance,
        qtyIn: movement.qtyIn,
        qtyOut: movement.qtyOut,
        balanceAfterTransaction: movement.balanceAfterTransaction,
        timestampLocalBlantyre: timestampLocal,
      });

      return {
        transactionId: movement.transactionId || `${movement.movementType}-${idx}`,
        timestamp: timestampLocal,
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
