'use strict';

const { PrismaClient } = require('@prisma/client');
const {
  buildLookupKey,
  normalizeProductCode,
  resolveLatestProductCosts,
} = require('./business-operations/latestProductCost.service');
const { formatBusinessDateKey } = require('../utils/businessTime');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely coerce a Prisma aggregate number result (can be null) to a float. */
function toNum(val, decimals = 2) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return parseFloat(n.toFixed(decimals));
}

/** Convert a BigInt id from Prisma to a string safe for JSON serialisation. */
function serializeBigInt(val) {
  return val != null ? String(val) : null;
}

function roundMoney(val, decimals = 2) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function productGroupKey(productCode, productName) {
  return `${productCode || ''}__${productName || ''}`;
}

// ---------------------------------------------------------------------------
// 1. Sales Summary
// ---------------------------------------------------------------------------

/**
 * Return high-level aggregated metrics for the given WHERE clause.
 *
 * @param {object} invoiceWhere – Prisma WHERE for SalesInvoice
 * @returns {Promise<object>} summary data
 */
async function querySalesSummary(invoiceWhere) {
  const [invoiceAgg, itemAgg] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: invoiceWhere,
      _count: { id: true },
      _sum: {
        grossSale: true,
        vatAmount: true,
        discount: true,
        netSale: true,
        levyAmount: true,
        discountAmount: true,
      },
      _avg: { netSale: true },
    }),
    prisma.salesInvoiceItem.aggregate({
      where: { salesInvoice: invoiceWhere },
      _sum: { qty: true },
    }),
  ]);

  const totalInvoices = invoiceAgg._count.id || 0;
  const avgInvoice = invoiceAgg._avg.netSale;

  return {
    totalInvoices,
    totalItemsSold: toNum(itemAgg._sum.qty, 4),
    grossSales: toNum(invoiceAgg._sum.grossSale),
    vatTotal: toNum(invoiceAgg._sum.vatAmount),
    discountTotal: toNum(invoiceAgg._sum.discount),
    netSales: toNum(invoiceAgg._sum.netSale),
    levyTotal: toNum(invoiceAgg._sum.levyAmount),
    averageInvoiceValue: totalInvoices > 0 && avgInvoice !== null ? toNum(avgInvoice) : 0,
  };
}

// ---------------------------------------------------------------------------
// 2. Invoice list
// ---------------------------------------------------------------------------

/**
 * Return paginated invoice rows with optional sorting.
 *
 * @param {object} invoiceWhere – Prisma WHERE for SalesInvoice
 * @param {object} pagination   – { skip, take, page, pageSize }
 * @param {object} sort         – { sortBy, sortOrder }
 * @returns {Promise<{ invoices: object[], total: number }>}
 */
async function queryInvoiceList(invoiceWhere, pagination, sort) {
  const [rows, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        syncSourceCode: true,
        branchCode: true,
        branchName: true,
        locationId: true,
        locationCode: true,
        sourceInvoiceNo: true,
        sourceInvoiceSerialNo: true,
        sourceCashSaleNo: true,
        refNo: true,
        invoiceDate: true,
        invoiceTime: true,
        customerCode: true,
        customerDetails: true,
        grossSale: true,
        vatAmount: true,
        discount: true,
        discountAmount: true,
        netSale: true,
        levyAmount: true,
        invoiceType: true,
        tillId: true,
        payMethod1: true,
        tenderAmount1: true,
        payMethod2: true,
        tenderAmount2: true,
        userName: true,
        fiscalReceiptNo: true,
        bankCode: true,
        bankName: true,
      },
      orderBy: { [sort.sortBy]: sort.sortOrder },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.salesInvoice.count({ where: invoiceWhere }),
  ]);

  // BigInt fields must be serialised as strings for JSON
  const invoices = rows.map((inv) => ({
    ...inv,
    id: serializeBigInt(inv.id),
  }));

  return { invoices, total };
}

// ---------------------------------------------------------------------------
// 3. Product aggregation
// ---------------------------------------------------------------------------

