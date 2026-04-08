import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';

const AUTO_REFRESH_MS = 300000; // 5 minutes
const AUTO_REFRESH_DEBOUNCE_MS = 350;


const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const intFmt = (value) => Number(value || 0).toLocaleString('en-US');

function startOfMonth(year, monthIndex) {
  return new Date(year, monthIndex, 1);
}

function endOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0);
}

function formatDateInput(dateValue) {
  return dateValue.toISOString().slice(0, 10);
}

function toDateSafe(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeLocationCodeFromName(name = '') {
  const normalized = String(name || '').trim().toLowerCase();
  if (normalized === 'blantyre') return 'BT';
  if (normalized === 'zomba') return 'ZA';
  return null;
}

function parseInvoiceDate(invoice) {
  return toDateSafe(invoice?.invoiceDate || invoice?.invoiceTime || invoice?.createdAt);
}

function withinRange(dateValue, startDate, endDate) {
  const date = toDateSafe(dateValue);
  if (!date) return false;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  return date >= start && date <= end;
}

function computeGrowth(currentValue, previousValue) {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);
  const absolute = current - previous;

  if (previous === 0) {
    return {
      current,
      previous,
      absolute,
      percent: current === 0 ? 0 : 100,
      direction: absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat',
    };
  }

  const percent = (absolute / previous) * 100;
  return {
    current,
    previous,
    absolute,
    percent,
    direction: absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat',
  };
}

function growthTone(delta) {
  if (delta.direction === 'up') return { color: '#166534', bg: '#dcfce7', icon: 'fa-arrow-trend-up' };
  if (delta.direction === 'down') return { color: '#b91c1c', bg: '#fee2e2', icon: 'fa-arrow-trend-down' };
  return { color: '#475569', bg: '#e2e8f0', icon: 'fa-minus' };
}

function buildParamsForPeriod(period) {
  const base = {};
  if (period.periodType === 'month') {
    base.periodType = 'month';
    base.month = String(period.month);
    base.year = String(period.year);
  } else if (period.periodType === 'quarter') {
    base.periodType = 'quarter';
    base.quarter = String(period.quarter);
    base.year = String(period.year);
  } else if (period.periodType === 'year') {
    base.periodType = 'year';
    base.year = String(period.year);
  } else {
    base.periodType = 'custom';
    base.startDate = period.startDate;
    base.endDate = period.endDate;
  }
  return base;
}

function withScope(params, scope, locations) {
  const scoped = { ...params };
  if (scope === 'all') return scoped;

  if (String(scope).startsWith('code:')) {
    scoped.locationCode = String(scope).slice(5).trim().toUpperCase();
    return scoped;
  }

  const location = locations.find((row) => String(row.id) === String(scope));
  if (location?.id) scoped.locationId = Number(location.id);
  if (!location?.id) {
    const locationCode = location?.code || normalizeLocationCodeFromName(location?.name || '');
    if (locationCode) scoped.locationCode = locationCode;
  }
  return scoped;
}

