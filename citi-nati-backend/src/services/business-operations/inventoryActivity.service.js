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

function buildProductFilter(filters = {}) {
  const productCode = normalize(filters.productCode);
  const productName = normalize(filters.productName);

  const and = [];

  if (productCode) {
    and.push({
      productCode: {
        equals: productCode,
        mode: 'insensitive',
      },
    });
  }

  if (productName) {
    and.push({
      productName: {
        contains: productName,
        mode: 'insensitive',
      },
    });
  }

  return and.length ? { AND: and } : {};
}

function buildSalesInvoiceScope(period, filters = {}, fromStartUntilNow = false) {
  const where = {};

  where.invoiceDate = {
    gte: period.startDate,
    lte: fromStartUntilNow ? new Date() : period.endDate,
  };

  if (filters.locationId) where.locationId = Number(filters.locationId);
  if (filters.locationCode) where.locationCode = normalizeUpper(filters.locationCode);
  if (filters.branchCode) where.branchCode = normalizeUpper(filters.branchCode);
  if (filters.syncSourceCode) where.syncSourceCode = normalizeUpper(filters.syncSourceCode);

  return where;
}

function buildSalesItemWhere(period, filters = {}, fromStartUntilNow = false) {
  const productFilter = buildProductFilter(filters);

  return {
    ...productFilter,
    salesInvoice: buildSalesInvoiceScope(period, filters, fromStartUntilNow),
  };
}

function buildGoodsIntakeWhere(period, filters = {}, fromStartUntilNow = false) {
  const where = {
    goodsIntake: {
      status: {
        not: 'draft',
      },
      finalizedAt: {
        gte: period.startDate,
        lte: fromStartUntilNow ? new Date() : period.endDate,
      },
    },
  };

  if (filters.productCode) {
    where.OR = [
      {
        product: {
          sourceCode: {
            equals: normalize(filters.productCode),
            mode: 'insensitive',
          },
        },
      },
      {
        productName: {
          contains: normalize(filters.productCode),
          mode: 'insensitive',
        },
      },
    ];
  }
  if (filters.productName) {
    where.productName = {
      contains: normalize(filters.productName),
      mode: 'insensitive',
    };
  }

  if (filters.locationId) where.goodsIntake.locationId = Number(filters.locationId);
  if (filters.locationCode) where.goodsIntake.locationCode = normalizeUpper(filters.locationCode);

  return where;
}

