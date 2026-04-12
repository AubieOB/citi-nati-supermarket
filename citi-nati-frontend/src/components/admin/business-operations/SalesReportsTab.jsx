import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport, downloadFullBusinessWorkbook, importFullBusinessWorkbook } from '../../../utils/exportService.js';
import { exportActiveSalesReportPdf } from '../../../utils/salesReportsPdfExport.js';
import { boAlert, boConfirm } from '../../../utils/boDialogBus.js';
import SalesReportFilters from './SalesReportFilters.jsx';
import SalesSummaryCards from './SalesSummaryCards.jsx';

const REPORT_VIEWS = [
  { id: 'summary', label: 'Summary', icon: 'fa-chart-pie' },
  { id: 'invoices', label: 'Sales by Invoice', icon: 'fa-receipt' },
  { id: 'products', label: 'Sales by Product', icon: 'fa-cubes' },
  { id: 'users', label: 'Sales by User', icon: 'fa-users' },
  { id: 'payments', label: 'Sales by Payment', icon: 'fa-wallet' },
];

const SALES_BY_CARDS = [
  {
    id: 'invoices',
    title: 'Sales by Invoice',
    subtitle: 'Invoice-level sales, discounts, taxes, and payment split.',
    icon: 'fa-receipt',
    tone: '#0369a1',
  },
  {
    id: 'products',
    title: 'Sales by Product',
    subtitle: 'Product movement, revenue contribution, and margins.',
    icon: 'fa-cubes',
    tone: '#166534',
  },
  {
    id: 'users',
    title: 'Sales by User',
    subtitle: 'Cashier performance, invoice throughput, and value.',
    icon: 'fa-users',
    tone: '#7c3aed',
  },
  {
    id: 'payments',
    title: 'Sales by Payment',
    subtitle: 'Payment method mix and amount concentration.',
    icon: 'fa-wallet',
    tone: '#b45309',
  },
];

const baseCardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
};

