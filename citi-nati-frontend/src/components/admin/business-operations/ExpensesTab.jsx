import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';

const cardStyle = {
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
};

const tdStyle = {
  padding: '0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
};

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

const EmptyState = ({ message }) => (
  <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>{message}</div>
);

const ErrorState = ({ message }) => (
  <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
    {message}
  </div>
);

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

const ExpensesTab = ({ refreshKey = 0 }) => {
  const initialRange = getCurrentMonthRange();
  const [filters, setFilters] = useState({
    search: '',
    expenseCategoryId: '',
    startDate: initialRange.startDate,
    endDate: initialRange.endDate,
  });
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const queryParams = useMemo(() => ({
    page,
    pageSize: 25,
    sortBy: 'expenseDate',
    sortOrder: 'desc',
    search: filters.search || undefined,
    expenseCategoryId: filters.expenseCategoryId || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  }), [filters.endDate, filters.expenseCategoryId, filters.search, filters.startDate, page]);

  const fetchExpensesData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [categoriesResponse, summaryResponse, expensesResponse] = await Promise.all([
        api.get('/business-operations/expenses/categories', { params: { page: 1, pageSize: 200, sortBy: 'name', sortOrder: 'asc', isActive: true } }),
        api.get('/business-operations/expenses/summary/overview', { params: queryParams }),
        api.get('/business-operations/expenses', { params: queryParams }),
      ]);

      setCategories(categoriesResponse.data?.data || []);
      setSummary(summaryResponse.data?.data || null);
      setExpenses(expensesResponse.data?.data || []);
      setPagination(expensesResponse.data?.pagination || null);
    } catch (requestError) {
      setCategories([]);
      setSummary(null);
      setExpenses([]);
      setPagination(null);
      setError(requestError.response?.data?.error || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    fetchExpensesData();
  }, [fetchExpensesData, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [filters.expenseCategoryId, filters.search, filters.startDate, filters.endDate]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Expenses</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '780px' }}>
              Imported expenses and categories are live here, with totals, top categories, and a searchable expense register.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchExpensesData}
            disabled={loading}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }}></i>
            Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem', display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Expense Count</span>
            <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{(summary?.totals?.totalExpenses || 0).toLocaleString('en-US')}</strong>
            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Rows matching the active filters.</span>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem', display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Total Amount</span>
            <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{money(summary?.totals?.totalAmount)}</strong>
            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Aggregate spending for the selected range.</span>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem', display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Average Expense</span>
            <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{money(summary?.totals?.averageAmount)}</strong>
            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Average row amount in the current result set.</span>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem', display: 'grid', gap: '0.35rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Active Categories</span>
            <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{categories.length.toLocaleString('en-US')}</strong>
            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Expense categories available for imported entries.</span>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', top: '50%', left: '0.95rem', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
            <input
              type="text"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search by description, reference, payment method, or category"
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.85rem 1rem 0.85rem 2.7rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem' }}
            />
          </div>
          <select
            value={filters.expenseCategoryId}
            onChange={(event) => setFilters((current) => ({ ...current, expenseCategoryId: event.target.value }))}
            style={{ minWidth: '220px', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem', backgroundColor: '#fff' }}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
            style={{ padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem' }}
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
            style={{ padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem' }}
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div style={cardStyle}><EmptyState message="Loading expenses..." /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <strong style={{ color: '#0f172a' }}>Top Expense Categories</strong>
                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Largest categories in the current filter window.</p>
              </div>
              {!summary?.topCategories?.length ? (
                <EmptyState message="No category totals are available for the current filters." />
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem' }}>
                  {summary.topCategories.map((item) => (
                    <div key={item.expenseCategoryId} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.85rem 0.95rem', display: 'grid', gap: '0.2rem' }}>
                      <strong style={{ color: '#0f172a' }}>{item.category?.name || 'Unknown category'}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{item.category?.code || 'No code'} • {item.expenseCount} expenses</span>
                      <span style={{ color: '#0f172a', fontWeight: 800 }}>{money(item.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <strong style={{ color: '#0f172a' }}>Recent Expense Activity</strong>
                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Newest expense rows matching the active filters.</p>
              </div>
              {!summary?.recentExpenses?.length ? (
                <EmptyState message="No recent expense activity matched the active filters." />
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem' }}>
                  {summary.recentExpenses.map((expense) => (
                    <div key={expense.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.85rem 0.95rem', display: 'grid', gap: '0.2rem' }}>
                      <strong style={{ color: '#0f172a' }}>{expense.description || expense.expenseCategory?.name || 'Expense entry'}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{formatDate(expense.expenseDate)} • {expense.expenseCategory?.name || 'No category'}</span>
                      <span style={{ color: '#0f172a', fontWeight: 800 }}>{money(expense.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
              <strong style={{ color: '#0f172a' }}>Expense Register</strong>
              <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Detailed imported expense rows for the active range and filters.</p>
            </div>

            {!expenses.length ? (
              <EmptyState message="No expenses matched the current filters." />
            ) : (
              <>
                <div style={{ overflowX: 'auto', maxHeight: '520px' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Category</th>
                        <th style={thStyle}>Description</th>
                        <th style={thStyle}>Payment Method</th>
                        <th style={thStyle}>Reference</th>
                        <th style={thStyle}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td style={tdStyle}>{formatDate(expense.expenseDate)}</td>
                          <td style={tdStyle}>{expense.expenseCategory?.name || 'Uncategorized'}</td>
                          <td style={tdStyle}>{expense.description || 'No description'}</td>
                          <td style={tdStyle}>{expense.paymentMethod || 'Not set'}</td>
                          <td style={tdStyle}>{expense.referenceNo || 'Not set'}</td>
                          <td style={tdStyle}>{money(expense.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '1rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                  <span style={{ color: '#64748b', fontSize: '0.88rem' }}>Page {pagination?.page || 1} of {pagination?.totalPages || 1} with {(pagination?.total || 0).toLocaleString('en-US')} expenses.</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={(pagination?.page || 1) <= 1} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Previous</button>
                    <button type="button" onClick={() => setPage((current) => current + 1)} disabled={(pagination?.page || 1) >= (pagination?.totalPages || 1)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ExpensesTab;