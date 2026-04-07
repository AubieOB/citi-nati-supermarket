import React from 'react';

const money = (value) =>
  `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '1rem 1.1rem',
  display: 'grid',
  gap: '0.35rem',
};

const ExpenseSummaryCards = ({ summary, categoryCount = 0 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.9rem' }}>
    <div style={cardStyle}>
      <span style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
        Expense Count
      </span>
      <strong style={{ fontSize: '1.42rem', lineHeight: 1.1, color: '#0f172a', whiteSpace: 'nowrap' }}>
        {(summary?.totals?.totalExpenses || 0).toLocaleString('en-US')}
      </strong>
      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Rows matching active filters.</span>
    </div>
    <div style={cardStyle}>
      <span style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
        Total Amount
      </span>
      <strong style={{ fontSize: '1.42rem', lineHeight: 1.1, color: '#0f172a', whiteSpace: 'nowrap' }}>{money(summary?.totals?.totalAmount)}</strong>
      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Aggregate spend for the date range.</span>
    </div>
    <div style={cardStyle}>
      <span style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
        Average Expense
      </span>
      <strong style={{ fontSize: '1.42rem', lineHeight: 1.1, color: '#0f172a', whiteSpace: 'nowrap' }}>{money(summary?.totals?.averageAmount)}</strong>
      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Average per expense row.</span>
    </div>
    <div style={cardStyle}>
      <span style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
        Active Categories
      </span>
      <strong style={{ fontSize: '1.42rem', lineHeight: 1.1, color: '#0f172a', whiteSpace: 'nowrap' }}>{categoryCount.toLocaleString('en-US')}</strong>
      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Categories available for expense entry.</span>
    </div>
  </div>
);

export default ExpenseSummaryCards;
