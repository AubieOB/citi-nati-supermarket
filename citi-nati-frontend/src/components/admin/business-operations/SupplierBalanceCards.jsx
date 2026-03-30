import React from 'react';

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARD_ITEMS = [
  { key: 'openingBalance', label: 'Opening Balance' },
  { key: 'totalDebt', label: 'Total Debt' },
  { key: 'totalPaid', label: 'Total Paid' },
  { key: 'totalAdjustment', label: 'Adjustments' },
  { key: 'outstandingBalance', label: 'Outstanding Balance' },
];

const SupplierBalanceCards = ({ summary }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.8rem' }}>
      {CARD_ITEMS.map((item) => (
        <div
          key={item.key}
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '0.95rem 1rem',
            display: 'grid',
            gap: '0.35rem',
          }}
        >
          <span
            style={{
              color: '#64748b',
              fontSize: '0.76rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 800,
            }}
          >
            {item.label}
          </span>
          <strong style={{ color: '#0f172a', fontSize: '1.05rem' }}>{money(summary?.[item.key])}</strong>
        </div>
      ))}
    </div>
  );
};

export default SupplierBalanceCards;
