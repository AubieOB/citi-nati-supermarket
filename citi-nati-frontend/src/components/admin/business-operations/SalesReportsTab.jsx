import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
import SalesReportFilters from './SalesReportFilters.jsx';
import SalesSummaryCards from './SalesSummaryCards.jsx';

const REPORT_VIEWS = [
  { id: 'summary', label: 'Summary', icon: 'fa-chart-pie' },
  { id: 'invoices', label: 'Invoices', icon: 'fa-receipt' },
  { id: 'products', label: 'Products', icon: 'fa-cubes' },
  { id: 'users', label: 'Users', icon: 'fa-users' },
  { id: 'payments', label: 'Payments', icon: 'fa-wallet' },
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

const DEFAULT_FILTERS = {
  periodType: 'month',
  date: new Date().toISOString().slice(0, 10),
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
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [showSummaryFilters, setShowSummaryFilters] = useState(false);
  const [showWorkspaceFilters, setShowWorkspaceFilters] = useState(false);
  const [activeView, setActiveView] = useState('summary');
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);

  const [summary, setSummary] = useState(null);
  const [summaryMeta, setSummaryMeta] = useState({ filters: {}, dateRange: null });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const [invoicesState, setInvoicesState] = useState({ data: [], pagination: null, loading: false, error: '' });
  const [productsState, setProductsState] = useState({ data: [], pagination: null, loading: false, error: '' });
  const [usersState, setUsersState] = useState({ data: [], pagination: null, loading: false, error: '' });
  const [paymentsState, setPaymentsState] = useState({ data: [], totals: null, loading: false, error: '' });
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

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
  }, [fetchSummary, queryKey]);

  useEffect(() => {
    if (activeView === 'invoices') fetchInvoices();
    if (activeView === 'products') fetchProducts();
    if (activeView === 'users') fetchUsers();
    if (activeView === 'payments') fetchPayments();
  }, [activeView, fetchInvoices, fetchProducts, fetchUsers, fetchPayments, queryKey]);

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
      await downloadBusinessReport({
        format,
        module: 'sales',
        type: activeView,
        filters,
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${format.toUpperCase()} report.`;
      window.alert(message);
    } finally {
      if (format === 'excel') setExportingExcel(false);
      if (format === 'pdf') setExportingPdf(false);
    }
  }, [activeView, filters]);

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
        <SalesSummaryCards summary={summary} loading={summaryLoading} />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {paymentsState.data.map((row) => (
            <div key={row.payMethod} style={{ ...baseCardStyle, padding: '1rem 1.1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Payment Method
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{row.payMethod}</div>
              <div style={{ marginTop: '0.85rem', color: '#334155', fontWeight: 700 }}>{money(row.totalAmount)}</div>
              <div style={{ marginTop: '0.35rem', color: '#64748b', fontSize: '0.88rem' }}>{integer(row.invoiceCount)} invoice occurrences</div>
            </div>
          ))}
        </div>
        {paymentsState.totals && (
          <div style={{ ...baseCardStyle, padding: '1rem 1.1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Amount</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>{money(paymentsState.totals.totalAmount)}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase' }}>Invoice Count</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>{integer(paymentsState.totals.invoiceCount)}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.55rem', overflowX: 'auto' }}>
        {REPORT_VIEWS.map((view) => (
          <button key={view.id} type="button" onClick={() => setActiveView(view.id)} style={sectionTabStyle(activeView === view.id)}>
            <i className={`fas ${view.icon}`}></i>
            {view.label}
          </button>
        ))}
      </div>

      {activeView === 'summary' && (
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
            <div style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 700 }}>
              {showSummaryFilters ? 'Summary filters are visible.' : `Summary filters hidden${activeFilterCount > 0 ? ` • ${activeFilterCount} active` : ''}.`}
            </div>
          </div>

          {showSummaryFilters && (
            <SalesReportFilters
              filters={filters}
              onChange={updateFilter}
              onReset={resetFilters}
              resolvedRange={summaryMeta.dateRange}
              loading={summaryLoading}
              exportingExcel={exportingExcel}
              exportingPdf={exportingPdf}
              onExportExcel={() => handleExport('excel')}
              onExportPdf={() => handleExport('pdf')}
            />
          )}

          {renderSummaryView()}
        </>
      )}

      {activeView !== 'summary' && (
        <div style={{ ...baseCardStyle, padding: '0.95rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#334155', fontWeight: 700 }}>{activeViewLabel} workspace</div>
            <div style={{ color: '#64748b', fontSize: '0.86rem', marginTop: '0.2rem' }}>
              {activeFilterCount > 0 ? `${activeFilterCount} filters active in this workspace.` : 'Open the workspace to adjust filters and review results.'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            style={{ border: 'none', backgroundColor: '#0f172a', color: '#fff', borderRadius: '10px', padding: '0.58rem 0.92rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Open {activeViewLabel}
          </button>
        </div>
      )}

      {isReportModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...baseCardStyle, width: 'min(1240px, 97vw)', maxHeight: '90vh', overflow: 'auto', padding: '0.9rem' }}>
            <div style={{ position: 'sticky', top: '-0.9rem', zIndex: 5, backgroundColor: '#fff', margin: '-0.9rem -0.9rem 0.75rem', padding: '0.9rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ color: '#0f172a' }}>{activeViewLabel}</strong>
                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
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
                    onClick={() => setIsReportModalOpen(false)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.7rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Close
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
                    exportingExcel={exportingExcel}
                    exportingPdf={exportingPdf}
                    onExportExcel={() => handleExport('excel')}
                    onExportPdf={() => handleExport('pdf')}
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