const thStyle = {
  textAlign: 'left',
  padding: '0.85rem 0.9rem',
  color: '#475569',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const tdStyle = {
  padding: '0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
};

const localDateKey = (dateValue = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
};

const DEFAULT_FILTERS = {
  periodType: 'month',
  date: localDateKey(new Date()),
  month: String(new Date().getMonth() + 1),
  year: String(new Date().getFullYear()),
  quarter: String(Math.floor(new Date().getMonth() / 3) + 1),
  startDate: '',
  endDate: '',
  branchCode: '',
  syncSourceCode: '',
  locationCode: '',
  locationId: '',
  userName: '',
  productCode: '',
  productName: '',
  payMethod: '',
  invoiceType: '',
};

const DEFAULT_VIEW_STATE = {
  invoices: { page: 1, pageSize: 20, sortBy: 'invoiceDate', sortOrder: 'desc' },
  products: { page: 1, pageSize: 20, sortBy: 'totalQuantitySold', sortOrder: 'desc' },
  users: { page: 1, pageSize: 20, sortBy: 'totalInvoices', sortOrder: 'desc' },
};

const AUTO_REFRESH_MS = 30000;
const AUTO_REFRESH_DEBOUNCE_MS = 350;

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const integer = (value) => Number(value || 0).toLocaleString('en-US');

const sectionTabStyle = (active) => ({
  border: 'none',
  backgroundColor: active ? '#0f172a' : '#e2e8f0',
  color: active ? '#fff' : '#334155',
  borderRadius: '999px',
  padding: '0.65rem 0.95rem',
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
});

const viewButtonStyle = (direction) => ({
  border: '1px solid #cbd5e1',
  backgroundColor: '#fff',
  color: '#0f172a',
  borderRadius: '10px',
  padding: '0.55rem 0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
  opacity: direction ? 1 : 0.6,
});

const navigationTabStyle = (active, isDark) => ({
  border: isDark ? '1px solid #333333' : '1px solid #d5deeb',
  background: active
    ? (isDark ? 'linear-gradient(135deg, #2a2a2a 0%, #353535 100%)' : 'linear-gradient(135deg, #1e3a5f 0%, #2f67a8 100%)')
    : (isDark ? '#1e1e1e' : '#e2e8f0'),
  color: active ? '#f5f5f5' : (isDark ? '#c7c7c7' : '#334155'),
  borderRadius: '999px',
  padding: '0.65rem 0.95rem',
  fontSize: '0.88rem',
  fontWeight: active ? 800 : 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
  boxShadow: active ? (isDark ? '0 10px 24px rgba(0, 0, 0, 0.42)' : '0 10px 22px rgba(47, 103, 168, 0.28)') : 'none',
});

function compactParams(filters) {
  return Object.entries(filters).reduce((acc, [key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function buildReportParams(filters, extras = {}) {
  return compactParams({ ...filters, ...extras });
}

function statusMessage(type) {
  if (type === 'invoices') return 'No invoices matched the selected filters.';
  if (type === 'products') return 'No product aggregates matched the selected filters.';
  if (type === 'users') return 'No user aggregates matched the selected filters.';
  if (type === 'payments') return 'No payment activity matched the selected filters.';
  return 'No report data matched the selected filters.';
}

const EmptyState = ({ message }) => (
  <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>{message}</div>
);

const ErrorState = ({ message }) => (
  <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
    {message}
  </div>
);

const SalesReportsTab = ({ drilldownRequest = null, selectedLocationId = null, selectedLocationCode = '' }) => {
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isReportModalMaximized, setIsReportModalMaximized] = useState(false);
  const [showSummaryFilters, setShowSummaryFilters] = useState(false);
  const [showWorkspaceFilters, setShowWorkspaceFilters] = useState(false);
  const [activeSection, setActiveSection] = useState('summary');
  const [activeView, setActiveView] = useState('summary');
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);

  const [summary, setSummary] = useState(null);
  const [summaryMeta, setSummaryMeta] = useState({ filters: {}, dateRange: null });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [profitSummary, setProfitSummary] = useState(null);
  const [profitSummaryLoading, setProfitSummaryLoading] = useState(false);

  const [invoicesState, setInvoicesState] = useState({ data: [], pagination: null, loading: false, error: '' });
  const [productsState, setProductsState] = useState({ data: [], pagination: null, loading: false, error: '' });
  const [usersState, setUsersState] = useState({ data: [], pagination: null, loading: false, error: '' });
  const [paymentsState, setPaymentsState] = useState({ data: [], totals: null, loading: false, error: '' });
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingFullWorkbook, setExportingFullWorkbook] = useState(false);
  const [importingFullWorkbook, setImportingFullWorkbook] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const fullWorkbookInputRef = useRef(null);
  const autoRefreshIntervalRef = useRef(null);
  const autoRefreshTimeoutRef = useRef(null);

  const queryKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    if (!drilldownRequest?.token) return;

    setFilters((prev) => {
      const periodType = drilldownRequest.periodType === 'custom' ? 'custom' : 'month';
      return {
        ...prev,
        periodType,
        month: periodType === 'month' ? String(drilldownRequest.month || prev.month) : prev.month,
        year: periodType === 'month' ? String(drilldownRequest.year || prev.year) : prev.year,
        startDate: periodType === 'custom' ? String(drilldownRequest.startDate || '') : '',
        endDate: periodType === 'custom' ? String(drilldownRequest.endDate || '') : '',
        locationCode: String(drilldownRequest.locationCode || ''),
        locationId: '',
      };
    });

    setViewState(DEFAULT_VIEW_STATE);
    setActiveSection('summary');
    setActiveView('summary');
  }, [drilldownRequest]);

  useEffect(() => {
    setFilters((prev) => {
      const nextLocationId = selectedLocationId ? String(selectedLocationId) : '';
      const nextLocationCode = selectedLocationId ? String(selectedLocationCode || '').trim().toUpperCase() : '';
      if (prev.locationId === nextLocationId && prev.locationCode === nextLocationCode) return prev;
      return {
        ...prev,
        locationId: nextLocationId,
        locationCode: nextLocationCode,
      };
    });
    setViewState(DEFAULT_VIEW_STATE);
  }, [selectedLocationCode, selectedLocationId]);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'periodType') {
        if (value !== 'custom') {
          next.startDate = '';
          next.endDate = '';
        }
      }
      return next;
    });
    setViewState(DEFAULT_VIEW_STATE);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      ...DEFAULT_FILTERS,
      locationId: selectedLocationId ? String(selectedLocationId) : '',
      locationCode: selectedLocationId ? String(selectedLocationCode || '').trim().toUpperCase() : '',
    });
    setViewState(DEFAULT_VIEW_STATE);
  }, [selectedLocationCode, selectedLocationId]);

  const updateViewSort = useCallback((view, sortBy) => {
    setViewState((prev) => {
      const current = prev[view];
      const nextSortOrder = current.sortBy === sortBy && current.sortOrder === 'desc' ? 'asc' : 'desc';
      return {
        ...prev,
        [view]: {
          ...current,
          page: 1,
          sortBy,
          sortOrder: nextSortOrder,
        },
      };
    });
  }, []);

  const updatePage = useCallback((view, direction) => {
    setViewState((prev) => ({
      ...prev,
      [view]: {
        ...prev[view],
        page: Math.max(1, prev[view].page + direction),
      },
    }));
  }, []);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const response = await api.get('/business-operations/reports/sales/summary', {
        params: buildReportParams(filters),
      });
      setSummary(response.data?.data || null);
      setSummaryMeta({
        filters: response.data?.filters || {},
        dateRange: response.data?.dateRange || null,
      });
    } catch (error) {
      setSummaryError(error.response?.data?.error || 'Failed to load sales summary');
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [filters]);

  const fetchProfitSummary = useCallback(async () => {
    setProfitSummaryLoading(true);
    try {
      const response = await api.get('/business-operations/reports/sales/profit-latest-cost', {
        params: buildReportParams(filters),
      });
      setProfitSummary(response.data?.data?.summary || null);
    } catch {
      setProfitSummary(null);
    } finally {
      setProfitSummaryLoading(false);
    }
  }, [filters]);

  const fetchInvoices = useCallback(async () => {
    setInvoicesState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const params = buildReportParams(filters, viewState.invoices);
      const response = await api.get('/business-operations/reports/sales/invoices', { params });
      setInvoicesState({
        data: response.data?.data || [],
        pagination: response.data?.pagination || null,
        loading: false,
        error: '',
      });
    } catch (error) {
      setInvoicesState({ data: [], pagination: null, loading: false, error: error.response?.data?.error || 'Failed to load invoice report' });
    }
  }, [filters, viewState.invoices]);

  const fetchProducts = useCallback(async () => {
    setProductsState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const params = buildReportParams(filters, viewState.products);
      const response = await api.get('/business-operations/reports/sales/products', { params });
      setProductsState({
        data: response.data?.data || [],
        pagination: response.data?.pagination || null,
        loading: false,
        error: '',
      });
    } catch (error) {
      setProductsState({ data: [], pagination: null, loading: false, error: error.response?.data?.error || 'Failed to load product report' });
    }
  }, [filters, viewState.products]);

  const fetchUsers = useCallback(async () => {
    setUsersState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const params = buildReportParams(filters, viewState.users);
      const response = await api.get('/business-operations/reports/sales/users', { params });
      setUsersState({
        data: response.data?.data || [],
        pagination: response.data?.pagination || null,
        loading: false,
        error: '',
      });
    } catch (error) {
      setUsersState({ data: [], pagination: null, loading: false, error: error.response?.data?.error || 'Failed to load user report' });
    }
  }, [filters, viewState.users]);

  const fetchPayments = useCallback(async () => {
    setPaymentsState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const response = await api.get('/business-operations/reports/sales/payments', {
        params: buildReportParams(filters),
      });
      setPaymentsState({
        data: response.data?.data || [],
        totals: response.data?.totals || null,
        loading: false,
        error: '',
      });
    } catch (error) {
      setPaymentsState({ data: [], totals: null, loading: false, error: error.response?.data?.error || 'Failed to load payment summary' });
    }
  }, [filters]);

  useEffect(() => {
    fetchSummary();
    fetchProfitSummary();
  }, [fetchSummary, fetchProfitSummary, queryKey]);

  useEffect(() => {
    if (activeView === 'invoices') fetchInvoices();
    if (activeView === 'products') fetchProducts();
    if (activeView === 'users') fetchUsers();
    if (activeView === 'payments') fetchPayments();
  }, [activeView, fetchInvoices, fetchProducts, fetchUsers, fetchPayments, queryKey]);

  const runAutoRefresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    setAutoRefreshing(true);
    try {
      await fetchSummary();

      if (activeSection === 'sales-by' && isReportModalOpen && activeView === 'invoices') {
        await fetchInvoices();
      }
      if (activeSection === 'sales-by' && isReportModalOpen && activeView === 'products') {
        await fetchProducts();
      }
      if (activeSection === 'sales-by' && isReportModalOpen && activeView === 'users') {
        await fetchUsers();
      }
      if (activeSection === 'sales-by' && isReportModalOpen && activeView === 'payments') {
        await fetchPayments();
      }
    } finally {
      setAutoRefreshing(false);
    }
  }, [activeSection, activeView, fetchInvoices, fetchPayments, fetchProducts, fetchSummary, fetchUsers, isReportModalOpen]);

  useEffect(() => {
    autoRefreshIntervalRef.current = setInterval(() => {
      runAutoRefresh();
    }, AUTO_REFRESH_MS);

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [runAutoRefresh]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
      }
      autoRefreshTimeoutRef.current = setTimeout(() => {
        runAutoRefresh();
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
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', scheduleRefresh);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
      }
    };
  }, [runAutoRefresh]);

  const summaryMetaLine = useMemo(() => {
    const chips = [];
    if (summaryMeta?.dateRange?.startDate && summaryMeta?.dateRange?.endDate) {
      chips.push(`${summaryMeta.dateRange.startDate} to ${summaryMeta.dateRange.endDate}`);
    }
    if (summaryMeta?.filters?.branchCode) chips.push(`Branch: ${summaryMeta.filters.branchCode}`);
    if (summaryMeta?.filters?.locationCode) chips.push(`Location: ${summaryMeta.filters.locationCode}`);
    if (summaryMeta?.filters?.syncSourceCode) chips.push(`Source: ${summaryMeta.filters.syncSourceCode}`);
    return chips;
  }, [summaryMeta]);

  const handleExport = useCallback(async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
      if (format === 'pdf') {
        const activeViewLabelForExport = REPORT_VIEWS.find((view) => view.id === activeView)?.label || 'Report';
        const activeLoading = (
          (activeView === 'summary' && summaryLoading)
          || (activeView === 'invoices' && invoicesState.loading)
          || (activeView === 'products' && productsState.loading)
          || (activeView === 'users' && usersState.loading)
          || (activeView === 'payments' && paymentsState.loading)
        );

        if (activeLoading) {
          throw new Error('Please wait for the active report data to finish loading before exporting.');
        }

        exportActiveSalesReportPdf({
          activeView,
          activeViewLabel: activeViewLabelForExport,
          filters,
          resolvedDateRange: summaryMeta?.dateRange || null,
          summaryMetaLine,
          summary,
          invoicesState,
          productsState,
          usersState,
          paymentsState,
        });
        return;
      }

      await downloadBusinessReport({
        format,
        module: 'sales',
        type: activeView,
        filters,
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${format.toUpperCase()} report.`;
      await boAlert({ title: 'Export Failed', message, type: 'warning' });
    } finally {
      if (format === 'excel') setExportingExcel(false);
      if (format === 'pdf') setExportingPdf(false);
    }
  }, [activeView, filters, invoicesState, paymentsState, productsState, summary, summaryLoading, summaryMeta, summaryMetaLine, usersState]);

  const handleExportFullWorkbook = useCallback(async () => {
    setExportingFullWorkbook(true);
    try {
      await downloadFullBusinessWorkbook({
        filters: {
          locationId: selectedLocationId || undefined,
          branchCode: filters.branchCode || undefined,
          syncSourceCode: filters.syncSourceCode || undefined,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
        },
      });
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || 'Failed to export full workbook.';
      await boAlert({ title: 'Export Failed', message, type: 'warning' });
    } finally {
      setExportingFullWorkbook(false);
    }
  }, [filters.branchCode, filters.endDate, filters.startDate, filters.syncSourceCode, selectedLocationId]);

  const handleChooseImportWorkbook = useCallback(() => {
    if (importingFullWorkbook) return;
    fullWorkbookInputRef.current?.click();
  }, [importingFullWorkbook]);

  const handleImportWorkbookFileChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const confirmed = await boConfirm({
      title: 'Import Workbook',
      message: `Import workbook "${file.name}"? This will re-add/update payroll, sales, and business operations records.`,
      confirmText: 'Import',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    setImportingFullWorkbook(true);
    try {
      const response = await importFullBusinessWorkbook({
        file,
        upsert: true,
        clearExisting: false,
        locationId: selectedLocationId || null,
      });

      const payrollImported = response?.result?.payroll?.imported || {};
      const salesImported = response?.result?.sales?.imported || {};
      const businessImported = response?.result?.business?.imported || {};
      const payrollCount = Object.values(payrollImported).reduce((sum, value) => sum + Number(value || 0), 0);
      const salesCount = Object.values(salesImported).reduce((sum, value) => sum + Number(value || 0), 0);
      const businessCount = Object.values(businessImported).reduce((sum, value) => sum + Number(value || 0), 0);

      await boAlert({
        title: 'Import Complete',
        message: `Workbook import complete. Payroll rows: ${payrollCount}. Sales rows: ${salesCount}. BO rows: ${businessCount}.`,
        type: 'success',
      });
      await fetchSummary();
      if (activeView === 'invoices') await fetchInvoices();
      if (activeView === 'products') await fetchProducts();
      if (activeView === 'users') await fetchUsers();
      if (activeView === 'payments') await fetchPayments();
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || 'Failed to import full workbook.';
      await boAlert({ title: 'Import Failed', message, type: 'warning' });
    } finally {
      setImportingFullWorkbook(false);
    }
  }, [activeView, fetchInvoices, fetchPayments, fetchProducts, fetchSummary, fetchUsers, selectedLocationId]);

  const activeFilterCount = useMemo(() => {
    const baseline = {
      ...DEFAULT_FILTERS,
      locationId: selectedLocationId ? String(selectedLocationId) : '',
      locationCode: selectedLocationId ? String(selectedLocationCode || '').trim().toUpperCase() : '',
    };

    return Object.keys(filters).reduce((count, key) => {
      return filters[key] !== baseline[key] ? count + 1 : count;
    }, 0);
  }, [filters, selectedLocationCode, selectedLocationId]);

  const activeViewLabel = useMemo(
    () => REPORT_VIEWS.find((view) => view.id === activeView)?.label || 'Report',
    [activeView],
  );

  const renderPagination = (view, pagination) => {
    if (!pagination) return null;
    const totalPages = pagination.totalPages || 1;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.1rem' }}>
        <span style={{ color: '#64748b', fontSize: '0.88rem' }}>
          Page {pagination.page} of {totalPages} • {integer(pagination.total)} total records
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" disabled={pagination.page <= 1} onClick={() => updatePage(view, -1)} style={viewButtonStyle(true)}>
            Previous
          </button>
          <button type="button" disabled={pagination.page >= totalPages} onClick={() => updatePage(view, 1)} style={viewButtonStyle(true)}>
            Next
          </button>
        </div>
      </div>
    );
  };

  const renderSortableHeader = (view, label, sortKey) => {
    const state = viewState[view];
    const active = state?.sortBy === sortKey;
    return (
      <button
        type="button"
        onClick={() => updateViewSort(view, sortKey)}
        style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
      >
        {label}
        <i className={`fas ${active ? (state.sortOrder === 'desc' ? 'fa-sort-down' : 'fa-sort-up') : 'fa-sort'}`}></i>
      </button>
    );
  };

  const renderSummaryView = () => {
    if (summaryError) return <ErrorState message={summaryError} />;

    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <SalesSummaryCards summary={summary} loading={summaryLoading} profitSummary={profitSummary} profitLoading={profitSummaryLoading} />
        <div style={{ ...baseCardStyle, padding: '1.25rem' }}>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>Report Context</h3>
          <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {summaryMetaLine.length ? summaryMetaLine.map((item) => (
              <span key={item} style={{ backgroundColor: '#f1f5f9', color: '#334155', borderRadius: '999px', padding: '0.45rem 0.75rem', fontSize: '0.85rem', fontWeight: 700 }}>
                {item}
              </span>
            )) : <span style={{ color: '#64748b' }}>No extra filters currently applied.</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderInvoicesView = () => {
    if (invoicesState.error) return <ErrorState message={invoicesState.error} />;
    if (invoicesState.loading) return <EmptyState message="Loading invoice report..." />;
    if (!invoicesState.data.length) return <EmptyState message={statusMessage('invoices')} />;

    return (
      <div style={baseCardStyle}>
        <div style={{ overflow: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{renderSortableHeader('invoices', 'Invoice', 'sourceInvoiceNo')}</th>
                <th style={thStyle}>{renderSortableHeader('invoices', 'Date / Time', 'invoiceDate')}</th>
                <th style={thStyle}>{renderSortableHeader('invoices', 'User', 'userName')}</th>
                <th style={thStyle}>{renderSortableHeader('invoices', 'Location', 'locationCode')}</th>
                <th style={thStyle}>Payments</th>
                <th style={thStyle}>{renderSortableHeader('invoices', 'Gross', 'grossSale')}</th>
                <th style={thStyle}>{renderSortableHeader('invoices', 'VAT', 'vatAmount')}</th>
                <th style={thStyle}>{renderSortableHeader('invoices', 'Discount', 'discount')}</th>
                <th style={thStyle}>{renderSortableHeader('invoices', 'Net', 'netSale')}</th>
              </tr>
            </thead>
            <tbody>
              {invoicesState.data.map((row) => (
                <tr key={`${row.id}-${row.sourceInvoiceNo}`}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{row.sourceInvoiceNo || 'N/A'}</div>
                    <div style={{ color: '#64748b', fontSize: '0.82rem' }}>{row.syncSourceCode || row.branchCode || 'Unknown source'}</div>
                  </td>
                  <td style={tdStyle}>
                    <div>{row.invoiceDate ? new Date(row.invoiceDate).toLocaleDateString() : 'N/A'}</div>
                    <div style={{ color: '#64748b', fontSize: '0.82rem' }}>{row.invoiceTime ? new Date(row.invoiceTime).toLocaleTimeString() : ''}</div>
                  </td>
                  <td style={tdStyle}>{row.userName || 'Unknown'}</td>
                  <td style={tdStyle}>
                    <div>{row.locationCode || 'N/A'}</div>
                    <div style={{ color: '#64748b', fontSize: '0.82rem' }}>{row.branchCode || 'All branches'}</div>
                  </td>
                  <td style={tdStyle}>
                    <div>{row.payMethod1 || 'N/A'} {row.tenderAmount1 ? `• ${money(row.tenderAmount1)}` : ''}</div>
                    {row.payMethod2 && (
                      <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                        {row.payMethod2} {row.tenderAmount2 ? `• ${money(row.tenderAmount2)}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{money(row.grossSale)}</td>
                  <td style={tdStyle}>{money(row.vatAmount)}</td>
                  <td style={tdStyle}>{money(row.discount)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{money(row.netSale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {renderPagination('invoices', invoicesState.pagination)}
      </div>
    );
  };

  const renderProductsView = () => {
    if (productsState.error) return <ErrorState message={productsState.error} />;
    if (productsState.loading) return <EmptyState message="Loading product report..." />;
    if (!productsState.data.length) return <EmptyState message={statusMessage('products')} />;

    return (
      <div style={baseCardStyle}>
        <div style={{ overflow: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{renderSortableHeader('products', 'Product Code', 'productCode')}</th>
                <th style={thStyle}>{renderSortableHeader('products', 'Product Name', 'productName')}</th>
                <th style={thStyle}>{renderSortableHeader('products', 'Quantity', 'totalQuantitySold')}</th>
                <th style={thStyle}>{renderSortableHeader('products', 'Sales', 'totalSales')}</th>
                <th style={thStyle}>{renderSortableHeader('products', 'Tax', 'totalTax')}</th>
                <th style={thStyle}>{renderSortableHeader('products', 'Discount', 'totalDiscount')}</th>
                <th style={thStyle}>Avg Unit Price</th>
                <th style={thStyle}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {productsState.data.map((row) => (
                <tr key={`${row.productCode}-${row.productName}`}>
                  <td style={tdStyle}>{row.productCode || 'N/A'}</td>
                  <td style={tdStyle}>{row.productName || 'Unnamed product'}</td>
                  <td style={tdStyle}>{Number(row.totalQuantitySold || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td style={tdStyle}>{money(row.totalSales)}</td>
                  <td style={tdStyle}>{money(row.totalTax)}</td>
                  <td style={tdStyle}>{money(row.totalDiscount)}</td>
                  <td style={tdStyle}>{money(row.averageUnitPrice)}</td>
                  <td style={tdStyle}>{row.estimatedMarginPct !== null && row.estimatedMarginPct !== undefined ? `${Number(row.estimatedMarginPct).toFixed(2)}%` : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {renderPagination('products', productsState.pagination)}
      </div>
    );
  };

  const renderUsersView = () => {
    if (usersState.error) return <ErrorState message={usersState.error} />;
    if (usersState.loading) return <EmptyState message="Loading user report..." />;
    if (!usersState.data.length) return <EmptyState message={statusMessage('users')} />;

    return (
      <div style={baseCardStyle}>
        <div style={{ overflow: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{renderSortableHeader('users', 'User', 'userName')}</th>
                <th style={thStyle}>{renderSortableHeader('users', 'Invoices', 'totalInvoices')}</th>
                <th style={thStyle}>{renderSortableHeader('users', 'Gross Sales', 'grossSales')}</th>
                <th style={thStyle}>{renderSortableHeader('users', 'VAT Total', 'vatTotal')}</th>
                <th style={thStyle}>{renderSortableHeader('users', 'Net Sales', 'totalSales')}</th>
                <th style={thStyle}>{renderSortableHeader('users', 'Average Invoice', 'averageInvoiceValue')}</th>
              </tr>
            </thead>
            <tbody>
              {usersState.data.map((row) => (
                <tr key={row.userName || 'unknown'}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{row.userName || 'Unknown'}</td>
                  <td style={tdStyle}>{integer(row.totalInvoices)}</td>
                  <td style={tdStyle}>{money(row.grossSales)}</td>
                  <td style={tdStyle}>{money(row.vatTotal)}</td>
                  <td style={tdStyle}>{money(row.totalSales)}</td>
                  <td style={tdStyle}>{money(row.averageInvoiceValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {renderPagination('users', usersState.pagination)}
      </div>
    );
  };

  const renderPaymentsView = () => {
    if (paymentsState.error) return <ErrorState message={paymentsState.error} />;
    if (paymentsState.loading) return <EmptyState message="Loading payment summary..." />;
    if (!paymentsState.data.length) return <EmptyState message={statusMessage('payments')} />;

    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {paymentsState.data.map((row) => (
            <div key={row.payMethod} style={{ ...baseCardStyle, padding: '1rem 1.1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Payment Method
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{row.payMethod}</div>
              <div style={{ marginTop: '0.85rem', color: '#334155', fontWeight: 700, whiteSpace: 'nowrap' }}>{money(row.totalAmount)}</div>
              <div style={{ marginTop: '0.35rem', color: '#64748b', fontSize: '0.88rem' }}>{integer(row.invoiceCount)} invoice occurrences</div>
            </div>
          ))}
        </div>
        {paymentsState.totals && (
          <div style={{ ...baseCardStyle, padding: '1rem 1.1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Amount</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.08rem', lineHeight: 1.1, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{money(paymentsState.totals.totalAmount)}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase' }}>Invoice Count</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.08rem', lineHeight: 1.1, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{integer(paymentsState.totals.invoiceCount)}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSalesByNavigator = () => {
    return (
      <div style={{ ...baseCardStyle, padding: '1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.03rem' }}>Sales by Dimension</h3>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Open a report dimension below to inspect detailed sales analytics with the current filters.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
            {SALES_BY_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                title="Click to open"
                onClick={() => {
                  setActiveView(card.id);
                  setIsReportModalMaximized(false);
                  setIsReportModalOpen(true);
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = 'translateY(-2px)';
                  event.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.12)';
                  event.currentTarget.style.borderColor = '#cbd5e1';
                  event.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = 'translateY(0)';
                  event.currentTarget.style.boxShadow = '0 6px 20px rgba(15, 23, 42, 0.04)';
                  event.currentTarget.style.borderColor = '#e2e8f0';
                  event.currentTarget.style.backgroundColor = '#fff';
                }}
                style={{
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#fff',
                  borderRadius: '14px',
                  padding: '0.95rem 1rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: '0 6px 20px rgba(15, 23, 42, 0.04)',
                  transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease',
                  display: 'grid',
                  gap: '0.48rem',
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: `${card.tone}1A`, color: card.tone }}>
                  <i className={`fas ${card.icon}`}></i>
                </div>
                <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>{card.title}</div>
                <div style={{ color: '#64748b', fontSize: '0.84rem', lineHeight: 1.45 }}>{card.subtitle}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!isReportModalOpen) return;
    const handler = (event) => { if (event.key === 'Escape') { setIsReportModalOpen(false); setIsReportModalMaximized(false); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isReportModalOpen]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <input
        ref={fullWorkbookInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleImportWorkbookFileChange}
      />
      <div style={{ display: 'flex', gap: '0.55rem', overflowX: 'auto' }}>
        <button
          type="button"
          onClick={() => {
            setActiveSection('summary');
            setActiveView('summary');
            setIsReportModalOpen(false);
            setIsReportModalMaximized(false);
          }}
          style={navigationTabStyle(activeSection === 'summary', isAdminDarkTheme)}
        >
          <i className="fas fa-chart-pie"></i>
          Summary
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveSection('sales-by');
            setIsReportModalOpen(false);
            setIsReportModalMaximized(false);
            if (activeView === 'summary') {
              setActiveView('invoices');
            }
          }}
          style={navigationTabStyle(activeSection === 'sales-by', isAdminDarkTheme)}
        >
          <i className="fas fa-chart-column"></i>
          Sales by Dimension
        </button>
      </div>

      {activeSection === 'summary' && (
        <>
          <div style={{ ...baseCardStyle, padding: '0.8rem 0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowSummaryFilters((prev) => !prev)}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
            >
              <i className="fas fa-sliders" style={{ marginRight: '0.42rem' }}></i>
              {showSummaryFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 700 }}>
                {showSummaryFilters ? 'Summary filters are visible.' : `Summary filters hidden${activeFilterCount > 0 ? ` • ${activeFilterCount} active` : ''}.`}
              </div>
              {autoRefreshing && (
                <span style={{ color: '#2563eb', fontSize: '0.82rem', fontWeight: 700 }}>
                  <i className="fas fa-rotate-right fa-spin" style={{ marginRight: '0.35rem' }}></i>
                  Auto-refreshing...
                </span>
              )}
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                disabled={summaryLoading || exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook}
                style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 700, cursor: summaryLoading || exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook ? 'not-allowed' : 'pointer' }}
              >
                <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.42rem' }}></i>
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => handleExport('excel')}
                disabled={summaryLoading || exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook}
                style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 700, cursor: summaryLoading || exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook ? 'not-allowed' : 'pointer' }}
              >
                <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.42rem' }}></i>
                Export Excel
              </button>
              <button
                type="button"
                onClick={handleExportFullWorkbook}
                disabled={summaryLoading || exportingFullWorkbook || importingFullWorkbook || exportingExcel || exportingPdf}
                style={{ border: isAdminDarkTheme ? '1px solid #2f7f58' : '1px solid #86efac', background: isAdminDarkTheme ? '#153828' : '#f0fdf4', color: isAdminDarkTheme ? '#91e0b4' : '#166534', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 800, cursor: summaryLoading || exportingFullWorkbook || importingFullWorkbook || exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
              >
                <i className={`fas ${exportingFullWorkbook ? 'fa-spinner fa-spin' : 'fa-file-arrow-down'}`} style={{ marginRight: '0.42rem' }}></i>
                Export Full Workbook
              </button>
              <button
                type="button"
                onClick={handleChooseImportWorkbook}
                disabled={summaryLoading || importingFullWorkbook || exportingFullWorkbook || exportingExcel || exportingPdf}
                style={{ border: isAdminDarkTheme ? '1px solid #5b4b8a' : '1px solid #bfdbfe', background: isAdminDarkTheme ? '#2a2438' : '#eff6ff', color: isAdminDarkTheme ? '#d7cff5' : '#1e3a8a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 800, cursor: summaryLoading || importingFullWorkbook || exportingFullWorkbook || exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
              >
                <i className={`fas ${importingFullWorkbook ? 'fa-spinner fa-spin' : 'fa-file-arrow-up'}`} style={{ marginRight: '0.42rem' }}></i>
                Import Full Workbook
              </button>
            </div>
          </div>

          {showSummaryFilters && (
            <SalesReportFilters
              filters={filters}
              onChange={updateFilter}
              onReset={resetFilters}
              resolvedRange={summaryMeta.dateRange}
              loading={summaryLoading}
            />
          )}

          {renderSummaryView()}
        </>
      )}

      {activeSection === 'sales-by' && renderSalesByNavigator()}

      {activeView !== 'summary' && isReportModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isReportModalMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...baseCardStyle, width: isReportModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1240px, 97vw)', height: isReportModalMaximized ? 'calc(100vh - 0.7rem)' : '90vh', maxHeight: 'none', overflow: 'auto', borderRadius: isReportModalMaximized ? '10px' : '18px', padding: '0.9rem' }}>
            <div style={{ position: 'sticky', top: '-0.9rem', zIndex: 5, backgroundColor: '#fff', margin: '-0.9rem -0.9rem 0.75rem', padding: '0.9rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ color: '#0f172a' }}>{activeViewLabel}</strong>
                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    disabled={summaryLoading || exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook}
                    style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 700, cursor: summaryLoading || exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.42rem' }}></i>
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('excel')}
                    disabled={summaryLoading || exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook}
                    style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 700, cursor: summaryLoading || exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.42rem' }}></i>
                    Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={handleExportFullWorkbook}
                    disabled={summaryLoading || exportingFullWorkbook || importingFullWorkbook || exportingExcel || exportingPdf}
                    style={{ border: isAdminDarkTheme ? '1px solid #2f7f58' : '1px solid #86efac', background: isAdminDarkTheme ? '#153828' : '#f0fdf4', color: isAdminDarkTheme ? '#91e0b4' : '#166534', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 800, cursor: summaryLoading || exportingFullWorkbook || importingFullWorkbook || exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${exportingFullWorkbook ? 'fa-spinner fa-spin' : 'fa-file-arrow-down'}`} style={{ marginRight: '0.42rem' }}></i>
                    Export Full Workbook
                  </button>
                  <button
                    type="button"
                    onClick={handleChooseImportWorkbook}
                    disabled={summaryLoading || importingFullWorkbook || exportingFullWorkbook || exportingExcel || exportingPdf}
                    style={{ border: isAdminDarkTheme ? '1px solid #5b4b8a' : '1px solid #bfdbfe', background: isAdminDarkTheme ? '#2a2438' : '#eff6ff', color: isAdminDarkTheme ? '#d7cff5' : '#1e3a8a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 800, cursor: summaryLoading || importingFullWorkbook || exportingFullWorkbook || exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${importingFullWorkbook ? 'fa-spinner fa-spin' : 'fa-file-arrow-up'}`} style={{ marginRight: '0.42rem' }}></i>
                    Import Full Workbook
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWorkspaceFilters((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-sliders" style={{ marginRight: '0.42rem' }}></i>
                    {showWorkspaceFilters ? 'Hide Filters' : 'Show Filters'}
                  </button>
                  <button
                    type="button"
                    title={isReportModalMaximized ? 'Restore' : 'Maximize'}
                    aria-label={isReportModalMaximized ? 'Restore report modal' : 'Maximize report modal'}
                    onClick={() => setIsReportModalMaximized((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className={`fas ${isReportModalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                  </button>
                  <button
                    type="button"
                    title="Close"
                    aria-label="Close report modal"
                    onClick={() => { setIsReportModalOpen(false); setIsReportModalMaximized(false); }}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>

              {showWorkspaceFilters && (
                <div style={{ marginTop: '0.75rem' }}>
                  <SalesReportFilters
                    filters={filters}
                    onChange={updateFilter}
                    onReset={resetFilters}
                    resolvedRange={summaryMeta.dateRange}
                    loading={summaryLoading}
                  />
                </div>
              )}
            </div>

            {activeView === 'invoices' && renderInvoicesView()}
            {activeView === 'products' && renderProductsView()}
            {activeView === 'users' && renderUsersView()}
            {activeView === 'payments' && renderPaymentsView()}
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesReportsTab;