/**
 * Mapping from consumer sort field names to Prisma groupBy orderBy expressions.
 */
const PRODUCT_ORDER_BY_MAP = {
  totalQuantitySold: (order) => ({ _sum: { qty: order } }),
  totalSales: (order) => ({ _sum: { amount: order } }),
  productCode: (order) => ({ productCode: order }),
  productName: (order) => ({ productName: order }),
  totalTax: (order) => ({ _sum: { taxAmount: order } }),
  totalDiscount: (order) => ({ _sum: { discountAmount: order } }),
};

/**
 * Return paginated product-level aggregated rows.
 *
 * @param {object} itemWhere  – Prisma WHERE for SalesInvoiceItem
 * @param {object} pagination – { skip, take, page, pageSize }
 * @param {object} sort       – { sortBy, sortOrder }
 * @returns {Promise<{ products: object[], total: number }>}
 */
async function queryProductReport(itemWhere, pagination, sort) {
  const orderByFn = PRODUCT_ORDER_BY_MAP[sort.sortBy] || PRODUCT_ORDER_BY_MAP.totalQuantitySold;
  const orderBy = orderByFn(sort.sortOrder);

  const [groups, allGroups] = await Promise.all([
    prisma.salesInvoiceItem.groupBy({
      by: ['productCode', 'productName'],
      where: itemWhere,
      _sum: {
        qty: true,
        amount: true,
        taxAmount: true,
        discountAmount: true,
        discount: true,
      },
      _avg: { unitPrice: true },
      _count: { id: true },
      orderBy,
      skip: pagination.skip,
      take: pagination.take,
    }),
    // Count distinct product groups for pagination metadata
    prisma.salesInvoiceItem
      .groupBy({ by: ['productCode', 'productName'], where: itemWhere, _count: { id: true } })
      .then((r) => r.length),
  ]);

  const groupFilters = groups.map((g) => ({
    productCode: g.productCode,
    productName: g.productName,
  }));

  const costRows = groupFilters.length
    ? await prisma.salesInvoiceItem.findMany({
      where: {
        ...itemWhere,
        OR: groupFilters,
      },
      select: {
        productCode: true,
        productName: true,
        qty: true,
        costPrice: true,
      },
    })
    : [];

  const totalCostByGroup = new Map();
  for (const row of costRows) {
    const key = productGroupKey(row.productCode, row.productName);
    const qty = Number(row.qty || 0);
    const unitCost = Number(row.costPrice || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(unitCost) || qty <= 0 || unitCost <= 0) continue;
    const lineCost = unitCost * qty;
    totalCostByGroup.set(key, (totalCostByGroup.get(key) || 0) + lineCost);
  }

  const products = groups.map((g) => {
    const totalSales = toNum(g._sum.amount);
    const totalCost = roundMoney(totalCostByGroup.get(productGroupKey(g.productCode, g.productName)) || 0);
    const hasMarginData = totalCost > 0 && totalSales > 0;
    const estimatedMargin = hasMarginData
      ? toNum(((totalSales - totalCost) / totalSales) * 100)
      : null;

    return {
      productCode: g.productCode,
      productName: g.productName,
      totalQuantitySold: toNum(g._sum.qty, 4),
      totalSales,
      totalTax: toNum(g._sum.taxAmount),
      totalDiscount: toNum(g._sum.discountAmount),
      totalCost,
      averageUnitPrice: toNum(g._avg.unitPrice),
      estimatedMarginPct: estimatedMargin,
    };
  });

  return { products, total: allGroups };
}

// ---------------------------------------------------------------------------
// 4. User / cashier aggregation
// ---------------------------------------------------------------------------

/**
 * Mapping from consumer sort field names to Prisma groupBy orderBy expressions.
 */
const USER_ORDER_BY_MAP = {
  totalInvoices: (order) => ({ _count: { id: order } }),
  totalSales: (order) => ({ _sum: { netSale: order } }),
  grossSales: (order) => ({ _sum: { grossSale: order } }),
  vatTotal: (order) => ({ _sum: { vatAmount: order } }),
  averageInvoiceValue: (order) => ({ _avg: { netSale: order } }),
  userName: (order) => ({ userName: order }),
};

