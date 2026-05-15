'use strict';

const { PrismaClient } = require('@prisma/client');
const { resolvePeriod, formatDateRange } = require('../utils/reportingPeriod');
const {
  extractFilters,
  buildInvoiceWhere,
  buildItemWhere,
  parsePagination,
  parseSort,
  buildResponseFilters,
  ALLOWED_INVOICE_SORT_FIELDS,
  ALLOWED_PRODUCT_SORT_FIELDS,
  ALLOWED_USER_SORT_FIELDS,
} = require('../utils/reportingFilters');
const {
  querySalesSummary,
  queryInvoiceList,
  queryProductReport,
  queryUserReport,
  queryPaymentReport,
  queryLatestCostProfitAnalytics,
} = require('../services/salesReporting.service');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the period parameters from req.query and return
 * { startDate, endDate } or send a 400 response.
 * Returns null when a response has already been sent.
 */
function resolvePeriodOrRespond(req, res) {
  const { periodType, date, month, year, quarter, startDate, endDate } = req.query;
  const result = resolvePeriod({ periodType, date, month, year, quarter, startDate, endDate });

  if (result.error) {
    res.status(400).json({ success: false, error: result.error });
    return null;
  }

  return result; // { startDate: Date, endDate: Date, label: string }
}

function logReportScope(endpoint, req, whereClause, extra = {}) {
  try {
    const scope = {
      locationId: req.query.locationId || null,
      locationCode: req.query.locationCode || null,
      branchCode: req.query.branchCode || null,
      syncSourceCode: req.query.syncSourceCode || null,
    };

    console.log('[BO REPORTING][SCOPE]', {
      endpoint,
      scope,
      effectiveBranchCode: whereClause?.branchCode || null,
      where: whereClause,
      ...extra,
    });
  } catch (_err) {
    // Logging must never block report responses.
  }
}

function logLocationHistoryParity(endpoint, req, filters, whereClause, rowsFetched, extra = {}) {
  try {
    const scope = {
      selectedBranchCode: req.query.branchCode || null,
      selectedLocationCode: req.query.locationCode || null,
      selectedLocationId: req.query.locationId || null,
      aggregate: req.query.aggregate || null,
    };

    const periodInfo = {
      periodType: req.query.periodType || null,
      date: req.query.date || null,
      month: req.query.month || null,
      year: req.query.year || null,
      quarter: req.query.quarter || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
    };

    console.log('[BO_LOCATION_HISTORY_PARITY]', {
      module: endpoint,
      selectedBranchCode: scope.selectedBranchCode,
      selectedLocationCode: scope.selectedLocationCode,
      selectedLocationId: scope.selectedLocationId,
      aggregateMode: filters?.aggregate ? 'true' : 'false',
      dateRange: `${req.query.date || req.query.startDate || 'N/A'} to ${req.query.endDate || 'N/A'}`,
      periodType: periodInfo.periodType,
      querySource: 'SalesInvoice/SalesInvoiceItem',
      dateFieldUsed: 'invoiceDate',
      whereClause: JSON.stringify(whereClause, null, 2),
      legacyLocationIdFilterPresent: Boolean(whereClause?.locationId),
      legacyLocationIdPassed: Boolean(filters?.locationId),
      matchedRows: rowsFetched,
      rowsMatched: rowsFetched,
      ...extra,
    });
  } catch (_err) {
    // Logging must never block report responses.
  }
}

function handleReportingValidationError(err, res) {
  const message = String(err?.message || '').trim();
  if (message.includes('branchCode is required') || message.includes('locationCode is required')) {
    res.status(400).json({ success: false, error: message });
    return true;
  }
  return false;
}

const _diagPrisma = new PrismaClient();

/**
 * When rowsFetched is 0 and a branch scope is active, probe the DB to find
 * out whether ANY invoices exist for that branch (ignoring the date filter)
 * and what date range they cover. Fires asynchronously so it never delays responses.
 */
