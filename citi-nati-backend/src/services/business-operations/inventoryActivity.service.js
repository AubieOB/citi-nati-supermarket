'use strict';

const { PrismaClient } = require('@prisma/client');

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
 * Get opening stock balance before the period (all locations/products)
 */
async function getOpeningBalance(productCode, productName, locationCode, periodStartDate, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const beforePeriod = new Date(periodStartDate);
  beforePeriod.setDate(beforePeriod.getDate() - 1);
  beforePeriod.setHours(23, 59, 59, 999);

  const productFilter = productCode || productName ? {
    OR: [
      productCode ? { productCode: { equals: productCode, mode: 'insensitive' } } : null,
      productName ? { productName: { contains: productName, mode: 'insensitive' } } : null,
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
    const [salesBefore, intakeBefore, emergencySalesBefore] = await Promise.all([
      prisma.salesInvoiceItem.findMany({
        where: {
          ...productFilter,
          salesInvoice: {
            ...locationFilter,
            invoiceDate: { lte: beforePeriod },
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
            finalizedAt: { lte: beforePeriod },
          },
        },
        select: { quantity: true },
      }),
      prisma.emergencySale?.findMany?.({
        where: {
          ...locationFilter,
          status: { in: ['approved', 'completed'] },
          createdAt: { lte: beforePeriod },
          productName: productName ? { contains: productName, mode: 'insensitive' } : undefined,
        },
        select: { quantity: true },
      }) || [],
    ]);

    const totalIn = intakeBefore.reduce((sum, row) => sum + toNum(row.quantity), 0);
    const totalOut = salesBefore.reduce((sum, row) => sum + toNum(row.qty), 0)
      + emergencySalesBefore.reduce((sum, row) => sum + toNum(row.quantity), 0);

    return toNum(totalIn - totalOut);
  } catch (err) {
    return 0;
  }
}

/**
 * Get all transaction-level inventory events for a period
 */
async function getInventoryTransactions(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const productCode = filters.productCode ? normalizeUpper(filters.productCode) : null;
  const productName = filters.productName ? normalize(filters.productName).toLowerCase() : null;
  const isAllLocations = !filters.locationId && !filters.locationCode;

  const allTransactions = [];

  // Diagnostic logging
  console.log('[LEDGER_DEBUG] ==== INVENTORY ACTIVITY FETCH ====');
  console.log('[LEDGER_DEBUG] Period:', {
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    localStart: period.startDate.toString(),
    localEnd: period.endDate.toString(),
  });
  console.log('[LEDGER_DEBUG] Filters:', {
    branchCode: filters.branchCode,
    locationCode: filters.locationCode,
    locationId: filters.locationId,
    isAllLocations,
    productCode,
    productName,
  });
  console.log('[LEDGER_DEBUG] Location filter object:', locationFilter);

  try {
    // Fetch sales transactions
    console.log('[LEDGER_DEBUG] Querying SalesInvoiceItem...');
    const salesItems = await prisma.salesInvoiceItem.findMany({
      where: {
        salesInvoice: {
          ...locationFilter,
          invoiceDate: { gte: period.startDate, lte: period.endDate },
        },
      },
      select: {
        id: true,
        productCode: true,
        productName: true,
        qty: true,
        unitPrice: true,
        amount: true,
        createdAt: true,
        salesInvoice: {
          select: {
            id: true,
            invoiceDate: true,
            invoiceTime: true,
            sourceInvoiceNo: true,
            refNo: true,
            userName: true,
            locationCode: true,
            locationId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 10000,
    });

    console.log(`[LEDGER_DEBUG] Found ${salesItems.length} SalesInvoiceItem records`);
    if (salesItems.length > 0) {
      console.log('[LEDGER_DEBUG] Sample sales items (first 3):');
      salesItems.slice(0, 3).forEach((item, idx) => {
        console.log(`  [${idx}] productCode=${item.productCode}, qty=${item.qty}, invoiceDate=${item.salesInvoice?.invoiceDate?.toISOString()}`);
      });
    }

    salesItems.forEach((item) => {
      // Apply product filter
      if (productCode && normalizeUpper(item.productCode || '') !== productCode) return;
      if (productName && normalize(item.productName || '').toLowerCase().indexOf(productName) === -1) return;

      allTransactions.push({
        transactionId: `SALE-${item.salesInvoice.id}-${item.id}`,
        timestamp: item.salesInvoice.invoiceTime || item.salesInvoice.invoiceDate || item.createdAt,
        movementType: 'SALE',
        referenceNo: item.salesInvoice.refNo || String(item.salesInvoice.sourceInvoiceNo || ''),
        user: item.salesInvoice.userName || null,
        productCode: item.productCode || null,
        productName: item.productName || null,
        qtyIn: 0,
        qtyOut: toNum(item.qty),
        unitPrice: roundMoney(item.unitPrice),
        lineAmount: roundMoney(item.amount),
        locationCode: item.salesInvoice.locationCode || null,
        locationId: item.salesInvoice.locationId || null,
      });
    });

    // Fetch intake transactions
    const intakeItems = await prisma.goodsIntakeItem.findMany({
      where: {
        goodsIntake: {
          ...locationFilter,
          status: { not: 'draft' },
          finalizedAt: { gte: period.startDate, lte: period.endDate },
        },
      },
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
            id: true,
            intakeRef: true,
            finalizedAt: true,
            enteredBy: true,
            locationCode: true,
            locationId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 10000,
    });

    intakeItems.forEach((item) => {
      // Apply product filter
      if (productCode && normalizeUpper(item.product?.sourceCode || '') !== productCode) return;
      if (productName && normalize(item.productName || '').toLowerCase().indexOf(productName) === -1) return;

      allTransactions.push({
        transactionId: `INTAKE-${item.goodsIntake.id}-${item.id}`,
        timestamp: item.goodsIntake.finalizedAt || item.createdAt,
        movementType: 'STOCK_INTAKE',
        referenceNo: item.goodsIntake.intakeRef || null,
        user: item.goodsIntake.enteredBy || null,
        productCode: item.product?.sourceCode || null,
        productName: item.productName || null,
        qtyIn: toNum(item.quantity),
        qtyOut: 0,
        unitPrice: roundMoney(item.unitCost),
        lineAmount: roundMoney(item.totalCost),
        locationCode: item.goodsIntake.locationCode || null,
        locationId: item.goodsIntake.locationId || null,
      });
    });

    // Fetch emergency sales if table exists
    if (prisma.emergencySale) {
      try {
        const emergencySales = await prisma.emergencySale.findMany({
          where: {
            ...locationFilter,
            status: { in: ['approved', 'completed'] },
            createdAt: { gte: period.startDate, lte: period.endDate },
          },
          select: {
            id: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            totalAmount: true,
            approvedBy: true,
            approvalDate: true,
            locationCode: true,
            locationId: true,
            createdAt: true,
            referenceNo: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 5000,
        });

        emergencySales.forEach((item) => {
          // Apply product filter
          if (productName && normalize(item.productName || '').toLowerCase().indexOf(productName) === -1) return;

          allTransactions.push({
            transactionId: `EMERGENCY-${item.id}`,
            timestamp: item.approvalDate || item.createdAt,
            movementType: 'EMERGENCY_SALE',
            referenceNo: item.referenceNo || null,
            user: item.approvedBy || 'Emergency',
            productCode: null,
            productName: item.productName || null,
            qtyIn: 0,
            qtyOut: toNum(item.quantity),
            unitPrice: roundMoney(item.unitPrice),
            lineAmount: roundMoney(item.totalAmount),
            locationCode: item.locationCode || null,
            locationId: item.locationId || null,
          });
        });
      } catch (err) {
        // Emergency sales table doesn't exist or error occurred
      }
    }

  } catch (err) {
    console.error('Error fetching inventory transactions:', err);
  }

  console.log(`[LEDGER_DEBUG] Total transactions collected: ${allTransactions.length}`);
  return allTransactions;
}

/**
 * Main function to get inventory activity ledger
 */
async function getInventoryActivityLedgerData({ filters = {} }) {
  try {
    const period = buildPeriod(filters);
    const hasProductFilter = Boolean(normalize(filters.productCode) || normalize(filters.productName));
    const isAllLocations = !filters.locationId && !filters.locationCode;

    // Get all transactions for the period
    let transactions = await getInventoryTransactions(period, filters);

    console.log(`[LEDGER_DEBUG] Processing ${transactions.length} transactions for ledger...`);

    // Filter by movement type if specified
    if (filters.movementType) {
      const movementType = normalizeUpper(filters.movementType);
      transactions = transactions.filter(t => t.movementType === movementType);
    }

    // Sort chronologically
    transactions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Get opening balance
    let openingBalance = 0;
    if (hasProductFilter && !isAllLocations) {
      openingBalance = await getOpeningBalance(
        filters.productCode || null,
        filters.productName || null,
        filters.locationCode || null,
        period.startDate,
        filters
      );
    }

    // Calculate running balances
    let runningBalance = openingBalance;
    const ledgerRows = transactions.map((txn) => {
      runningBalance = toNum(runningBalance + txn.qtyIn - txn.qtyOut);
      return {
        ...txn,
        runningBalance,
      };
    });

    const closingBalance = runningBalance;

    // Build ledger with opening and closing balance rows
    const ledger = [];

    // Add opening balance row
    if (hasProductFilter && !isAllLocations) {
      ledger.push({
        transactionId: 'OPENING_BALANCE',
        timestamp: new Date(period.startDate),
        movementType: 'OPENING_BALANCE',
        referenceNo: 'Opening Balance',
        user: null,
        productCode: filters.productCode || null,
        productName: filters.productName || null,
        qtyIn: 0,
        qtyOut: 0,
        runningBalance: openingBalance,
        unitPrice: 0,
        lineAmount: 0,
        locationCode: filters.locationCode || null,
        locationId: filters.locationId || null,
      });
    }

    // Add all transaction rows
    ledger.push(...ledgerRows);

    // Add closing balance row
    if (hasProductFilter && !isAllLocations && ledgerRows.length > 0) {
      ledger.push({
        transactionId: 'CLOSING_BALANCE',
        timestamp: new Date(period.endDate),
        movementType: 'CLOSING_BALANCE',
        referenceNo: 'Closing Balance',
        user: null,
        productCode: filters.productCode || null,
        productName: filters.productName || null,
        qtyIn: 0,
        qtyOut: 0,
        runningBalance: closingBalance,
        unitPrice: 0,
        lineAmount: 0,
        locationCode: filters.locationCode || null,
        locationId: filters.locationId || null,
      });
    }

    // Calculate summary statistics
    const summary = {
      totalQtyIn: toNum(transactions.reduce((sum, t) => sum + t.qtyIn, 0)),
      totalQtyOut: toNum(transactions.reduce((sum, t) => sum + t.qtyOut, 0)),
      totalSalesAmount: roundMoney(transactions.reduce((sum, t) => sum + t.lineAmount, 0)),
      transactionCount: transactions.length,
      openingBalance: toNum(openingBalance),
      closingBalance: toNum(closingBalance),
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
    }

    return {
      success: true,
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
      ledger,
      dataQuality,
    };
  } catch (error) {
    console.error('Inventory Activity Ledger Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to load inventory activity ledger',
      period: {},
      location: {},
      summary: {},
      ledger: [],
      dataQuality: { level: 'error', message: error.message },
    };
  }
}

module.exports = {
  getInventoryActivityLedgerData,
};

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
 * Get opening stock balance before the period
 */
async function getOpeningBalance(productCode, productName, locationCode, periodStartDate, filters = {}) {
  const locationFilter = buildLocationFilter(filters);

  const beforePeriod = new Date(periodStartDate);
  beforePeriod.setDate(beforePeriod.getDate() - 1);
  beforePeriod.setHours(23, 59, 59, 999);

  const productFilter = productCode || productName ? {
    OR: [
      productCode ? { productCode: { equals: productCode, mode: 'insensitive' } } : null,
      productName ? { productName: { contains: productName, mode: 'insensitive' } } : null,
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
    const [salesBefore, intakeBefore, emergencySalesBefore] = await Promise.all([
      prisma.salesInvoiceItem.findMany({
        where: {
          ...productFilter,
          salesInvoice: {
            ...locationFilter,
            invoiceDate: { lte: beforePeriod },
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
            finalizedAt: { lte: beforePeriod },
          },
        },
        select: { quantity: true },
      }),
      prisma.emergencySale?.findMany?.({
        where: {
          ...locationFilter,
          status: { in: ['approved', 'completed'] },
          createdAt: { lte: beforePeriod },
          productName: productName ? { contains: productName, mode: 'insensitive' } : undefined,
        },
        select: { quantity: true },
      }) || [],
    ]);

    const totalIn = intakeBefore.reduce((sum, row) => sum + toNum(row.quantity), 0);
    const totalOut = salesBefore.reduce((sum, row) => sum + toNum(row.qty), 0)
      + emergencySalesBefore.reduce((sum, row) => sum + toNum(row.quantity), 0);

    console.log('[OPENING BALANCE] Product:', { productCode, productName }, 'Before:', beforePeriod.toISOString(), 'Result:', { salesQty: totalOut, intakeQty: totalIn, balance: totalIn - totalOut });
    
    return toNum(totalIn - totalOut);
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
async function getCurrentProductStock(productCode, locationCode) {
  if (!productCode || !locationCode) return null;

  const product = await prisma.product.findFirst({
    where: {
      OR: [
        { sourceCode: { equals: productCode, mode: 'insensitive' } },
        { name: { contains: productCode, mode: 'insensitive' } },
      ],
      locationCode: normalizeUpper(locationCode),
    },
    select: {
      stock: true,
      name: true,
      sourceCode: true,
    },
  });

  return product ? toNum(product.stock) : null;
}

/**
 * Main function to get inventory activity data
 */
async function getInventoryActivityLedgerData({ period: periodParams, filters = {} }) {
  try {
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
    }

    // Calculate running balances per product key
    allMovements.forEach((movement) => {
      const productKey = movement.productCode || normalizeUpper(movement.productName || '');
      if (productKey && productCurrentBalances.hasOwnProperty(productKey)) {
        productCurrentBalances[productKey] = toNum(productCurrentBalances[productKey] + movement.qtyIn - movement.qtyOut);
        movement.balanceAfterTransaction = productCurrentBalances[productKey];
      } else {
        movement.balanceAfterTransaction = 0; // fallback
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

    uniqueProductCodes.forEach((productCode) => {
      totalOpeningBalance += productOpeningBalances[productCode] || 0;
      totalClosingBalance += productClosingBalances[productCode] || 0;
    });

    // Get product summary if no product filter
    const products = hasProductFilter ? [] : await getProductSummary(period, filters);

    // Get current product stock if product filter and location specified
    let currentProductStock = null;
    let productInfo = null;
    
    if (hasProductFilter && !isAllLocations) {
      currentProductStock = await getCurrentProductStock(
        filters.productCode || filters.productName,
        filters.locationCode
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
