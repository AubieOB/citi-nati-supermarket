import React from 'react';

const metricCardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  padding: '1rem 1.1rem',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
  minHeight: '120px',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value) => Number(value || 0).toLocaleString('en-US');

const cards = [
  { key: 'totalInvoices', label: 'Total Invoices', format: number, icon: 'fa-receipt', accent: '#2563eb' },
  { key: 'totalItemsSold', label: 'Total Items Sold', format: number, icon: 'fa-box-open', accent: '#0f766e' },
  { key: 'grossSales', label: 'Gross Sales', format: money, icon: 'fa-sack-dollar', accent: '#7c3aed' },
  { key: 'vatTotal', label: 'VAT Total', format: money, icon: 'fa-percent', accent: '#dc2626' },
  { key: 'discountTotal', label: 'Discount Total', format: money, icon: 'fa-tags', accent: '#ea580c' },
  { key: 'netSales', label: 'Net Sales', format: money, icon: 'fa-chart-line', accent: '#059669' },
  { key: 'averageInvoiceValue', label: 'Average Invoice Value', format: money, icon: 'fa-scale-balanced', accent: '#4f46e5' },
];

const SalesSummaryCards = ({ summary, loading }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
      }}
    >
      {cards.map((card) => (
        <div key={card.key} style={metricCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {card.label}
            </span>
            <span
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${card.accent}16`,
                color: card.accent,
              }}
            >
              <i className={`fas ${card.icon}`}></i>
            </span>
          </div>
          <div style={{ marginTop: '1rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
            {loading ? 'Loading...' : card.format(summary?.[card.key])}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SalesSummaryCards;
