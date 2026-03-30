import React from 'react';

const NetSummaryCard = ({ sales, expenses, payroll, supplierPayments, netValue, rawNetValue, isComplete }) => {
  const positive = (rawNetValue ?? 0) >= 0;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', backgroundColor: '#fff', padding: '1rem 1.05rem', display: 'grid', gap: '0.55rem' }}>
      <div style={{ color: '#334155', fontWeight: 800, fontSize: '0.9rem' }}>Net Summary</div>
      <div style={{ color: '#64748b', fontSize: '0.82rem' }}>
        Net Position = Sales - Expenses - Payroll - Supplier Payments
      </div>
      <div style={{ display: 'grid', gap: '0.3rem', marginTop: '0.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Sales</span><strong style={{ color: '#0f172a' }}>{sales}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Expenses</span><strong style={{ color: '#0f172a' }}>- {expenses}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Payroll</span><strong style={{ color: '#0f172a' }}>- {payroll}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Supplier Payments</span><strong style={{ color: '#0f172a' }}>- {supplierPayments}</strong></div>
      </div>
      <div style={{ marginTop: '0.3rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.62rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <span style={{ color: positive ? '#166534' : '#b91c1c', fontWeight: 800, fontSize: '0.88rem' }}>{positive ? 'Profit (approx.)' : 'Loss (approx.)'}</span>
        <strong style={{ color: positive ? '#166534' : '#b91c1c', fontSize: '1.2rem' }}>{netValue}</strong>
      </div>
      {!isComplete ? (
        <div style={{ marginTop: '0.2rem', color: '#b45309', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.55rem 0.66rem', fontSize: '0.8rem' }}>
          Net value is based on partial data because one or more sections failed to load.
        </div>
      ) : null}
    </div>
  );
};

export default NetSummaryCard;
