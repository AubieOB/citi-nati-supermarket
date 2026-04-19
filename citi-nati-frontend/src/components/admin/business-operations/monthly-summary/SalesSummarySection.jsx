import React from 'react';
import MonthlySummaryEmptyState from './MonthlySummaryEmptyState.jsx';

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SalesSummarySection = ({ loading, error, summary, payments, onOpen }) => {
  const hasRows = Array.isArray(payments) && payments.length > 0;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', backgroundColor: '#fff', padding: '1rem 1.05rem', display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#0f172a' }}>Sales Overview</strong>
        </div>
        <button type="button" onClick={onOpen} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '0.43rem 0.72rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Open Sales Reports</button>
      </div>

      {error ? <MonthlySummaryEmptyState title="Sales data unavailable" message={error} icon="fa-triangle-exclamation" /> : null}
      {loading ? <MonthlySummaryEmptyState title="Loading sales" message="Fetching sales summary for selected period." icon="fa-spinner fa-spin" /> : null}
      {!loading && !error ? (
        <>
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Total Sales</span><strong style={{ color: '#0f172a' }}>{money(summary?.netSales)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Invoices</span><strong style={{ color: '#0f172a' }}>{Number(summary?.totalInvoices || 0).toLocaleString('en-US')}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Average Sale</span><strong style={{ color: '#0f172a' }}>{money(summary?.averageInvoiceValue)}</strong></div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>By Payment Method</div>
            {!hasRows ? (
              <MonthlySummaryEmptyState title="No payment breakdown" message="No payment records matched this period/filter." icon="fa-wallet" />
            ) : (
              <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.45rem' }}>
                {payments.slice(0, 5).map((row) => (
                  <div key={row.payMethod} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
                    <span style={{ color: '#475569', textTransform: 'capitalize' }}>{row.payMethod || 'unknown'}</span>
                    <strong style={{ color: '#0f172a' }}>{money(row.totalAmount)}</strong>
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

export default SalesSummarySection;
