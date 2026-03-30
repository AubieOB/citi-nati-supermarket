import React from 'react';

const MonthlySummaryEmptyState = ({ title, message, icon = 'fa-chart-line' }) => (
  <div
    style={{
      border: '1px dashed #cbd5e1',
      borderRadius: '14px',
      padding: '1rem 1.05rem',
      color: '#64748b',
      backgroundColor: '#f8fafc',
    }}
  >
    <div style={{ fontWeight: 800, color: '#334155', fontSize: '0.9rem' }}>
      <i className={`fas ${icon}`} style={{ marginRight: '0.4rem' }}></i>
      {title}
    </div>
    <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem', lineHeight: 1.55 }}>{message}</p>
  </div>
);

export default MonthlySummaryEmptyState;
