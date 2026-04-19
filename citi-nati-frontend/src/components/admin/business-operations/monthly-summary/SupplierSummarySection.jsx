import React from 'react';
import MonthlySummaryEmptyState from './MonthlySummaryEmptyState.jsx';

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SupplierSummarySection = ({ loading, error, data, onOpen }) => {
  const paymentMethods = data?.paymentMethods || [];

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', backgroundColor: '#fff', padding: '1rem 1.05rem', display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#0f172a' }}>Supplier Overview</strong>
        </div>
        <button type="button" onClick={onOpen} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '0.43rem 0.72rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Open Suppliers</button>
      </div>

      {error ? <MonthlySummaryEmptyState title="Supplier data unavailable" message={error} icon="fa-triangle-exclamation" /> : null}
      {loading ? <MonthlySummaryEmptyState title="Loading suppliers" message="Fetching supplier balances and payment transactions." icon="fa-spinner fa-spin" /> : null}
      {!loading && !error ? (
        <>
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Supplier Payments</span><strong style={{ color: '#0f172a' }}>{money(data?.totalPayments)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Outstanding Supplier Debt</span><strong style={{ color: '#0f172a' }}>{money(data?.outstandingDebt)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Active Suppliers</span><strong style={{ color: '#0f172a' }}>{Number(data?.activeSuppliers || 0).toLocaleString('en-US')}</strong></div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Payments by Method</div>
            {!paymentMethods.length ? (
              <MonthlySummaryEmptyState title="No payment-method split" message="No supplier payments matched this period/filter." icon="fa-wallet" />
            ) : (
              <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.45rem' }}>
                {paymentMethods.slice(0, 5).map((item) => (
                  <div key={item.method} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
                    <span style={{ color: '#475569', textTransform: 'capitalize' }}>{item.method || 'unknown'}</span>
                    <strong style={{ color: '#0f172a' }}>{money(item.amount)}</strong>
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

export default SupplierSummarySection;