async function findCurrentProduct(filters = {}) {
  const productCode = normalize(filters.productCode);
  const productName = normalize(filters.productName);

  if (!productCode && !productName) return null;

  const where = {};

  if (productCode) {
    where.sourceCode = {
      equals: productCode,
      mode: 'insensitive',
    };
  } else if (productName) {
    where.name = {
      contains: productName,
      mode: 'insensitive',
    };
  }

  if (filters.locationCode) where.locationCode = normalizeUpper(filters.locationCode);
  if (filters.branchCode) where.branchCode = normalizeUpper(filters.branchCode);

  return prisma.product.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Get movement date from sale - prioritize invoiceTime, then invoiceDate, then createdAt
 */
function getMovementDateFromSale(row) {
  const invoice = row.salesInvoice;
  if (invoice?.invoiceTime) return invoice.invoiceTime;
  if (invoice?.invoiceDate) return invoice.invoiceDate;
  return row.createdAt;
}

/**
 * Get movement date from intake - prioritize finalizedAt, then purchaseDate, then createdAt
 */
function getMovementDateFromIntake(row) {
  const intake = row.goodsIntake;
  if (intake?.finalizedAt) return intake.finalizedAt;
  if (intake?.purchaseDate) return intake.purchaseDate;
  if (intake?.createdAt) return intake.createdAt;
  return row.createdAt;
}

async function getSaleMovements(period, filters = {}) {
  const rows = await prisma.salesInvoiceItem.findMany({
    where: buildSalesItemWhere(period, filters, false),
    select: {
      id: true,
      productCode: true,
      productName: true,
      qty: true,
      unitPrice: true,
      amount: true,
      locationCode: true,
      syncSourceCode: true,
      createdAt: true,
      salesInvoice: {
        select: {
          invoiceDate: true,
          invoiceTime: true,
          sourceInvoiceNo: true,
          refNo: true,
          userName: true,
          branchCode: true,
          locationCode: true,
          locationId: true,
          syncSourceCode: true,
        },
      },
    },
    orderBy: {
      salesInvoice: {
        invoiceTime: 'asc',
      },
    },
    take: 1000,
  });

  return rows.map((row) => ({
    movementDate: getMovementDateFromSale(row),
    movementType: 'SALE',
    referenceNo: row.salesInvoice?.refNo || String(row.salesInvoice?.sourceInvoiceNo || ''),
    invoiceNo: row.salesInvoice?.sourceInvoiceNo || null,
    intakeRef: null,
    cashierName: row.salesInvoice?.userName || null,
    productCode: row.productCode,
    productName: row.productName,
    qtyIn: 0,
    qtyOut: toNum(row.qty),
    runningBalance: null,
    unitPrice: roundMoney(row.unitPrice),
    lineAmount: roundMoney(row.amount),
    locationId: row.salesInvoice?.locationId || null,
    locationCode: row.salesInvoice?.locationCode || row.locationCode || null,
    branchCode: row.salesInvoice?.branchCode || null,
    syncSourceCode: row.salesInvoice?.syncSourceCode || row.syncSourceCode || null,
    source: 'sales_invoice_items',
  }));
}

async function getIntakeMovements(period, filters = {}) {
  const rows = await prisma.goodsIntakeItem.findMany({
    where: buildGoodsIntakeWhere(period, filters, false),
    select: {
      id: true,
      productName: true,
      quantity: true,
      unitCost: true,
      totalCost: true,
      createdAt: true,
      product: {
        select: {
          sourceCode: true,
        },
      },
      goodsIntake: {
        select: {
          intakeRef: true,
          receiptReference: true,
          purchaseDate: true,
          finalizedAt: true,
          createdAt: true,
          enteredBy: true,
          locationId: true,
          locationCode: true,
          locationName: true,
        },
      },
    },
    orderBy: {
      goodsIntake: {
        finalizedAt: 'asc',
      },
    },
    take: 1000,
  });

  return rows.map((row) => ({
    movementDate: getMovementDateFromIntake(row),
    movementType: 'STOCK_INTAKE',
    referenceNo: row.goodsIntake?.intakeRef || row.goodsIntake?.receiptReference || null,
    invoiceNo: null,
    intakeRef: row.goodsIntake?.intakeRef || null,
    cashierName: row.goodsIntake?.enteredBy || null,
    productCode: row.product?.sourceCode || null,
    productName: row.productName,
    qtyIn: toNum(row.quantity),
    qtyOut: 0,
    runningBalance: null,
    unitPrice: roundMoney(row.unitCost),
    lineAmount: roundMoney(row.totalCost),
    locationId: row.goodsIntake?.locationId || null,
    locationCode: row.goodsIntake?.locationCode || null,
    branchCode: null,
    syncSourceCode: null,
    source: 'goods_intake_items',
  }));
}

/**
 * Get product movement summary using findMany + JS aggregation to avoid Prisma groupBy issues
 */
async function getGroupedSummary(period, filters = {}) {
  const [salesItems, intakeItems] = await Promise.all([
    prisma.salesInvoiceItem.findMany({
      where: buildSalesItemWhere(period, filters, false),
      select: {
        productCode: true,
        productName: true,
        qty: true,
        amount: true,
      },
      take: 2000,
    }),
    prisma.goodsIntakeItem.findMany({
      where: buildGoodsIntakeWhere(period, filters, false),
      select: {
        productName: true,
        quantity: true,
        totalCost: true,
        product: {
          select: {
            sourceCode: true,
          },
        },
      },
      take: 2000,
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
    .slice(0, 200);
}

/**
 * Calculate opening balance using reconstructed method
 * opening = currentStock - qtyInAfterStart + qtyOutAfterStart
 */
async function calculateOpeningBalance(period, filters = {}, currentProductStock = 0) {
  const [salesAfterStart, intakesAfterStart] = await Promise.all([
    prisma.salesInvoiceItem.aggregate({
      where: buildSalesItemWhere(period, filters, true),
      _sum: { qty: true },
    }),
    prisma.goodsIntakeItem.aggregate({
      where: buildGoodsIntakeWhere(period, filters, true),
      _sum: { quantity: true },
    }),
  ]);

  const totalOutAfterStart = toNum(salesAfterStart._sum.qty);
  const totalInAfterStart = toNum(intakesAfterStart._sum.quantity);

  const opening = Number(currentProductStock || 0) - totalInAfterStart + totalOutAfterStart;

  return Number.isFinite(opening) ? toNum(opening) : 0;
}

/**
 * Main function to get inventory activity ledger data
 */
async function getInventoryActivityLedgerData({ period, filters = {} }) {
  const hasProductFilter = Boolean(normalize(filters.productCode) || normalize(filters.productName));
  const isAllLocations = !filters.locationId && !filters.locationCode;

  // Summary mode - no product selected
  if (!hasProductFilter) {
    // For All Locations, warn about data quality
    let dataQualityLevel = 'ok';
    let dataQualityWarning = null;

    if (isAllLocations) {
      dataQualityLevel = 'warning';
      dataQualityWarning = 'Summary mode shows aggregated data across all locations. Select a specific location for accurate running balance.';
    }

    const products = await getGroupedSummary(period, filters);

    return {
      mode: 'summary',
      summary: {},
      products,
      movements: [],
      dataQuality: {
        level: dataQualityLevel,
        openingBalanceMethod: 'disabled',
        warning: dataQualityWarning || 'Enter a product code or name to view inventory activity ledger.',
      },
    };
  }

  // Ledger mode - product selected
  // Check location scope
  if (isAllLocations) {
    return {
      mode: 'ledger',
      summary: {},
      products: [],
      movements: [],
      dataQuality: {
        level: 'warning',
        openingBalanceMethod: 'disabled',
        warning: 'Select a specific location for accurate running balance. Stock is location-specific and cannot be combined.',
      },
    };
  }

  // Find current product for the specific location
  const currentProduct = await findCurrentProduct(filters);
  const currentProductStock = currentProduct ? toNum(currentProduct.stock || 0) : null;

  // Get movements
  const [saleMovements, intakeMovements] = await Promise.all([
    getSaleMovements(period, filters),
    getIntakeMovements(period, filters),
  ]);

  // Combine and filter movements
  let movements = [...saleMovements, ...intakeMovements]
    .filter((row) => {
      if (!filters.movementType) return true;
      return row.movementType === normalizeUpper(filters.movementType);
    })
    .sort((a, b) => {
      const dateA = new Date(a.movementDate).getTime();
      const dateB = new Date(b.movementDate).getTime();
      return dateA - dateB;
    });

  // Calculate opening balance
  const openingBalance = currentProductStock !== null
    ? await calculateOpeningBalance(period, filters, currentProductStock)
    : 0;

  let runningBalance = openingBalance;
  let totalQtyIn = 0;
  let totalQtyOut = 0;

  // Calculate running balance for each movement
  movements = movements.map((movement) => {
    totalQtyIn += Number(movement.qtyIn || 0);
    totalQtyOut += Number(movement.qtyOut || 0);

    runningBalance = runningBalance + Number(movement.qtyIn || 0) - Number(movement.qtyOut || 0);

    return {
      ...movement,
      runningBalance: toNum(runningBalance),
    };
  });

  const calculatedClosingBalance = toNum(openingBalance + totalQtyIn - totalQtyOut);
  const variance = currentProductStock !== null
    ? toNum(currentProductStock - calculatedClosingBalance)
    : null;

  // Build summary
  const summary = {
    productCode: normalize(filters.productCode) || currentProduct?.sourceCode || movements[0]?.productCode || null,
    productName: normalize(filters.productName) || currentProduct?.name || movements[0]?.productName || null,
    locationId: filters.locationId || currentProduct?.locationId || null,
    locationCode: filters.locationCode || currentProduct?.locationCode || null,
    branchCode: filters.branchCode || currentProduct?.branchCode || null,
    openingBalance: toNum(openingBalance),
    totalQtyIn: toNum(totalQtyIn),
    totalQtyOut: toNum(totalQtyOut),
    netMovement: toNum(totalQtyIn - totalQtyOut),
    calculatedClosingBalance: toNum(calculatedClosingBalance),
    currentProductStock,
    variance,
    movementCount: movements.length,
  };

  // Determine data quality
  let dataQualityLevel = 'ok';
  let dataQualityWarning = null;

  if (currentProductStock === null) {
    dataQualityLevel = 'warning';
    dataQualityWarning = 'Current product stock not found for this location. Opening/closing balances may be inaccurate.';
  } else {
    dataQualityWarning = 'Opening balance is reconstructed from current product stock and synced movement data. Accuracy depends on latest POS stock sync.';
  }

  return {
    mode: 'ledger',
    summary,
    products: [],
    movements,
    dataQuality: {
      level: dataQualityLevel,
      openingBalanceMethod: 'reconstructed_from_current_stock',
      warning: dataQualityWarning,
    },
  };
}

module.exports = {
  getInventoryActivityLedgerData,
};