import React from 'react';

const EmployeesEmptyState = ({
  title = 'Nothing here yet',
  message = '',
  actionLabel = '',
  onAction = null,
  icon = 'fa-users',
}) => (
  <div style={{ padding: '2.2rem 1.2rem', textAlign: 'center', color: '#64748b', backgroundColor: '#fff' }}>
    <i
      className={`fas ${icon}`}
      style={{ fontSize: '1.85rem', marginBottom: '0.72rem', display: 'block', opacity: 0.4 }}
    />
    <div style={{ fontWeight: 700, marginBottom: '0.35rem', color: '#0f172a', fontSize: '0.98rem' }}>{title}</div>
    {message && (
      <div style={{ fontSize: '0.88rem', lineHeight: 1.55, maxWidth: '340px', margin: '0 auto 0.95rem' }}>
        {message}
      </div>
    )}
    {onAction && actionLabel && (
      <button
        type="button"
        onClick={onAction}
        style={{
          border: 'none',
          backgroundColor: '#5B4B8A',
          color: '#fff',
          borderRadius: '10px',
          padding: '0.7rem 1.1rem',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: '0.9rem',
        }}
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export default EmployeesEmptyState;
