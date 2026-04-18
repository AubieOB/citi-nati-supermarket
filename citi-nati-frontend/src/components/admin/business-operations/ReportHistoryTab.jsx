import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
import { boAlert } from '../../../utils/boDialogBus.js';

const AUTO_REFRESH_MS = 30000;
const AUTO_REFRESH_DEBOUNCE_MS = 350;

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const EmptyState = ({ message }) => (
  <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>{message}</div>
);

const ErrorState = ({ message }) => (
  <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
    {message}
  </div>
);

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

function getCurrentMonthParams() {
  const today = new Date();
  return {
    periodType: 'month',
    month: String(today.getMonth() + 1),
    year: String(today.getFullYear()),
  };
}

const ZOMBA_LOCATION_CODES_FE = ['ZA', 'SH', 'BAR', 'WH'];

function deriveBranchCodeFromLocationCode(locationCode) {
  const code = String(locationCode || '').trim().toUpperCase();
  if (!code) return '';
  if (code === 'BT') return 'BLANTYRE';
  if (ZOMBA_LOCATION_CODES_FE.includes(code)) return 'ZOMBA';
  return '';
}

const exportButtonStyle = (disabled) => ({
  border: '1px solid #cbd5e1',
  backgroundColor: '#fff',
  color: '#0f172a',
  borderRadius: '10px',
  padding: '0.52rem 0.78rem',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '0.82rem',
});

const activityTabStyle = (active) => ({
  border: active ? '1px solid #5B4B8A' : '1px solid #d1d5db',
  backgroundColor: active ? '#5B4B8A' : '#fff',
  color: active ? '#fff' : '#334155',
  borderRadius: '999px',
  padding: '0.45rem 0.8rem',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
});

