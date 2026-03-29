import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';

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

const ActivitySection = ({ title, description, items, renderItem }) => (
  <div style={{ ...cardStyle, overflow: 'hidden' }}>
    <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
      <strong style={{ color: '#0f172a' }}>{title}</strong>
      <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>{description}</p>
    </div>
    {!items.length ? (
      <EmptyState message={`No ${title.toLowerCase()} available right now.`} />
    ) : (
      <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem' }}>
        {items.map(renderItem)}
      </div>
    )}
  </div>
);

const ReportHistoryTab = ({ refreshKey = 0 }) => {
  const [state, setState] = useState({
    loading: true,
    error: '',
    salesSummary: null,
    invoices: [],
    expenses: [],
    supplierTransactions: [],
    payrollPeriods: [],
  });

  const fetchActivity = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    const monthParams = getCurrentMonthParams();

    try {
      const [salesSummaryResponse, invoicesResponse, expensesResponse, supplierTransactionsResponse, payrollPeriodsResponse] = await Promise.all([
        api.get('/business-operations/reports/sales/summary', { params: monthParams }),
        api.get('/business-operations/reports/sales/invoices', { params: { ...monthParams, page: 1, pageSize: 5, sortBy: 'invoiceDate', sortOrder: 'desc' } }),
        api.get('/business-operations/expenses', { params: { page: 1, pageSize: 5, sortBy: 'expenseDate', sortOrder: 'desc' } }),
        api.get('/business-operations/suppliers/transactions/list', { params: { page: 1, pageSize: 5, sortBy: 'transactionDate', sortOrder: 'desc' } }),
        api.get('/business-operations/payroll/periods', { params: { page: 1, pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc' } }),
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
      setState({
        loading: false,
        error: requestError.response?.data?.error || 'Failed to load report history activity',
        salesSummary: null,
        invoices: [],
        expenses: [],
        supplierTransactions: [],
        payrollPeriods: [],
      });
    }
  }, []);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity, refreshKey]);

  const snapshotCards = useMemo(() => ([
    { label: 'Net Sales This Month', value: money(state.salesSummary?.netSales), note: 'Latest monthly reporting snapshot.' },
    { label: 'Invoices This Month', value: Number(state.salesSummary?.totalInvoices || 0).toLocaleString('en-US'), note: 'Invoice count in the current month.' },
    { label: 'Recent Expenses', value: state.expenses.length.toLocaleString('en-US'), note: 'Latest expense rows visible now.' },
    { label: 'Supplier Events', value: state.supplierTransactions.length.toLocaleString('en-US'), note: 'Recent supplier transaction events.' },
  ]), [state.expenses.length, state.salesSummary?.netSales, state.salesSummary?.totalInvoices, state.supplierTransactions.length]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Report History</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '860px' }}>
              There is no persisted export log in the backend yet, so this panel surfaces the latest operational reporting activity across sales, expenses, suppliers, and payroll until report storage is added.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchActivity}
            disabled={state.loading}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: state.loading ? 'not-allowed' : 'pointer' }}
          >
            <i className={`fas ${state.loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }}></i>
            Refresh
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
          {snapshotCards.map((item) => (
            <div key={item.label} style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{item.label}</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>{item.value}</div>
              <div style={{ marginTop: '0.3rem', color: '#64748b', fontSize: '0.84rem' }}>{item.note}</div>
            </div>
          ))}
        </div>
      </div>

      {state.error ? (
        <ErrorState message={state.error} />
      ) : state.loading ? (
        <div style={cardStyle}><EmptyState message="Loading report activity..." /></div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <ActivitySection
            title="Latest Sales Invoices"
            description="Most recent sales invoices from the current month reporting window."
            items={state.invoices}
            renderItem={(invoice) => (
              <div key={invoice.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem' }}>
                <strong style={{ color: '#0f172a' }}>{invoice.sourceInvoiceNo || invoice.refNo || `Invoice ${invoice.id}`}</strong>
                <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.84rem' }}>{formatDate(invoice.invoiceDate)} • {invoice.userName || 'Unknown cashier'} • {invoice.branchCode || 'No branch'}</div>
                <div style={{ marginTop: '0.45rem', color: '#0f172a', fontWeight: 800 }}>{money(invoice.netSale)}</div>
              </div>
            )}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            <ActivitySection
              title="Recent Expenses"
              description="Newest imported expense records across the operations workspace."
              items={state.expenses}
              renderItem={(expense) => (
                <div key={expense.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem' }}>
                  <strong style={{ color: '#0f172a' }}>{expense.description || expense.expenseCategory?.name || 'Expense entry'}</strong>
                  <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.84rem' }}>{formatDate(expense.expenseDate)} • {expense.expenseCategory?.name || 'No category'}</div>
                  <div style={{ marginTop: '0.45rem', color: '#0f172a', fontWeight: 800 }}>{money(expense.amount)}</div>
                </div>
              )}
            />

            <ActivitySection
              title="Supplier Transactions"
              description="Latest supplier ledger movement currently recorded."
              items={state.supplierTransactions}
              renderItem={(transaction) => (
                <div key={transaction.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem' }}>
                  <strong style={{ color: '#0f172a' }}>{transaction.supplier?.name || 'Unknown supplier'}</strong>
                  <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.84rem' }}>{formatDate(transaction.transactionDate)} • {transaction.transactionType || 'Unknown type'}</div>
                  <div style={{ marginTop: '0.45rem', color: '#0f172a', fontWeight: 800 }}>{money(transaction.amount)}</div>
                </div>
              )}
            />
          </div>

          <ActivitySection
            title="Payroll Timeline"
            description="Latest payroll periods created in the operations module."
            items={state.payrollPeriods}
            renderItem={(period) => (
              <div key={period.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem' }}>
                <strong style={{ color: '#0f172a' }}>{period.description || String(period.payrollMode || '').replace('_', ' ') || `Period ${period.id}`}</strong>
                <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.84rem' }}>{period.status || 'Unknown status'} • {formatDate(period.createdAt)}</div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default ReportHistoryTab;