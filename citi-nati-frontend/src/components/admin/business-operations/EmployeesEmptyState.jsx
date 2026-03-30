import React from 'react';

const EmployeesEmptyState = ({
  title = 'Nothing here yet',
  message = '',
  actionLabel = '',
  onAction = null,
  icon = 'fa-users',
}) => (
  <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
    <i
      className={`fas ${icon}`}
      style={{ fontSize: '2rem', marginBottom: '0.75rem', display: 'block', opacity: 0.35 }}
    />
    <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: '#0f172a', fontSize: '1rem' }}>{title}</div>
    {message && (
      <div style={{ fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '340px', margin: '0 auto 1rem' }}>
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