async function _probeBranchDataAsync(branchCode, invoiceWhere) {
  try {
    // Build a where without the invoiceDate range but with the same branch predicate
    const branchOnlyWhere = {};
    if (invoiceWhere.AND) {
      // Keep all AND conditions except the invoiceDate condition
      const andWithoutDate = invoiceWhere.AND.filter(
        (c) => !(c.invoiceDate),
      );
      if (andWithoutDate.length > 0) branchOnlyWhere.AND = andWithoutDate;
    }
    if (invoiceWhere.branchCode) branchOnlyWhere.branchCode = invoiceWhere.branchCode;
    if (invoiceWhere.syncSourceCode) branchOnlyWhere.syncSourceCode = invoiceWhere.syncSourceCode;
    if (invoiceWhere.OR) branchOnlyWhere.OR = invoiceWhere.OR;

    const [totalCount, groupBy] = await Promise.all([
      _diagPrisma.salesInvoice.count({ where: branchOnlyWhere }),
      _diagPrisma.salesInvoice.groupBy({
        by: ['branchCode', 'syncSourceCode'],
        _count: { id: true },
        _min: { invoiceDate: true },
        _max: { invoiceDate: true },
        where: branchOnlyWhere,
      }),
    ]);

    if (totalCount === 0) {
      // Broaden further: check ALL branches to confirm DB is populated at all
      const allBranches = await _diagPrisma.salesInvoice.groupBy({
        by: ['branchCode', 'syncSourceCode'],
        _count: { id: true },
      });
      console.log('[BO REPORTING][ZERO-DATA PROBE] No invoices found for branch even without date filter.', {
        queriedBranchCode: branchCode,
        allBranchesInDB: allBranches,
      });
    } else {
      console.log('[BO REPORTING][ZERO-DATA PROBE] Invoices exist for branch outside current date range!', {
        queriedBranchCode: branchCode,
        totalWithoutDateFilter: totalCount,
        breakdown: groupBy.map((g) => ({
          branchCode: g.branchCode,
          syncSourceCode: g.syncSourceCode,
          count: g._count.id,
          earliestDate: g._min.invoiceDate,
          latestDate: g._max.invoiceDate,
        })),
      });
    }
  } catch (probeErr) {
    console.warn('[BO REPORTING][ZERO-DATA PROBE] Probe query failed:', {
      message: probeErr?.message || null,
      code: probeErr?.code || null,
      name: probeErr?.name || null,
      meta: probeErr?.meta || null,
    });
  }
}

// ---------------------------------------------------------------------------
// 1. GET /reports/sales/summary
// ---------------------------------------------------------------------------

/**
 * Return high-level aggregated sales metrics for the selected period + filters.
 *
 * Query params:
 *   Period:  periodType, date, month, year, quarter, startDate, endDate
 *   Filters: branchCode, syncSourceCode, locationCode, locationId,
 *            userName, invoiceType, payMethod
 */
