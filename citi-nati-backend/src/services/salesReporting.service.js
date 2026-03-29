'use strict';

const { PrismaClient } = require('@prisma/client');

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
        costPrice: true,
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

  const products = groups.map((g) => {
    const totalSales = toNum(g._sum.amount);
    const totalCost = toNum(g._sum.costPrice);
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
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  querySalesSummary,
  queryInvoiceList,
  queryProductReport,
  queryUserReport,
  queryPaymentReport,
};
