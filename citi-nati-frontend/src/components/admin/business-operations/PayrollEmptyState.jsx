import React from 'react';

const PayrollEmptyState = ({
  title = 'No data available',
  message = 'There is no payroll data to display right now.',
  actionLabel,
  onAction,
  icon = 'fas fa-money-check-dollar',
}) => {
  return (
    <div style={{ padding: '2.1rem 1.3rem', textAlign: 'center', display: 'grid', gap: '0.55rem' }}>
      <div style={{ width: '46px', height: '46px', borderRadius: '14px', margin: '0 auto', backgroundColor: '#f1f5f9', color: '#475569', display: 'grid', placeItems: 'center' }}>
        <i className={icon}></i>
      </div>
      <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>{title}</h4>
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>{message}</p>
      {actionLabel && onAction && (
        <div style={{ marginTop: '0.35rem' }}>
          <button
            type="button"
            onClick={onAction}
            style={{
              border: 'none',
              backgroundColor: '#5B4B8A',
              color: '#fff',
              borderRadius: '10px',
              padding: '0.62rem 1rem',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
            }}
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export default PayrollEmptyState;