async function getSalesSummary(req, res) {
  try {
    const period = resolvePeriodOrRespond(req, res);
    if (!period) return;

    const filters = extractFilters(req.query);
    const dateRange = formatDateRange(period.startDate, period.endDate);
    const invoiceWhere = buildInvoiceWhere(period, filters);

    const data = await querySalesSummary(invoiceWhere);
    const rowsFetched = Number(data?.totalInvoices || 0);
    logReportScope('/reports/sales/summary', req, invoiceWhere, { rowsFetched });
    logLocationHistoryParity('/reports/sales/summary', req, filters, invoiceWhere, rowsFetched);

    // If zero results and a branch scope is active, fire a diagnostic probe
    if (rowsFetched === 0 && (req.query.branchCode || req.query.locationCode || req.query.locationId)) {
      _probeBranchDataAsync(req.query.branchCode || req.query.locationCode, invoiceWhere).catch(() => {});
    }

    return res.json({
      success: true,
      filters: buildResponseFilters(req.query, period),
      dateRange,
      data,
    });
  } catch (err) {
    if (handleReportingValidationError(err, res)) return;
    console.error('[REPORTING] getSalesSummary error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 2. GET /reports/sales/invoices
// ---------------------------------------------------------------------------

/**
 * Return paginated invoice rows for the selected period + filters.
 *
 * Additional query params: page, pageSize, sortBy, sortOrder
 */
async function getSalesInvoices(req, res) {
  try {
    const period = resolvePeriodOrRespond(req, res);
    if (!period) return;

    const filters = extractFilters(req.query);
    const dateRange = formatDateRange(period.startDate, period.endDate);
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, ALLOWED_INVOICE_SORT_FIELDS, 'invoiceDate', 'desc');

    if (sort.error) {
      return res.status(400).json({ success: false, error: sort.error });
    }

    const invoiceWhere = buildInvoiceWhere(period, filters);
    const { invoices, total } = await queryInvoiceList(invoiceWhere, pagination, sort);
    logReportScope('/reports/sales/invoices', req, invoiceWhere, {
      rowsFetched: Number(total || 0),
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    return res.json({
      success: true,
      filters: buildResponseFilters(req.query, period),
      dateRange,
      data: invoices,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    });
  } catch (err) {
    if (handleReportingValidationError(err, res)) return;
    console.error('[REPORTING] getSalesInvoices error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 3. GET /reports/sales/products
// ---------------------------------------------------------------------------

/**
 * Return paginated product-level aggregated rows for the selected period + filters.
 *
 * Additional query params: productCode, productName, page, pageSize, sortBy, sortOrder
 */
async function getSalesProducts(req, res) {
  try {
    const period = resolvePeriodOrRespond(req, res);
    if (!period) return;

    const filters = extractFilters(req.query);
    const dateRange = formatDateRange(period.startDate, period.endDate);
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, ALLOWED_PRODUCT_SORT_FIELDS, 'totalQuantitySold', 'desc');

    if (sort.error) {
      return res.status(400).json({ success: false, error: sort.error });
    }

    const itemWhere = buildItemWhere(period, filters);
    const { products, total } = await queryProductReport(itemWhere, pagination, sort);
    logReportScope('/reports/sales/products', req, itemWhere?.salesInvoice || {}, {
      rowsFetched: Number(total || 0),
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    logLocationHistoryParity('/reports/sales/products', req, filters, itemWhere?.salesInvoice || {}, Number(total || 0));

    return res.json({
      success: true,
      filters: buildResponseFilters(req.query, period),
      dateRange,
      data: products,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    });
  } catch (err) {
    if (handleReportingValidationError(err, res)) return;
    console.error('[REPORTING] getSalesProducts error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 4. GET /reports/sales/users
// ---------------------------------------------------------------------------

/**
 * Return paginated cashier/user-level aggregated rows for the selected period + filters.
 */
async function getSalesUsers(req, res) {
  try {
    const period = resolvePeriodOrRespond(req, res);
    if (!period) return;

    const filters = extractFilters(req.query);
    const dateRange = formatDateRange(period.startDate, period.endDate);
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, ALLOWED_USER_SORT_FIELDS, 'totalInvoices', 'desc');

    if (sort.error) {
      return res.status(400).json({ success: false, error: sort.error });
    }

    const invoiceWhere = buildInvoiceWhere(period, filters);
    const { users, total } = await queryUserReport(invoiceWhere, pagination, sort);
    logReportScope('/reports/sales/users', req, invoiceWhere, {
      rowsFetched: Number(total || 0),
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    return res.json({
      success: true,
      filters: buildResponseFilters(req.query, period),
      dateRange,
      data: users,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    });
  } catch (err) {
    if (handleReportingValidationError(err, res)) return;
    console.error('[REPORTING] getSalesUsers error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 5. GET /reports/sales/payments
// ---------------------------------------------------------------------------

/**
 * Return payment-method totals for the selected period + filters.
 * Normalises the two payMethod columns into a single ranked list.
 */
async function getSalesPayments(req, res) {
  try {
    const period = resolvePeriodOrRespond(req, res);
    if (!period) return;

    const filters = extractFilters(req.query);
    const dateRange = formatDateRange(period.startDate, period.endDate);
    const invoiceWhere = buildInvoiceWhere(period, filters);

    const payments = await queryPaymentReport(invoiceWhere);

    const totals = payments.reduce(
      (acc, p) => {
        acc.totalAmount += p.totalAmount;
        acc.invoiceCount += p.invoiceCount;
        return acc;
      },
      { totalAmount: 0, invoiceCount: 0 },
    );

    logReportScope('/reports/sales/payments', req, invoiceWhere, {
      rowsFetched: Number(payments.length || 0),
      invoiceCount: Number(totals.invoiceCount || 0),
    });

    return res.json({
      success: true,
      filters: buildResponseFilters(req.query, period),
      dateRange,
      data: payments,
      totals: {
        totalAmount: parseFloat(totals.totalAmount.toFixed(2)),
        invoiceCount: totals.invoiceCount,
      },
    });
  } catch (err) {
    if (handleReportingValidationError(err, res)) return;
    console.error('[REPORTING] getSalesPayments error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 6. GET /reports/sales/profit-latest-cost
// ---------------------------------------------------------------------------

/**
 * Return latest-GRN-cost profit analytics for the selected period + filters.
 * Preserves existing reporting endpoints and provides a dedicated analytics view.
 */
async function getSalesProfitLatestCost(req, res) {
  try {
    const period = resolvePeriodOrRespond(req, res);
    if (!period) return;

    const filters = extractFilters(req.query);
    const dateRange = formatDateRange(period.startDate, period.endDate);
    const itemWhere = buildItemWhere(period, filters);
    const data = await queryLatestCostProfitAnalytics(itemWhere, filters);
    logReportScope('/reports/sales/profit-latest-cost', req, itemWhere?.salesInvoice || {}, {
      rowsFetched: Number(data?.summary?.totalProducts || 0),
      completeProducts: Number(data?.summary?.completeProducts || 0),
      incompleteProducts: Number(data?.summary?.incompleteProducts || 0),
    });
    logLocationHistoryParity('/reports/sales/profit-latest-cost', req, filters, itemWhere?.salesInvoice || {}, Number(data?.summary?.totalProducts || 0));

    return res.json({
      success: true,
      filters: buildResponseFilters(req.query, period),
      dateRange,
      data,
    });
  } catch (err) {
    console.error('[REPORTING] getSalesProfitLatestCost error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getSalesSummary,
  getSalesInvoices,
  getSalesProducts,
  getSalesUsers,
  getSalesPayments,
  getSalesProfitLatestCost,
};
