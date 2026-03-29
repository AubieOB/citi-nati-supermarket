import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EmptyState = ({ message }) => (
  <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>{message}</div>
);

const ErrorState = ({ message }) => (
  <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
    {message}
  </div>
);

function buildMonthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

const monthOptions = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const MonthlySummaryTab = ({ refreshKey = 0 }) => {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [state, setState] = useState({
    loading: true,
    error: '',
    salesSummary: null,
    salesMeta: null,
    expenseSummary: null,
    totalEmployees: 0,
    activeEmployees: 0,
    totalSuppliers: 0,
    totalPayrollEntries: 0,
    monthTerminations: 0,
    monthReengagements: 0,
  });

  const fetchSummary = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    const monthRange = buildMonthRange(selectedYear, selectedMonth);

    try {
      const [salesResponse, expenseSummaryResponse, totalEmployeesResponse, activeEmployeesResponse, suppliersResponse, payrollEntriesResponse, terminationsResponse, reengagementsResponse] = await Promise.all([
        api.get('/business-operations/reports/sales/summary', { params: { periodType: 'month', month: String(selectedMonth), year: String(selectedYear) } }),
        api.get('/business-operations/expenses/summary/overview', { params: monthRange }),
        api.get('/business-operations/employees', { params: { page: 1, pageSize: 1, sortBy: 'createdAt', sortOrder: 'desc' } }),
        api.get('/business-operations/employees', { params: { page: 1, pageSize: 1, status: 'active', sortBy: 'createdAt', sortOrder: 'desc' } }),
        api.get('/business-operations/suppliers', { params: { page: 1, pageSize: 1, sortBy: 'createdAt', sortOrder: 'desc' } }),
        api.get('/business-operations/payroll/entries', { params: { page: 1, pageSize: 1, sortBy: 'createdAt', sortOrder: 'desc' } }),
        api.get('/business-operations/payroll/terminations', { params: { page: 1, pageSize: 1, sortBy: 'terminationDate', sortOrder: 'desc', startDate: monthRange.startDate, endDate: monthRange.endDate } }),
        api.get('/business-operations/payroll/reengagements', { params: { page: 1, pageSize: 1, sortBy: 'effectiveDate', sortOrder: 'desc', startDate: monthRange.startDate, endDate: monthRange.endDate } }),
      ]);

      setState({
        loading: false,
        error: '',
        salesSummary: salesResponse.data?.data || null,
        salesMeta: { dateRange: salesResponse.data?.dateRange || null, filters: salesResponse.data?.filters || null },
        expenseSummary: expenseSummaryResponse.data?.data || null,
        totalEmployees: totalEmployeesResponse.data?.pagination?.total || 0,
        activeEmployees: activeEmployeesResponse.data?.pagination?.total || 0,
        totalSuppliers: suppliersResponse.data?.pagination?.total || 0,
        totalPayrollEntries: payrollEntriesResponse.data?.pagination?.total || 0,
        monthTerminations: terminationsResponse.data?.pagination?.total || 0,
        monthReengagements: reengagementsResponse.data?.pagination?.total || 0,
      });
    } catch (requestError) {
      setState({
        loading: false,
        error: requestError.response?.data?.error || 'Failed to load monthly summary',
        salesSummary: null,
        salesMeta: null,
        expenseSummary: null,
        totalEmployees: 0,
        activeEmployees: 0,
        totalSuppliers: 0,
        totalPayrollEntries: 0,
        monthTerminations: 0,
        monthReengagements: 0,
      });
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshKey]);

  const summaryCards = useMemo(() => ([
    { label: 'Net Sales', value: money(state.salesSummary?.netSales), note: 'Sales performance for the selected month.' },
    { label: 'Monthly Expenses', value: money(state.expenseSummary?.totals?.totalAmount), note: 'Expense total in the same month window.' },
    { label: 'Invoices', value: (state.salesSummary?.totalInvoices || 0).toLocaleString('en-US'), note: 'Invoices counted in the selected sales period.' },
    { label: 'Active Employees', value: state.activeEmployees.toLocaleString('en-US'), note: 'Current employee roster marked active.' },
    { label: 'Suppliers', value: state.totalSuppliers.toLocaleString('en-US'), note: 'Suppliers available in the operations module.' },
    { label: 'Payroll Entries', value: state.totalPayrollEntries.toLocaleString('en-US'), note: 'Imported payroll entries currently stored.' },
  ]), [state.activeEmployees, state.expenseSummary?.totals?.totalAmount, state.salesSummary?.netSales, state.salesSummary?.totalInvoices, state.totalPayrollEntries, state.totalSuppliers]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Monthly Summary</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '820px' }}>
              This view combines monthly sales and expenses with live workforce and operational counts so you can see the current business position without leaving the workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSummary}
            disabled={state.loading}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: state.loading ? 'not-allowed' : 'pointer' }}
          >
            <i className={`fas ${state.loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }}></i>
            Refresh
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))} style={{ minWidth: '200px', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem', backgroundColor: '#fff' }}>
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input type="number" min="2020" max="2100" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value || today.getFullYear()))} style={{ width: '140px', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem' }} />
        </div>

        {state.salesMeta?.dateRange && (
          <div style={{ marginTop: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '999px', backgroundColor: '#f1f5f9', color: '#334155', padding: '0.45rem 0.8rem', fontSize: '0.86rem', fontWeight: 700 }}>
            <i className="fas fa-calendar-days"></i>
            {state.salesMeta.dateRange.startDate} to {state.salesMeta.dateRange.endDate}
          </div>
        )}
      </div>

      {state.error ? (
        <ErrorState message={state.error} />
      ) : state.loading ? (
        <div style={cardStyle}><EmptyState message="Loading monthly summary..." /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
            {summaryCards.map((item) => (
              <div key={item.label} style={{ ...cardStyle, padding: '1rem 1.1rem', display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{item.label}</span>
                <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{item.value}</strong>
                <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{item.note}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            <div style={{ ...cardStyle, padding: '1rem 1.1rem', display: 'grid', gap: '0.8rem' }}>
              <div>
                <strong style={{ color: '#0f172a' }}>Commercial Snapshot</strong>
                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Core sales indicators for the selected month.</p>
              </div>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Gross Sales</span><strong style={{ color: '#0f172a' }}>{money(state.salesSummary?.grossSales)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>VAT</span><strong style={{ color: '#0f172a' }}>{money(state.salesSummary?.vatTotal)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Discounts</span><strong style={{ color: '#0f172a' }}>{money(state.salesSummary?.discountTotal)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Average Invoice</span><strong style={{ color: '#0f172a' }}>{money(state.salesSummary?.averageInvoiceValue)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Items Sold</span><strong style={{ color: '#0f172a' }}>{Number(state.salesSummary?.totalItemsSold || 0).toLocaleString('en-US')}</strong></div>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: '1rem 1.1rem', display: 'grid', gap: '0.8rem' }}>
              <div>
                <strong style={{ color: '#0f172a' }}>Operational Snapshot</strong>
                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Expense mix and HR movement for the selected month window.</p>
              </div>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Expense Count</span><strong style={{ color: '#0f172a' }}>{(state.expenseSummary?.totals?.totalExpenses || 0).toLocaleString('en-US')}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Average Expense</span><strong style={{ color: '#0f172a' }}>{money(state.expenseSummary?.totals?.averageAmount)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Terminations This Month</span><strong style={{ color: '#0f172a' }}>{state.monthTerminations.toLocaleString('en-US')}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Reengagements This Month</span><strong style={{ color: '#0f172a' }}>{state.monthReengagements.toLocaleString('en-US')}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#64748b' }}>Total Employees</span><strong style={{ color: '#0f172a' }}>{state.totalEmployees.toLocaleString('en-US')}</strong></div>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div>
              <strong style={{ color: '#0f172a' }}>Top Expense Categories</strong>
              <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Largest contributors to monthly operating spend.</p>
            </div>
            {!state.expenseSummary?.topCategories?.length ? (
              <EmptyState message="No expense categories matched the selected month." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem', marginTop: '1rem' }}>
                {state.expenseSummary.topCategories.map((item) => (
                  <div key={item.expenseCategoryId} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem' }}>
                    <strong style={{ color: '#0f172a' }}>{item.category?.name || 'Unknown category'}</strong>
                    <div style={{ marginTop: '0.35rem', color: '#64748b', fontSize: '0.84rem' }}>{item.expenseCount} expenses</div>
                    <div style={{ marginTop: '0.45rem', color: '#0f172a', fontWeight: 800 }}>{money(item.totalAmount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MonthlySummaryTab;