function getCurrentMonthPeriod() {
  const now = new Date();
  return {
    periodType: 'month',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function getCurrentYearPeriod() {
  const now = new Date();
  return {
    periodType: 'year',
    year: now.getFullYear(),
  };
}

function previousPeriod(period) {
  if (period.periodType === 'month') {
    const previousMonthIndex = Number(period.month) - 2;
    const previousDate = new Date(Number(period.year), previousMonthIndex, 1);
    return {
      periodType: 'month',
      month: previousDate.getMonth() + 1,
      year: previousDate.getFullYear(),
    };
  }

  if (period.periodType === 'quarter') {
    const quarter = Number(period.quarter || 1);
    const year = Number(period.year);
    if (quarter > 1) {
      return { periodType: 'quarter', quarter: quarter - 1, year };
    }
    return { periodType: 'quarter', quarter: 4, year: year - 1 };
  }

  if (period.periodType === 'year') {
    return { periodType: 'year', year: Number(period.year) - 1 };
  }

  const start = new Date(`${period.startDate}T00:00:00`);
  const end = new Date(`${period.endDate}T23:59:59`);
  const spanMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const previousStart = new Date(previousEnd.getTime() - spanMs);
  return {
    periodType: 'custom',
    startDate: formatDateInput(previousStart),
    endDate: formatDateInput(previousEnd),
  };
}

function dateRangeFromPeriod(period) {
  if (period.periodType === 'month') {
    const start = startOfMonth(Number(period.year), Number(period.month) - 1);
    const end = endOfMonth(Number(period.year), Number(period.month) - 1);
    return {
      startDate: formatDateInput(start),
      endDate: formatDateInput(end),
      label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    };
  }

  if (period.periodType === 'quarter') {
    const year = Number(period.year);
    const quarter = Number(period.quarter);
    const startMonth = (quarter - 1) * 3;
    const start = startOfMonth(year, startMonth);
    const end = endOfMonth(year, startMonth + 2);
    return {
      startDate: formatDateInput(start),
      endDate: formatDateInput(end),
      label: `Q${quarter} ${year}`,
    };
  }

  if (period.periodType === 'year') {
    const year = Number(period.year);
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      label: String(year),
    };
  }

  return {
    startDate: period.startDate,
    endDate: period.endDate,
    label: `${period.startDate} to ${period.endDate}`,
  };
}

const BusinessAnalyticsTab = ({
  selectedLocationId = null,
  selectedLocationCode = '',
  locations = [],
}) => {
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const now = new Date();
  const [scope, setScope] = useState('inherit');
  const [filters, setFilters] = useState({
    periodType: 'month',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
    startDate: formatDateInput(startOfMonth(now.getFullYear(), now.getMonth())),
    endDate: formatDateInput(endOfMonth(now.getFullYear(), now.getMonth())),
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [activeView, setActiveView] = useState('overview');

  const refreshIntervalRef = useRef(null);
  const refreshTimeoutRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const effectiveScope = useMemo(() => {
    if (scope === 'inherit') {
      return selectedLocationId ? String(selectedLocationId) : 'all';
    }
    return scope;
  }, [scope, selectedLocationId]);

  const scopeLabel = useMemo(() => {
    if (scope === 'inherit') {
      if (!selectedLocationId) return 'All Locations (inherits BO scope)';
      const inherited = locations.find((row) => Number(row.id) === Number(selectedLocationId));
      if (inherited) return `${inherited.name} (inherits BO scope)`;
      return selectedLocationCode ? `${selectedLocationCode} (inherits BO scope)` : 'Selected BO scope';
    }

    if (scope === 'all') return 'All Locations';
    const selected = locations.find((row) => String(row.id) === String(scope));
    return selected ? selected.name : 'Selected location';
  }, [locations, scope, selectedLocationId]);

  const selectedPeriod = useMemo(() => {
    const period = {
      periodType: filters.periodType,
      month: Number(filters.month),
      year: Number(filters.year),
      quarter: Number(filters.quarter),
      startDate: filters.startDate,
      endDate: filters.endDate,
    };
    return period;
  }, [filters]);

  const selectedDateRange = useMemo(() => dateRangeFromPeriod(selectedPeriod), [selectedPeriod]);

  const computeAnalytics = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    setError('');
    setRefreshing(true);

    const shouldShowLoading = !hasLoadedOnceRef.current;
    if (shouldShowLoading) setLoading(true);

    try {
      const now = new Date();
      const thisYear = now.getFullYear();

      const periodParams = withScope(buildParamsForPeriod(selectedPeriod), effectiveScope, locations);
      const prevPeriodParams = withScope(buildParamsForPeriod(previousPeriod(selectedPeriod)), effectiveScope, locations);
      const monthParams = withScope(buildParamsForPeriod(getCurrentMonthPeriod()), effectiveScope, locations);
      const prevMonthParams = withScope(buildParamsForPeriod(previousPeriod(getCurrentMonthPeriod())), effectiveScope, locations);
      const yearParams = withScope(buildParamsForPeriod(getCurrentYearPeriod()), effectiveScope, locations);
      const prevYearParams = withScope(buildParamsForPeriod(previousPeriod(getCurrentYearPeriod())), effectiveScope, locations);

      // Last 12 months for monthly trend
      const last12Months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(thisYear, now.getMonth() - (11 - i), 1);
        return { periodType: 'month', month: d.getMonth() + 1, year: d.getFullYear() };
      });

      // Last 5 years for yearly trend
      const last5Years = Array.from({ length: 5 }, (_, i) => ({ periodType: 'year', year: thisYear - (4 - i) }));

      // Q1-Q4 for quarterly trend
      const quarters = [1, 2, 3, 4].map((q) => ({ periodType: 'quarter', quarter: q, year: thisYear }));

      // Daily trend: only for spans ≤ 62 days (month/short custom)
      const selRange = dateRangeFromPeriod(selectedPeriod);
      const spanDays = Math.round((new Date(selRange.endDate) - new Date(selRange.startDate)) / 86400000) + 1;
      const dailyPeriods = spanDays <= 62
        ? Array.from({ length: spanDays }, (_, i) => {
            const d = new Date(`${selRange.startDate}T00:00:00`);
            d.setDate(d.getDate() + i);
            const ds = formatDateInput(d);
            return { periodType: 'custom', startDate: ds, endDate: ds };
          })
        : [];

      // Branch summaries (BT + ZA)
      const branchCodes = ['BT', 'ZA'];

      // Slot indices in the flat allResponses array
      const FIXED = 8; // 6 summaries + products + users
      const MONTHLY_SLICE = [FIXED, FIXED + 12];
      const YEARLY_SLICE = [FIXED + 12, FIXED + 17];
      const QUARTERLY_SLICE = [FIXED + 17, FIXED + 21];
      const DAILY_SLICE = [FIXED + 21, FIXED + 21 + dailyPeriods.length];
      const BRANCH_SLICE = [FIXED + 21 + dailyPeriods.length, FIXED + 21 + dailyPeriods.length + branchCodes.length];

      const allResponses = await Promise.all([
        // 0-5: fixed period summaries
        api.get('/business-operations/reports/sales/summary', { params: periodParams }),
        api.get('/business-operations/reports/sales/summary', { params: prevPeriodParams }),
        api.get('/business-operations/reports/sales/summary', { params: monthParams }),
        api.get('/business-operations/reports/sales/summary', { params: prevMonthParams }),
        api.get('/business-operations/reports/sales/summary', { params: yearParams }),
        api.get('/business-operations/reports/sales/summary', { params: prevYearParams }),
        // 6: products
        api.get('/business-operations/reports/sales/products', { params: { ...periodParams, page: 1, pageSize: 12, sortBy: 'totalSales', sortOrder: 'desc' } }),
        // 7: users
        api.get('/business-operations/reports/sales/users', { params: { ...periodParams, page: 1, pageSize: 10, sortBy: 'totalSales', sortOrder: 'desc' } }),
        // 8..19: monthly trend (12 summary calls)
        ...last12Months.map((p) => api.get('/business-operations/reports/sales/summary', { params: withScope(buildParamsForPeriod(p), effectiveScope, locations) })),
        // 20..24: yearly trend (5 summary calls)
        ...last5Years.map((p) => api.get('/business-operations/reports/sales/summary', { params: withScope(buildParamsForPeriod(p), effectiveScope, locations) })),
        // 25..28: quarterly trend (4 summary calls)
        ...quarters.map((p) => api.get('/business-operations/reports/sales/summary', { params: withScope(buildParamsForPeriod(p), effectiveScope, locations) })),
        // 29..29+N: daily trend (0-62 summary calls, only for short periods)
        ...dailyPeriods.map((p) => api.get('/business-operations/reports/sales/summary', { params: withScope(buildParamsForPeriod(p), effectiveScope, locations) })),
        // last 2: branch summaries (BT, ZA)
        ...branchCodes.map((code) => api.get('/business-operations/reports/sales/summary', { params: withScope({ ...periodParams }, `code:${code}`, locations) })),
      ]);

      const currentSummary = allResponses[0]?.data?.data || {};
      const previousSummary = allResponses[1]?.data?.data || {};
      const currentMonthSummary = allResponses[2]?.data?.data || {};
      const previousMonthSummary = allResponses[3]?.data?.data || {};
      const currentYearSummary = allResponses[4]?.data?.data || {};
      const previousYearSummary = allResponses[5]?.data?.data || {};
      const productRows = Array.isArray(allResponses[6]?.data?.data) ? allResponses[6].data.data : [];
      const userRows = Array.isArray(allResponses[7]?.data?.data) ? allResponses[7].data.data : [];

      const totalSales = Number(currentSummary.netSales || 0);
      const invoiceCount = Number(currentSummary.totalInvoices || 0);
      const averageBasketValue = invoiceCount > 0 ? totalSales / invoiceCount : 0;
      const prevSales = Number(previousSummary.netSales || 0);
      const prevInvoices = Number(previousSummary.totalInvoices || 0);
      const prevAvgBasket = prevInvoices > 0 ? prevSales / prevInvoices : 0;

      const selectedPeriodGrowth = {
        sales: computeGrowth(totalSales, prevSales),
        invoices: computeGrowth(invoiceCount, prevInvoices),
        basket: computeGrowth(averageBasketValue, prevAvgBasket),
      };
      const monthGrowth = computeGrowth(Number(currentMonthSummary.netSales || 0), Number(previousMonthSummary.netSales || 0));
      const yearGrowth = computeGrowth(Number(currentYearSummary.netSales || 0), Number(previousYearSummary.netSales || 0));

      // Monthly trend from summary slices
      const monthlyTrend = last12Months.map((p, i) => {
        const s = allResponses[MONTHLY_SLICE[0] + i]?.data?.data || {};
        const d = new Date(p.year, p.month - 1, 1);
        return {
          key: `${p.year}-${String(p.month).padStart(2, '0')}`,
          label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
          sales: Number(s.netSales || 0),
          invoices: Number(s.totalInvoices || 0),
          rolling3MonthSales: 0,
        };
      });
      for (let idx = 0; idx < monthlyTrend.length; idx += 1) {
        const from = Math.max(0, idx - 2);
        const chunk = monthlyTrend.slice(from, idx + 1);
        monthlyTrend[idx].rolling3MonthSales = chunk.reduce((sum, r) => sum + r.sales, 0) / chunk.length;
      }

      // Yearly trend
      const yearlyComparison = last5Years.map((p, i) => {
        const s = allResponses[YEARLY_SLICE[0] + i]?.data?.data || {};
        return { year: String(p.year), sales: Number(s.netSales || 0), invoices: Number(s.totalInvoices || 0) };
      });

      // Quarterly trend
      const quarterlySummary = quarters.map((p, i) => {
        const s = allResponses[QUARTERLY_SLICE[0] + i]?.data?.data || {};
        return { quarter: `Q${p.quarter}`, sales: Number(s.netSales || 0), invoices: Number(s.totalInvoices || 0) };
      });

      // Daily trend (only populated for short spans)
      const dailyTrend = dailyPeriods.map((p, i) => {
        const s = allResponses[DAILY_SLICE[0] + i]?.data?.data || {};
        return { day: p.startDate, sales: Number(s.netSales || 0), invoices: Number(s.totalInvoices || 0) };
      });

      // Branch performance from location-scoped summaries
      const branchPerformance = branchCodes
        .map((code, i) => {
          const s = allResponses[BRANCH_SLICE[0] + i]?.data?.data || {};
          const bSales = Number(s.netSales || 0);
          const bInvoices = Number(s.totalInvoices || 0);
          return {
            code,
            sales: bSales,
            invoices: bInvoices,
            averageBasket: bInvoices > 0 ? bSales / bInvoices : 0,
            contributionShare: totalSales > 0 ? (bSales / totalSales) * 100 : 0,
          };
        })
        .filter((b) => b.sales > 0);

      // Rankings from product/user API responses
      const categoryMap = productRows.reduce((acc, row) => {
        const key = String(row.category || row.categoryName || row.productCategory || 'Uncategorized').trim() || 'Uncategorized';
        const entry = acc.get(key) || { category: key, sales: 0, quantity: 0 };
        entry.sales += Number(row.totalSales || 0);
        entry.quantity += Number(row.totalQuantitySold || 0);
        acc.set(key, entry);
        return acc;
      }, new Map());

      const topCategories = Array.from(categoryMap.values())
        .map((row) => ({ ...row, contributionShare: totalSales > 0 ? (row.sales / totalSales) * 100 : 0 }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 8);

      const topProducts = productRows
        .map((row) => ({
          productCode: row.productCode || 'N/A',
          productName: row.productName || 'Unnamed product',
          totalSales: Number(row.totalSales || 0),
          totalQuantity: Number(row.totalQuantitySold || 0),
          contributionShare: totalSales > 0 ? (Number(row.totalSales || 0) / totalSales) * 100 : 0,
        }))
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 10);

      const topUsers = userRows
        .map((row) => ({
          userName: row.userName || 'Unknown',
          totalSales: Number(row.totalSales || 0),
          totalInvoices: Number(row.totalInvoices || 0),
          averageInvoiceValue: Number(row.averageInvoiceValue || 0),
        }))
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 10);

      setAnalytics({
        periodLabel: selectedDateRange.label,
        scopeLabel,
        kpis: { totalSales, invoiceCount, averageBasketValue, topProductsCount: topProducts.length },
        growth: { selected: selectedPeriodGrowth, monthVsPrevious: monthGrowth, yearVsPrevious: yearGrowth },
        trends: { daily: dailyTrend, monthly: monthlyTrend, yearly: yearlyComparison, quarterly: quarterlySummary },
        rankings: { topProducts, topCategories, topUsers, branchPerformance },
      });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load analytics.');
    } finally {
      setRefreshing(false);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      refreshInFlightRef.current = false;
    }
  }, [effectiveScope, locations, scopeLabel, selectedDateRange.label, selectedPeriod]);

  useEffect(() => {
    computeAnalytics();
  }, [computeAnalytics]);

  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      computeAnalytics();
    }, AUTO_REFRESH_MS);

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        computeAnalytics();
      }, AUTO_REFRESH_DEBOUNCE_MS);
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', scheduleRefresh);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', scheduleRefresh);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [computeAnalytics]);

  const locationOptions = useMemo(() => {
    const rows = (locations || []).map((row) => ({ id: String(row.id), label: row.name }));
    if (!rows.find((row) => row.label.toLowerCase() === 'blantyre')) {
      rows.push({ id: 'code:BT', label: 'Blantyre' });
    }
    if (!rows.find((row) => row.label.toLowerCase() === 'zomba')) {
      rows.push({ id: 'code:ZA', label: 'Zomba' });
    }
    return rows;
  }, [locations]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.12rem' }}>Business Analytics & Performance</h3>
            <p style={{ margin: '0.38rem 0 0', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Growth tracking, performance trends, and contribution insights by period, branch, category, and team.
            </p>
          </div>
          <div style={{ color: refreshing ? '#2563eb' : '#64748b', fontSize: '0.84rem', fontWeight: 700 }}>
            {refreshing ? 'Auto-refreshing...' : 'Auto-refresh every 5 min'}
          </div>
        </div>

        <div style={{ marginTop: '0.85rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.7rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Period Type</span>
            <select value={filters.periodType} onChange={(event) => setFilters((prev) => ({ ...prev, periodType: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem', backgroundColor: '#fff', color: '#0f172a' }}>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </label>

          {(filters.periodType === 'month' || filters.periodType === 'quarter') && (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Year</span>
              <input type="number" value={filters.year} onChange={(event) => setFilters((prev) => ({ ...prev, year: Number(event.target.value || new Date().getFullYear()) }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }} />
            </label>
          )}

          {filters.periodType === 'month' && (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Month</span>
              <select value={filters.month} onChange={(event) => setFilters((prev) => ({ ...prev, month: Number(event.target.value) }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <option key={month} value={month}>{new Date(2026, month - 1, 1).toLocaleDateString('en-GB', { month: 'long' })}</option>
                ))}
              </select>
            </label>
          )}

          {filters.periodType === 'quarter' && (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Quarter</span>
              <select value={filters.quarter} onChange={(event) => setFilters((prev) => ({ ...prev, quarter: Number(event.target.value) }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }}>
                <option value={1}>Q1</option>
                <option value={2}>Q2</option>
                <option value={3}>Q3</option>
                <option value={4}>Q4</option>
              </select>
            </label>
          )}

          {filters.periodType === 'custom' && (
            <>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Start Date</span>
                <input type="date" value={filters.startDate} onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }} />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>End Date</span>
                <input type="date" value={filters.endDate} onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }} />
              </label>
            </>
          )}

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Branch Scope</span>
            <select value={scope} onChange={(event) => setScope(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }}>
              <option value="inherit">Inherit BO Scope</option>
              <option value="all">All Branches</option>
              {locationOptions.map((row) => (
                <option key={row.id} value={row.id}>{row.label}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={computeAnalytics}
            style={{ alignSelf: 'end', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '9px', padding: '0.55rem 0.78rem', fontWeight: 700, cursor: 'pointer' }}
          >
            <i className={`fas ${refreshing ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.4rem' }}></i>
            Refresh Analytics
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...cardStyle, padding: '0.95rem 1.05rem', borderColor: '#fecaca', backgroundColor: '#fff1f2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {!loading && analytics && (
        <>
          <div style={{ ...cardStyle, padding: '0.7rem 0.8rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'trends', label: 'Trends' },
                { id: 'rankings', label: 'Rankings' },
              ].map((view) => {
                const isActive = activeView === view.id;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    style={{
                      border: isActive ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                      backgroundColor: isActive ? '#dbeafe' : '#fff',
                      color: isActive ? '#1d4ed8' : '#334155',
                      borderRadius: '999px',
                      padding: '0.34rem 0.7rem',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    {view.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <strong style={{ color: '#0f172a' }}>Growth Overview</strong>
              <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{analytics.periodLabel} • {analytics.scopeLabel}</span>
            </div>

            <div style={{ marginTop: '0.85rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {[
                { label: 'Period Sales Growth', value: analytics.growth.selected.sales, format: money },
                { label: 'Period Invoice Growth', value: analytics.growth.selected.invoices, format: intFmt },
                { label: 'Period Basket Growth', value: analytics.growth.selected.basket, format: money },
                { label: 'Month vs Previous', value: analytics.growth.monthVsPrevious, format: money },
                { label: 'Year vs Previous', value: analytics.growth.yearVsPrevious, format: money },
              ].map((item) => {
                const tone = growthTone(item.value);
                return (
                  <div key={item.label} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.8rem 0.9rem', backgroundColor: '#fff' }}>
                    <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>{item.label}</div>
                    <div style={{ marginTop: '0.35rem', color: '#0f172a', fontWeight: 800, fontSize: '1rem' }}>
                      {item.format(item.value.current)}
                    </div>
                    <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.82rem' }}>
                      Previous: {item.format(item.value.previous)}
                    </div>
                    <span style={{ marginTop: '0.45rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem', borderRadius: '999px', backgroundColor: tone.bg, color: tone.color, fontSize: '0.78rem', fontWeight: 800 }}>
                      <i className={`fas ${tone.icon}`}></i>
                      {item.value.percent.toFixed(1)}% • {item.value.absolute >= 0 ? '+' : ''}{item.format(item.value.absolute)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {[
              { label: 'Total Sales', value: money(analytics.kpis.totalSales), note: 'Net sales in selected scope.' },
              { label: 'Invoice Count', value: intFmt(analytics.kpis.invoiceCount), note: 'Invoices in selected period.' },
              { label: 'Avg Basket Value', value: money(analytics.kpis.averageBasketValue), note: 'Average order/invoice value.' },
              { label: 'Tracked Top Products', value: intFmt(analytics.kpis.topProductsCount), note: 'Products ranked by sales.' },
            ].map((kpi) => (
              <div key={kpi.label} style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>{kpi.label}</div>
                <div style={{ marginTop: '0.32rem', color: '#0f172a', fontWeight: 900, fontSize: '1.2rem' }}>{kpi.value}</div>
                <div style={{ marginTop: '0.26rem', color: '#64748b', fontSize: '0.8rem' }}>{kpi.note}</div>
              </div>
            ))}
          </div>

          {activeView === 'overview' && (
            <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
              <strong style={{ color: '#0f172a' }}>Quick Health Summary</strong>
              <p style={{ margin: '0.32rem 0 0.7rem', color: '#64748b', fontSize: '0.84rem' }}>
                Compact snapshot of growth and current period performance.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>Period Sales Change</div>
                  <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.15rem' }}>
                    {analytics.growth.selected.sales.percent.toFixed(1)}% ({money(analytics.growth.selected.sales.absolute)})
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>Period Invoice Change</div>
                  <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.15rem' }}>
                    {analytics.growth.selected.invoices.percent.toFixed(1)}% ({intFmt(analytics.growth.selected.invoices.absolute)})
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>Month vs Previous</div>
                  <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.15rem' }}>
                    {analytics.growth.monthVsPrevious.percent.toFixed(1)}% ({money(analytics.growth.monthVsPrevious.absolute)})
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>Year vs Previous</div>
                  <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.15rem' }}>
                    {analytics.growth.yearVsPrevious.percent.toFixed(1)}% ({money(analytics.growth.yearVsPrevious.absolute)})
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === 'trends' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.8rem' }}>
              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Daily Trend</strong>
                <p style={{ margin: '0.32rem 0 0.6rem', color: '#64748b', fontSize: '0.84rem' }}>Sales and invoice cadence over the selected period.</p>
                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'grid', gap: '0.4rem' }}>
                  {analytics.trends.daily.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.86rem' }}>No daily trend data in this range.</div>
                  ) : analytics.trends.daily.map((row) => (
                    <div key={row.day} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto auto', alignItems: 'center', gap: '0.6rem', border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{row.day}</div>
                      <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, analytics.kpis.totalSales > 0 ? (row.sales / analytics.kpis.totalSales) * 100 : 0)}%`, height: '100%', backgroundColor: '#2563eb' }}></div>
                      </div>
                      <div style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Monthly + Rolling Trend (12M)</strong>
                <p style={{ margin: '0.32rem 0 0.6rem', color: '#64748b', fontSize: '0.84rem' }}>Month-on-month sales with rolling 3-month smoothing.</p>
                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'grid', gap: '0.4rem' }}>
                  {analytics.trends.monthly.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.86rem' }}>No monthly trend data available.</div>
                  ) : analytics.trends.monthly.map((row) => (
                    <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '120px auto auto auto', gap: '0.6rem', alignItems: 'center', border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{row.label}</div>
                      <div style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv</div>
                      <div style={{ color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 700 }}>Rolling: {money(row.rolling3MonthSales)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeView === 'trends' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.8rem' }}>
              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Yearly Comparison</strong>
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.42rem' }}>
                  {analytics.trends.yearly.map((row) => (
                    <div key={row.year} style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto auto', gap: '0.5rem', alignItems: 'center', border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.42rem 0.52rem' }}>
                      <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{row.year}</div>
                      <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, analytics.kpis.totalSales > 0 ? (row.sales / analytics.kpis.totalSales) * 100 : 0)}%`, height: '100%', backgroundColor: '#0ea5e9' }}></div>
                      </div>
                      <div style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Quarterly Summary ({new Date().getFullYear()})</strong>
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.42rem' }}>
                  {analytics.trends.quarterly.map((row) => (
                    <div key={row.quarter} style={{ display: 'grid', gridTemplateColumns: '52px auto auto', gap: '0.6rem', alignItems: 'center', border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{row.quarter}</div>
                      <div style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeView === 'rankings' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.8rem' }}>
              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Top Products</strong>
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.45rem' }}>
                  {analytics.rankings.topProducts.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.86rem' }}>No product contribution data available.</div>
                  ) : analytics.rankings.topProducts.map((row, index) => (
                    <div key={`${row.productCode}-${index}`} style={{ border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 700 }}>{index + 1}. {row.productName}</div>
                      <div style={{ marginTop: '0.2rem', color: '#64748b', fontSize: '0.78rem' }}>{row.productCode} • {intFmt(row.totalQuantity)} qty</div>
                      <div style={{ marginTop: '0.18rem', color: '#1e293b', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.totalSales)} • {row.contributionShare.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Top Categories</strong>
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.45rem' }}>
                  {analytics.rankings.topCategories.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.86rem' }}>No category aggregation found.</div>
                  ) : analytics.rankings.topCategories.map((row, index) => (
                    <div key={`${row.category}-${index}`} style={{ border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 700 }}>{index + 1}. {row.category}</div>
                      <div style={{ marginTop: '0.2rem', color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.quantity)} qty</div>
                      <div style={{ marginTop: '0.18rem', color: '#1e293b', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)} • {row.contributionShare.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Branch Performance</strong>
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.45rem' }}>
                  {analytics.rankings.branchPerformance.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.86rem' }}>No branch/location sales rows in this period.</div>
                  ) : analytics.rankings.branchPerformance.map((row, index) => (
                    <div key={`${row.code}-${index}`} style={{ border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 700 }}>{row.code}</div>
                      <div style={{ marginTop: '0.2rem', color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv • Avg Basket {money(row.averageBasket)}</div>
                      <div style={{ marginTop: '0.18rem', color: '#1e293b', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)} • {row.contributionShare.toFixed(1)}% share</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeView === 'rankings' && (
            <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
            <strong style={{ color: '#0f172a' }}>Cashier/User Performance</strong>
            <div style={{ marginTop: '0.6rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.7rem', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.78rem' }}>User</th>
                    <th style={{ textAlign: 'left', padding: '0.7rem', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.78rem' }}>Invoices</th>
                    <th style={{ textAlign: 'left', padding: '0.7rem', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.78rem' }}>Total Sales</th>
                    <th style={{ textAlign: 'left', padding: '0.7rem', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.78rem' }}>Avg Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.rankings.topUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '0.8rem', color: '#94a3b8' }}>No user performance rows available.</td>
                    </tr>
                  ) : analytics.rankings.topUsers.map((row, index) => (
                    <tr key={`${row.userName}-${index}`}>
                      <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', color: '#0f172a', fontWeight: 700 }}>{row.userName}</td>
                      <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', color: '#334155' }}>{intFmt(row.totalInvoices)}</td>
                      <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', color: '#334155' }}>{money(row.totalSales)}</td>
                      <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', color: '#334155' }}>{money(row.averageInvoiceValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </>
      )}

      {loading && (
        <div style={{ ...cardStyle, padding: '1rem 1.1rem', color: isAdminDarkTheme ? '#b2c3d9' : '#64748b' }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.45rem' }}></i>
          Loading business analytics...
        </div>
      )}
    </div>
  );
};

export default BusinessAnalyticsTab;