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
  
  return locationFilter;
}

/**
 * Get sales movements for a period and location
 */
async function getSaleMovements(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);
  const productFilter = filters.productCode || filters.productName ? {
    OR: [
      { productCode: { contains: filters.productCode || '', mode: 'insensitive' } },
      { productName: { contains: filters.productName || '', mode: 'insensitive' } },
    ]
  } : {};

  const where = {
    ...locationFilter,
    ...productFilter,
    salesInvoice: {
      invoiceDate: { gte: period.startDate, lte: period.endDate },
      status: { not: 'draft' },
    },
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
          locationId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 2000,
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
  const productFilter = filters.productCode || filters.productName ? {
    OR: [
      { productName: { contains: filters.productCode || filters.productName || '', mode: 'insensitive' } },
    ]
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
 * Get product summary for the period and location
 */
async function getProductSummary(period, filters = {}) {
  const locationFilter = buildLocationFilter(filters);

  const [salesItems, intakeItems] = await Promise.all([
    prisma.salesInvoiceItem.findMany({
      where: {
        ...locationFilter,
        salesInvoice: {
          invoiceDate: { gte: period.startDate, lte: period.endDate },
          status: { not: 'draft' },
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

    // Get movements
    const [saleMovements, intakeMovements] = await Promise.all([
      getSaleMovements(period, filters),
      getIntakeMovements(period, filters),
    ]);

    // Combine and sort movements
    let allMovements = [...saleMovements, ...intakeMovements]
      .filter((row) => {
        if (!filters.movementType) return true;
        return row.movementType === normalizeUpper(filters.movementType);
      })
      .sort((a, b) => new Date(a.movementDate).getTime() - new Date(b.movementDate).getTime());

    // Calculate summary
    let totalQtyIn = 0;
    let totalQtyOut = 0;
    let totalSalesAmount = 0;

    allMovements = allMovements.map((movement) => {
      totalQtyIn += Number(movement.qtyIn || 0);
      totalQtyOut += Number(movement.qtyOut || 0);
      totalSalesAmount += Number(movement.lineAmount || 0);
      
      const runningBalance = totalQtyIn - totalQtyOut;
      return { ...movement, runningBalance: toNum(runningBalance) };
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

    // Build summary
    const summary = {
      totalQtyIn: toNum(totalQtyIn),
      totalQtyOut: toNum(totalQtyOut),
      totalSalesAmount: roundMoney(totalSalesAmount),
      movementCount: allMovements.length,
      productCount: products.length,
      currentProductStock,
      productInfo,
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
