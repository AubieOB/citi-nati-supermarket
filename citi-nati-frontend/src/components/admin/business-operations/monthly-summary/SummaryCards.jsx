import React from 'react';

const SummaryCards = ({ cards }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
    {cards.map((card) => (
      <div key={card.label} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.92rem 0.95rem', display: 'grid', gap: '0.32rem' }}>
        <span style={{ color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>{card.label}</span>
        <strong style={{ color: card.tone || '#0f172a', fontSize: '1.14rem', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{card.value}</strong>
        <span style={{ color: '#64748b', fontSize: '0.79rem' }}>{card.note}</span>
      </div>
    ))}
  </div>
);

export default SummaryCards;