/**
 * Return paginated cashier/user-level aggregated rows.
 *
 * @param {object} invoiceWhere – Prisma WHERE for SalesInvoice
 * @param {object} pagination   – { skip, take, page, pageSize }
 * @param {object} sort         – { sortBy, sortOrder }
 * @returns {Promise<{ users: object[], total: number }>}
 */
async function queryUserReport(invoiceWhere, pagination, sort) {
  // Ensure rows with a null userName are excluded unless a userName filter
  // was already applied (in which case the filter handles scoping).
  const where = { ...invoiceWhere };
  if (!where.userName) {
    where.userName = { not: null };
  }

  const orderByFn = USER_ORDER_BY_MAP[sort.sortBy] || USER_ORDER_BY_MAP.totalInvoices;
  const orderBy = orderByFn(sort.sortOrder);

  const [groups, allGroups] = await Promise.all([
    prisma.salesInvoice.groupBy({
      by: ['userName'],
      where,
      _count: { id: true },
      _sum: { grossSale: true, vatAmount: true, netSale: true, discount: true },
      _avg: { netSale: true },
      orderBy,
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.salesInvoice
      .groupBy({ by: ['userName'], where, _count: { id: true } })
      .then((r) => r.length),
  ]);

  const users = groups.map((g) => ({
    userName: g.userName,
    totalInvoices: g._count.id || 0,
    totalSales: toNum(g._sum.netSale),
    grossSales: toNum(g._sum.grossSale),
    vatTotal: toNum(g._sum.vatAmount),
    discountTotal: toNum(g._sum.discount),
    averageInvoiceValue: g._avg.netSale !== null ? toNum(g._avg.netSale) : 0,
  }));

  return { users, total: allGroups };
}

// ---------------------------------------------------------------------------
// 5. Payment method summary
// ---------------------------------------------------------------------------

/**
 * Return payment-method totals for the given period and filters.
 *
 * Two payment columns (payMethod1/payMethod2) are queried separately then
 * merged so the result is normalised per unique method name.
 *
 * @param {object} invoiceWhere – Prisma WHERE for SalesInvoice
 * @returns {Promise<object[]>} sorted payment summary rows
 */
async function queryPaymentReport(invoiceWhere) {
  // Clone the where so we can add payMethod1/2 not-null conditions without
  // mutating the original.  If the OR array from a payMethod filter already
  // exists it stays in force (it becomes an additional AND condition).
  const baseWhere = { ...invoiceWhere };

  const [pm1Groups, pm2Groups] = await Promise.all([
    prisma.salesInvoice.groupBy({
      by: ['payMethod1'],
      where: { ...baseWhere, payMethod1: { not: null } },
      _count: { id: true },
      _sum: { tenderAmount1: true },
    }),
    prisma.salesInvoice.groupBy({
      by: ['payMethod2'],
      where: { ...baseWhere, payMethod2: { not: null } },
      _count: { id: true },
      _sum: { tenderAmount2: true },
    }),
  ]);

  // Merge by normalised method name (UPPERCASE, trimmed)
  const methodMap = new Map();

  const ensureEntry = (key) => {
    if (!methodMap.has(key)) {
      methodMap.set(key, { payMethod: key, totalAmount: 0, invoiceCount: 0 });
    }
    return methodMap.get(key);
  };

  for (const g of pm1Groups) {
    if (!g.payMethod1) continue;
    const entry = ensureEntry(g.payMethod1.trim().toUpperCase());
    entry.totalAmount += toNum(g._sum.tenderAmount1);
    entry.invoiceCount += g._count.id || 0;
  }

  for (const g of pm2Groups) {
    if (!g.payMethod2) continue;
    const entry = ensureEntry(g.payMethod2.trim().toUpperCase());
    entry.totalAmount += toNum(g._sum.tenderAmount2);
    entry.invoiceCount += g._count.id || 0;
  }

  // Round totals and sort by totalAmount descending
  return [...methodMap.values()]
    .map((e) => ({ ...e, totalAmount: toNum(e.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

// ---------------------------------------------------------------------------
// 6. Latest-cost profit analytics
// ---------------------------------------------------------------------------

function categoryLabel(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function dayKeyFromDate(value) {
  return formatBusinessDateKey(value);
}

async function queryLatestCostProfitAnalytics(itemWhere, filters = {}) {
  const [groupedProducts, salesItems] = await Promise.all([
    prisma.salesInvoiceItem.groupBy({
      by: ['syncSourceCode', 'productCode', 'productName'],
      where: itemWhere,
      _sum: {
        qty: true,
        amount: true,
        taxAmount: true,
        discountAmount: true,
      },
      _avg: {
        unitPrice: true,
      },
      _count: {
        id: true,
      },
    }),
    prisma.salesInvoiceItem.findMany({
      where: itemWhere,
      select: {
        syncSourceCode: true,
        productCode: true,
        productName: true,
        qty: true,
        amount: true,
        salesInvoice: {
          select: {
            invoiceDate: true,
            branchCode: true,
            branchName: true,
          },
        },
      },
    }),
  ]);

  const productCodes = Array.from(new Set(
    groupedProducts
      .map((row) => normalizeProductCode(row.productCode))
      .filter(Boolean),
  ));

  const productKeys = groupedProducts
    .map((row) => ({
      syncSourceCode: normalizeProductCode(row.syncSourceCode),
      productCode: normalizeProductCode(row.productCode),
    }))
    .filter((row) => row.syncSourceCode && row.productCode);

  const [latestCostMap, productDetails] = await Promise.all([
    resolveLatestProductCosts({ productKeys, filters }),
    productCodes.length > 0
      ? prisma.product.findMany({
          where: {
            sourceCode: { in: productCodes },
          },
          select: {
            sourceCode: true,
            name: true,
            category: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const productDetailsMap = new Map(
    productDetails.map((row) => [normalizeProductCode(row.sourceCode), row]),
  );

  const branchScopedProducts = groupedProducts
    .map((group) => {
      const syncSourceCode = normalizeProductCode(group.syncSourceCode);
      const productCode = normalizeProductCode(group.productCode);
      const detail = productCode ? productDetailsMap.get(productCode) : null;
      const costBasisKey = buildLookupKey(syncSourceCode, productCode);
      const costBasis = costBasisKey ? latestCostMap.get(costBasisKey) : null;
      const revenue = toNum(group._sum.amount);
      const quantitySold = toNum(group._sum.qty, 4);
      const hasValidLatestCost = !!costBasis?.hasValidCost;
      const costOfGoodsSold = hasValidLatestCost
        ? roundMoney(costBasis.latestUnitCost * quantitySold)
        : null;
      const grossProfit = hasValidLatestCost
        ? roundMoney(revenue - costOfGoodsSold)
        : null;
      const grossMarginPct = hasValidLatestCost && revenue > 0
        ? roundMoney((grossProfit / revenue) * 100)
        : null;

      let incompleteReason = null;
      if (!productCode) {
        incompleteReason = 'Sold item has no product code, so no latest GRN cost can be matched safely.';
      } else if (!costBasis) {
        incompleteReason = 'No latest POS GRN cost snapshot was found for this product in the selected scope.';
      } else if (!costBasis.hasValidCost) {
        incompleteReason = 'Latest POS GRN record has no valid positive unit cost.';
      }

      return {
        syncSourceCode,
        branchCode: costBasis?.branchCode || null,
        branchName: costBasis?.branchName || null,
        productCode,
        productName: group.productName || detail?.name || costBasis?.productNameAtCostBasis || 'Unnamed product',
        category: categoryLabel(detail?.category),
        quantitySold,
        revenue,
        totalTax: toNum(group._sum.taxAmount),
        totalDiscount: toNum(group._sum.discountAmount),
        averageUnitPrice: toNum(group._avg.unitPrice),
        linesSold: group._count.id || 0,
        hasValidLatestCost,
        isIncomplete: !hasValidLatestCost,
        incompleteReason,
        costOfGoodsSold,
        grossProfit,
        grossMarginPct,
        latestCostBasis: costBasis
          ? {
              latestUnitCost: roundMoney(costBasis.latestUnitCost, 4),
              latestGrnReference: costBasis.latestGrnReference,
              intakeRef: costBasis.intakeRef,
              receiptReference: costBasis.receiptReference,
              latestStockAdditionDate: costBasis.latestStockAdditionDate,
              latestRecordedAt: costBasis.latestRecordedAt,
              locationCode: costBasis.locationCode,
              locationId: costBasis.locationId,
            }
          : null,
      };
    })
    .sort((a, b) => {
      if (a.isIncomplete !== b.isIncomplete) return a.isIncomplete ? -1 : 1;
      return (b.grossProfit ?? Number.NEGATIVE_INFINITY) - (a.grossProfit ?? Number.NEGATIVE_INFINITY)
        || b.revenue - a.revenue;
    });

  const productsMap = new Map();
  for (const row of branchScopedProducts) {
    const aggregateKey = normalizeProductCode(row.productCode) || `${row.syncSourceCode || 'unknown'}::${row.productName}`;
    const existing = productsMap.get(aggregateKey) || {
      syncSources: new Set(),
      branchCodes: new Set(),
      branchNames: new Set(),
      productCode: row.productCode,
      productName: row.productName,
      category: row.category,
      quantitySold: 0,
      revenue: 0,
      totalTax: 0,
      totalDiscount: 0,
      averageUnitPriceNumerator: 0,
      averageUnitPriceDivisor: 0,
      linesSold: 0,
      coveredRevenue: 0,
      excludedRevenue: 0,
      completeSegments: 0,
      incompleteSegments: 0,
      incompleteReasons: [],
      costOfGoodsSold: 0,
      grossProfit: 0,
      latestCostBasis: [],
    };

    if (row.syncSourceCode) existing.syncSources.add(row.syncSourceCode);
    if (row.branchCode) existing.branchCodes.add(row.branchCode);
    if (row.branchName) existing.branchNames.add(row.branchName);
    if (!existing.category && row.category) existing.category = row.category;

    existing.quantitySold += row.quantitySold;
    existing.revenue += row.revenue;
    existing.totalTax += row.totalTax;
    existing.totalDiscount += row.totalDiscount;
    existing.linesSold += row.linesSold;
    existing.averageUnitPriceNumerator += row.averageUnitPrice * row.quantitySold;
    existing.averageUnitPriceDivisor += row.quantitySold;

    if (row.hasValidLatestCost) {
      existing.coveredRevenue += row.revenue;
      existing.completeSegments += 1;
      existing.costOfGoodsSold += row.costOfGoodsSold || 0;
      existing.grossProfit += row.grossProfit || 0;
      if (row.latestCostBasis) {
        existing.latestCostBasis.push({
          ...row.latestCostBasis,
          syncSourceCode: row.syncSourceCode,
          branchCode: row.branchCode,
          branchName: row.branchName,
        });
      }
    } else {
      existing.excludedRevenue += row.revenue;
      existing.incompleteSegments += 1;
      if (row.incompleteReason && !existing.incompleteReasons.includes(row.incompleteReason)) {
        existing.incompleteReasons.push(row.incompleteReason);
      }
    }

    productsMap.set(aggregateKey, existing);
  }

  const products = Array.from(productsMap.values())
    .map((entry) => {
      const averageUnitPrice = entry.averageUnitPriceDivisor > 0
        ? roundMoney(entry.averageUnitPriceNumerator / entry.averageUnitPriceDivisor)
        : 0;
      const hasValidLatestCost = entry.coveredRevenue > 0;
      const isIncomplete = entry.incompleteSegments > 0;
      const costOfGoodsSold = hasValidLatestCost ? roundMoney(entry.costOfGoodsSold) : null;
      const grossProfit = hasValidLatestCost ? roundMoney(entry.grossProfit) : null;

      return {
        syncSourceCodes: Array.from(entry.syncSources.values()),
        branchCodes: Array.from(entry.branchCodes.values()),
        branchNames: Array.from(entry.branchNames.values()),
        productCode: entry.productCode,
        productName: entry.productName,
        category: entry.category,
        quantitySold: roundMoney(entry.quantitySold, 4),
        revenue: roundMoney(entry.revenue),
        revenueWithCostBasis: roundMoney(entry.coveredRevenue),
        excludedRevenue: roundMoney(entry.excludedRevenue),
        totalTax: roundMoney(entry.totalTax),
        totalDiscount: roundMoney(entry.totalDiscount),
        averageUnitPrice,
        linesSold: entry.linesSold,
        hasValidLatestCost,
        isIncomplete,
        incompleteReason: entry.incompleteReasons.join(' '),
        costOfGoodsSold,
        grossProfit,
        grossMarginPct: hasValidLatestCost && entry.coveredRevenue > 0 ? roundMoney((entry.grossProfit / entry.coveredRevenue) * 100) : null,
        latestCostBasis: entry.latestCostBasis,
      };
    })
    .sort((a, b) => {
      if (a.isIncomplete !== b.isIncomplete) return a.isIncomplete ? -1 : 1;
      return (b.grossProfit ?? Number.NEGATIVE_INFINITY) - (a.grossProfit ?? Number.NEGATIVE_INFINITY)
        || b.revenue - a.revenue;
    });

  const summary = branchScopedProducts.reduce((acc, row) => {
    acc.totalProducts += 1;
    acc.totalRevenue += row.revenue;
    acc.totalQuantitySold += row.quantitySold;

    if (row.hasValidLatestCost) {
      acc.completeProducts += 1;
      acc.completeRevenue += row.revenue;
      acc.totalCostOfGoodsSold += row.costOfGoodsSold || 0;
      acc.totalGrossProfit += row.grossProfit || 0;
      if ((row.grossProfit || 0) > 0) acc.profitableProducts += 1;
      if ((row.grossProfit || 0) < 0) acc.lossMakingProducts += 1;
    } else {
      acc.incompleteProducts += 1;
      acc.excludedRevenue += row.revenue;
    }

    return acc;
  }, {
    totalProducts: 0,
    completeProducts: 0,
    incompleteProducts: 0,
    totalRevenue: 0,
    completeRevenue: 0,
    excludedRevenue: 0,
    totalQuantitySold: 0,
    totalCostOfGoodsSold: 0,
    totalGrossProfit: 0,
    profitableProducts: 0,
    lossMakingProducts: 0,
  });

  summary.totalRevenue = roundMoney(summary.totalRevenue);
  summary.completeRevenue = roundMoney(summary.completeRevenue);
  summary.excludedRevenue = roundMoney(summary.excludedRevenue);
  summary.totalQuantitySold = roundMoney(summary.totalQuantitySold, 4);
  summary.totalCostOfGoodsSold = roundMoney(summary.totalCostOfGoodsSold);
  summary.totalGrossProfit = roundMoney(summary.totalGrossProfit);
  summary.uniqueProducts = products.length;
  summary.grossMarginPct = summary.completeRevenue > 0
    ? roundMoney((summary.totalGrossProfit / summary.completeRevenue) * 100)
    : null;
  summary.coveragePct = summary.totalRevenue > 0
    ? roundMoney((summary.completeRevenue / summary.totalRevenue) * 100)
    : 0;
  summary.costBasisLabel = 'Latest unit cost from the most recent POS SQL GRN per product and sync source';

  const categoryMap = new Map();
  for (const row of branchScopedProducts) {
    const key = categoryLabel(row.category) || 'Uncategorized';
    const entry = categoryMap.get(key) || {
      category: key,
      totalProducts: 0,
      completeProducts: 0,
      incompleteProducts: 0,
      totalQuantitySold: 0,
      totalRevenue: 0,
      completeRevenue: 0,
      excludedRevenue: 0,
      totalCostOfGoodsSold: 0,
      totalGrossProfit: 0,
      grossMarginPct: null,
    };

    entry.totalProducts += 1;
    entry.totalQuantitySold += row.quantitySold;
    entry.totalRevenue += row.revenue;

    if (row.hasValidLatestCost) {
      entry.completeProducts += 1;
      entry.completeRevenue += row.revenue;
      entry.totalCostOfGoodsSold += row.costOfGoodsSold || 0;
      entry.totalGrossProfit += row.grossProfit || 0;
    } else {
      entry.incompleteProducts += 1;
      entry.excludedRevenue += row.revenue;
    }

    categoryMap.set(key, entry);
  }

  const categoryTotals = Array.from(categoryMap.values())
    .map((entry) => ({
      ...entry,
      totalQuantitySold: roundMoney(entry.totalQuantitySold, 4),
      totalRevenue: roundMoney(entry.totalRevenue),
      completeRevenue: roundMoney(entry.completeRevenue),
      excludedRevenue: roundMoney(entry.excludedRevenue),
      totalCostOfGoodsSold: roundMoney(entry.totalCostOfGoodsSold),
      totalGrossProfit: roundMoney(entry.totalGrossProfit),
      grossMarginPct: entry.completeRevenue > 0 ? roundMoney((entry.totalGrossProfit / entry.completeRevenue) * 100) : null,
    }))
    .sort((a, b) => b.totalGrossProfit - a.totalGrossProfit);

  const dailyMap = new Map();
  for (const row of salesItems) {
    const day = dayKeyFromDate(row?.salesInvoice?.invoiceDate) || 'Unknown';
    const syncSourceCode = normalizeProductCode(row.syncSourceCode);
    const productCode = normalizeProductCode(row.productCode);
    const revenue = toNum(row.amount);
    const quantitySold = toNum(row.qty, 4);
    const costBasisKey = buildLookupKey(syncSourceCode, productCode);
    const costBasis = costBasisKey ? latestCostMap.get(costBasisKey) : null;
    const hasValidLatestCost = !!costBasis?.hasValidCost;

    const bucket = dailyMap.get(day) || {
      day,
      revenue: 0,
      revenueWithCostBasis: 0,
      excludedRevenue: 0,
      quantitySold: 0,
      costOfGoodsSold: 0,
      grossProfit: 0,
      incompleteProductCodes: new Set(),
    };

    bucket.revenue += revenue;
    bucket.quantitySold += quantitySold;

    if (hasValidLatestCost) {
      const lineCost = roundMoney(costBasis.latestUnitCost * quantitySold);
      bucket.revenueWithCostBasis += revenue;
      bucket.costOfGoodsSold += lineCost;
      bucket.grossProfit += revenue - lineCost;
    } else {
      bucket.excludedRevenue += revenue;
      bucket.incompleteProductCodes.add(productCode || row.productName || row?.salesInvoice?.branchCode || 'Unknown');
    }

    dailyMap.set(day, bucket);
  }

  const dailyTotals = Array.from(dailyMap.values())
    .map((bucket) => ({
      day: bucket.day,
      revenue: roundMoney(bucket.revenue),
      revenueWithCostBasis: roundMoney(bucket.revenueWithCostBasis),
      excludedRevenue: roundMoney(bucket.excludedRevenue),
      quantitySold: roundMoney(bucket.quantitySold, 4),
      costOfGoodsSold: roundMoney(bucket.costOfGoodsSold),
      grossProfit: roundMoney(bucket.grossProfit),
      grossMarginPct: bucket.revenueWithCostBasis > 0 ? roundMoney((bucket.grossProfit / bucket.revenueWithCostBasis) * 100) : null,
      incompleteProducts: bucket.incompleteProductCodes.size,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    summary,
    profitabilitySummary: {
      profitableProducts: summary.profitableProducts,
      lossMakingProducts: summary.lossMakingProducts,
      breakEvenProducts: Math.max(summary.completeProducts - summary.profitableProducts - summary.lossMakingProducts, 0),
    },
    dailyTotals,
    categoryTotals,
    products,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  querySalesSummary,
  queryInvoiceList,
  queryProductReport,
  queryUserReport,
  queryPaymentReport,
  queryLatestCostProfitAnalytics,
};