const ReportHistoryTab = ({ refreshKey = 0, selectedLocationId = null, selectedLocationCode = '', onNavigateTab }) => {
  const [state, setState] = useState({
    loading: true,
    error: '',
    salesSummary: null,
    invoices: [],
    expenses: [],
    supplierTransactions: [],
    payrollPeriods: [],
  });
  const [exporting, setExporting] = useState({});
  const [activeActivity, setActiveActivity] = useState('sales');
  const [showQuickExports, setShowQuickExports] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const autoRefreshIntervalRef = useRef(null);
  const autoRefreshTimeoutRef = useRef(null);

  const fetchActivity = useCallback(async ({ background = false } = {}) => {
    setState((current) => {
      const hasData = Boolean(
        current.salesSummary
        || current.invoices.length
        || current.expenses.length
        || current.supplierTransactions.length
        || current.payrollPeriods.length,
      );

      return {
        ...current,
        loading: !background || !hasData,
        error: background ? current.error : '',
      };
    });
    const normalizedLocationCode = String(selectedLocationCode || '').trim().toUpperCase();
    const derivedBranchCode = deriveBranchCodeFromLocationCode(normalizedLocationCode);

    const monthParams = {
      ...getCurrentMonthParams(),
      ...(selectedLocationId && { locationId: selectedLocationId }),
      ...(normalizedLocationCode && { locationCode: normalizedLocationCode }),
      ...(derivedBranchCode && { branchCode: derivedBranchCode }),
    };

    try {
      const [salesSummaryResponse, invoicesResponse, expensesResponse, supplierTransactionsResponse, payrollPeriodsResponse] = await Promise.all([
        api.get('/business-operations/reports/sales/summary', { params: monthParams }),
        api.get('/business-operations/reports/sales/invoices', { params: { ...monthParams, page: 1, pageSize: 5, sortBy: 'invoiceDate', sortOrder: 'desc' } }),
        api.get('/business-operations/expenses', { params: { page: 1, pageSize: 5, sortBy: 'expenseDate', sortOrder: 'desc', ...(selectedLocationId && { locationId: selectedLocationId }) } }),
        api.get('/business-operations/suppliers/transactions/list', { params: { page: 1, pageSize: 5, sortBy: 'transactionDate', sortOrder: 'desc', ...(selectedLocationId && { locationId: selectedLocationId }) } }),
        api.get('/business-operations/payroll/periods', { params: { page: 1, pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc', ...(selectedLocationId && { locationId: selectedLocationId }) } }),
      ]);

      setState({
        loading: false,
        error: '',
        salesSummary: salesSummaryResponse.data?.data || null,
        invoices: invoicesResponse.data?.data || [],
        expenses: expensesResponse.data?.data || [],
        supplierTransactions: supplierTransactionsResponse.data?.data || [],
        payrollPeriods: payrollPeriodsResponse.data?.data || [],
      });
    } catch (requestError) {
      const nextError = requestError.response?.data?.error || 'Failed to load report history activity';
      setState((current) => {
        const hasData = Boolean(
          current.salesSummary
          || current.invoices.length
          || current.expenses.length
          || current.supplierTransactions.length
          || current.payrollPeriods.length,
        );

        if (background && hasData) {
          return { ...current, loading: false };
        }

        return {
          loading: false,
          error: nextError,
          salesSummary: null,
          invoices: [],
          expenses: [],
          supplierTransactions: [],
          payrollPeriods: [],
        };
      });
    }
  }, [selectedLocationCode, selectedLocationId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity, refreshKey]);

  const runAutoRefresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    setAutoRefreshing(true);
    try {
      await fetchActivity({ background: true });
    } finally {
      setAutoRefreshing(false);
    }
  }, [fetchActivity]);

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

  const snapshotCards = useMemo(() => ([
    { label: 'Net Sales This Month', value: money(state.salesSummary?.netSales), note: 'Latest monthly reporting snapshot.' },
    { label: 'Invoices This Month', value: Number(state.salesSummary?.totalInvoices || 0).toLocaleString('en-US'), note: 'Invoice count in the current month.' },
    { label: 'Recent Expenses', value: state.expenses.length.toLocaleString('en-US'), note: 'Latest expense rows visible now.' },
    { label: 'Supplier Events', value: state.supplierTransactions.length.toLocaleString('en-US'), note: 'Recent supplier transaction events.' },
  ]), [state.expenses.length, state.salesSummary?.netSales, state.salesSummary?.totalInvoices, state.supplierTransactions.length]);

  const quickExports = useMemo(() => ([
    { id: 'sales', title: 'Sales', module: 'sales', type: 'summary', tabId: 'sales-reports', icon: 'fa-chart-line', tone: '#1d4ed8' },
    { id: 'expenses', title: 'Expenses', module: 'expenses', type: 'list', tabId: 'expenses', icon: 'fa-receipt', tone: '#0369a1' },
    { id: 'suppliers', title: 'Suppliers', module: 'suppliers', type: 'list', tabId: 'suppliers', icon: 'fa-truck-field', tone: '#7c3aed' },
    { id: 'payroll', title: 'Payroll', module: 'payroll', type: 'period', tabId: 'payroll', icon: 'fa-money-check-dollar', tone: '#0f766e' },
    { id: 'employees', title: 'Employees', module: 'employees', type: 'list', tabId: 'employees', icon: 'fa-users', tone: '#15803d' },
    { id: 'monthly-summary', title: 'Monthly Summary', module: 'monthly-summary', type: 'summary', tabId: 'monthly-summary', icon: 'fa-calendar-days', tone: '#b45309' },
  ]), []);

  const activityTabs = useMemo(() => ([
    { id: 'sales', label: 'Sales', count: state.invoices.length, description: 'Most recent sales invoices from the current month reporting window.' },
    { id: 'expenses', label: 'Expenses', count: state.expenses.length, description: 'Newest imported expense records across the operations workspace.' },
    { id: 'suppliers', label: 'Suppliers', count: state.supplierTransactions.length, description: 'Latest supplier ledger movement currently recorded.' },
    { id: 'payroll', label: 'Payroll', count: state.payrollPeriods.length, description: 'Latest payroll periods created in the operations module.' },
  ]), [state.expenses.length, state.invoices.length, state.payrollPeriods.length, state.supplierTransactions.length]);

  const activeActivityMeta = activityTabs.find((tab) => tab.id === activeActivity) || activityTabs[0];

  const handleExport = useCallback(async ({ module, type, format }) => {
    const key = `${module}:${format}`;
    setExporting((current) => ({ ...current, [key]: true }));
    try {
      await downloadBusinessReport({
        format,
        module,
        type,
        filters: selectedLocationId ? { locationId: selectedLocationId } : {},
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${module} ${format.toUpperCase()} report.`;
      await boAlert({ title: 'Export Failed', message, type: 'warning' });
    } finally {
      setExporting((current) => ({ ...current, [key]: false }));
    }
  }, [selectedLocationId]);

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: '1rem', height: 'calc(100vh - 230px)', maxHeight: 'calc(100vh - 230px)', overflow: 'hidden' }}>
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Report History</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '860px' }}>
              Monitor recent operational reporting activity across sales, expenses, suppliers, payroll, and run instant exports from one unified workspace.
            </p>
            <p style={{ margin: '0.25rem 0 0', color: '#475569', lineHeight: 1.5, fontSize: '0.82rem', fontWeight: 700 }}>
              Auto-refresh runs every 30 seconds while this tab is visible.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchActivity}
            disabled={state.loading || autoRefreshing}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: state.loading || autoRefreshing ? 'not-allowed' : 'pointer' }}
          >
            <i className={`fas ${state.loading || autoRefreshing ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }}></i>
            {autoRefreshing ? 'Auto-refreshing...' : 'Refresh'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
          {snapshotCards.map((item) => (
            <div key={item.label} style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{item.label}</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.36rem', lineHeight: 1.1, letterSpacing: '-0.01em', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{item.value}</div>
              <div style={{ marginTop: '0.3rem', color: '#64748b', fontSize: '0.84rem' }}>{item.note}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: showQuickExports ? '0.75rem' : 0 }}>
          <div>
            <strong style={{ color: '#0f172a' }}>Quick Exports</strong>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Generate on-demand Excel or PDF exports across all operations modules.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowQuickExports((prev) => !prev)}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.44rem 0.72rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            <i className={`fas ${showQuickExports ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ marginRight: '0.35rem' }}></i>
            {showQuickExports ? 'Hide' : 'Show'}
          </button>
        </div>
        {showQuickExports && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {quickExports.map((item) => {
              const exportingPdf = Boolean(exporting[`${item.module}:pdf`]);
              const exportingExcel = Boolean(exporting[`${item.module}:excel`]);
              const disabled = exportingPdf || exportingExcel;
              return (
                <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.85rem 0.9rem', display: 'grid', gap: '0.6rem', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    <span style={{ display: 'inline-flex', width: '30px', height: '30px', borderRadius: '9px', alignItems: 'center', justifyContent: 'center', backgroundColor: `${item.tone}1A`, color: item.tone }}>
                      <i className={`fas ${item.icon}`}></i>
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '0.92rem' }}>{item.title}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => handleExport({ module: item.module, type: item.type, format: 'pdf' })} disabled={disabled} style={exportButtonStyle(disabled)}>
                      <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.35rem' }}></i>
                      PDF
                    </button>
                    <button type="button" onClick={() => handleExport({ module: item.module, type: item.type, format: 'excel' })} disabled={disabled} style={exportButtonStyle(disabled)}>
                      <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.35rem' }}></i>
                      Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateTab?.(item.tabId)}
                      style={{ ...exportButtonStyle(false), borderColor: '#bfdbfe', color: '#1d4ed8' }}
                    >
                      <i className="fas fa-up-right-from-square" style={{ marginRight: '0.35rem' }}></i>
                      Open
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {state.error ? (
        <ErrorState message={state.error} />
      ) : state.loading ? (
        <div style={cardStyle}><EmptyState message="Loading report activity..." /></div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <strong style={{ color: '#0f172a' }}>Recent Activity</strong>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>{activeActivityMeta.description}</p>
          </div>

          <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid #eef2f7', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {activityTabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveActivity(tab.id)} style={activityTabStyle(activeActivity === tab.id)}>
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div style={{ padding: '1rem', display: 'grid', gap: '0.75rem', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {activeActivity === 'sales' && (
              !state.invoices.length ? (
                <EmptyState message="No sales invoices available right now." />
              ) : state.invoices.map((invoice) => (
                <div key={invoice.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem' }}>
                  <strong style={{ color: '#0f172a' }}>{invoice.sourceInvoiceNo || invoice.refNo || `Invoice ${invoice.id}`}</strong>
                  <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.84rem' }}>{formatDate(invoice.invoiceDate)} • {invoice.userName || 'Unknown cashier'} • {invoice.branchCode || 'No branch'}</div>
                  <div style={{ marginTop: '0.45rem', color: '#0f172a', fontWeight: 800 }}>{money(invoice.netSale)}</div>
                </div>
              ))
            )}

            {activeActivity === 'expenses' && (
              !state.expenses.length ? (
                <EmptyState message="No expenses available right now." />
              ) : state.expenses.map((expense) => (
                <div key={expense.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem' }}>
                  <strong style={{ color: '#0f172a' }}>{expense.description || expense.expenseCategory?.name || 'Expense entry'}</strong>
                  <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.84rem' }}>{formatDate(expense.expenseDate)} • {expense.expenseCategory?.name || 'No category'}</div>
                  <div style={{ marginTop: '0.45rem', color: '#0f172a', fontWeight: 800 }}>{money(expense.amount)}</div>
                </div>
              ))
            )}

            {activeActivity === 'suppliers' && (
              !state.supplierTransactions.length ? (
                <EmptyState message="No supplier transactions available right now." />
              ) : state.supplierTransactions.map((transaction) => (
                <div key={transaction.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem' }}>
                  <strong style={{ color: '#0f172a' }}>{transaction.supplier?.name || 'Unknown supplier'}</strong>
                  <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.84rem' }}>{formatDate(transaction.transactionDate)} • {transaction.transactionType || 'Unknown type'}</div>
                  <div style={{ marginTop: '0.45rem', color: '#0f172a', fontWeight: 800 }}>{money(transaction.amount)}</div>
                </div>
              ))
            )}

            {activeActivity === 'payroll' && (
              !state.payrollPeriods.length ? (
                <EmptyState message="No payroll timeline available right now." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '0.82rem 0.9rem', color: '#475569', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>Period</th>
                        <th style={{ textAlign: 'left', padding: '0.82rem 0.9rem', color: '#475569', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>Mode</th>
                        <th style={{ textAlign: 'left', padding: '0.82rem 0.9rem', color: '#475569', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '0.82rem 0.9rem', color: '#475569', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.payrollPeriods.map((period, index) => (
                        <tr key={period.id} style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>
                          <td style={{ padding: '0.86rem 0.9rem', borderBottom: '1px solid #eef2f7', color: '#0f172a' }}>{period.description || `Period ${period.id}`}</td>
                          <td style={{ padding: '0.86rem 0.9rem', borderBottom: '1px solid #eef2f7', color: '#334155', textTransform: 'capitalize' }}>{String(period.payrollMode || '').replace('_', ' ') || '—'}</td>
                          <td style={{ padding: '0.86rem 0.9rem', borderBottom: '1px solid #eef2f7' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.22rem 0.58rem', fontSize: '0.76rem', fontWeight: 700, backgroundColor: period.status === 'finalized' ? '#dcfce7' : '#e2e8f0', color: period.status === 'finalized' ? '#166534' : '#334155' }}>
                              {period.status || 'draft'}
                            </span>
                          </td>
                          <td style={{ padding: '0.86rem 0.9rem', borderBottom: '1px solid #eef2f7', color: '#334155' }}>{formatDate(period.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportHistoryTab;