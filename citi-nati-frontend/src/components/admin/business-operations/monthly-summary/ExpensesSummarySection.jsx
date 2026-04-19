import React from 'react';
import MonthlySummaryEmptyState from './MonthlySummaryEmptyState.jsx';

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ExpensesSummarySection = ({ loading, error, summary, onOpen }) => {
  const topCategories = Array.isArray(summary?.topCategories) ? summary.topCategories : [];

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', backgroundColor: '#fff', padding: '1rem 1.05rem', display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#0f172a' }}>Expenses Overview</strong>
        </div>
        <button type="button" onClick={onOpen} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '0.43rem 0.72rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Open Expenses</button>
      </div>

      {error ? <MonthlySummaryEmptyState title="Expenses data unavailable" message={error} icon="fa-triangle-exclamation" /> : null}
      {loading ? <MonthlySummaryEmptyState title="Loading expenses" message="Fetching expense totals for selected period." icon="fa-spinner fa-spin" /> : null}
      {!loading && !error ? (
        <>
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Total Expenses</span><strong style={{ color: '#0f172a' }}>{money(summary?.totals?.totalAmount)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Records</span><strong style={{ color: '#0f172a' }}>{Number(summary?.totals?.totalExpenses || 0).toLocaleString('en-US')}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Average Expense</span><strong style={{ color: '#0f172a' }}>{money(summary?.totals?.averageAmount)}</strong></div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Top Categories</div>
            {!topCategories.length ? (
              <MonthlySummaryEmptyState title="No category activity" message="No categories matched this period/filter." icon="fa-receipt" />
            ) : (
              <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.45rem' }}>
                {topCategories.slice(0, 5).map((item) => (
                  <div key={item.expenseCategoryId} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
                    <span style={{ color: '#475569' }}>{item.category?.name || 'Unknown category'}</span>
                    <strong style={{ color: '#0f172a' }}>{money(item.totalAmount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default ExpensesSummarySection;
