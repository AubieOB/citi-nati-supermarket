import React from 'react';

const SupplierEmptyState = ({
  title = 'Nothing to show yet',
  message,
  actionLabel,
  onAction,
  icon = 'fa-folder-open',
}) => {
  return (
    <div
      style={{
        padding: '2.2rem 1.4rem',
        display: 'grid',
        gap: '0.7rem',
        justifyItems: 'center',
        textAlign: 'center',
        color: '#64748b',
      }}
    >
      <div
        style={{
          width: '3.2rem',
          height: '3.2rem',
          borderRadius: '999px',
          backgroundColor: '#f8fafc',
          color: '#5B4B8A',
          display: 'grid',
          placeItems: 'center',
          fontSize: '1.1rem',
        }}
      >
        <i className={`fas ${icon}`}></i>
      </div>
      <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{title}</div>
      <div style={{ maxWidth: '420px', lineHeight: 1.6 }}>{message}</div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            border: 'none',
            backgroundColor: '#5B4B8A',
            color: '#fff',
            borderRadius: '10px',
            padding: '0.7rem 1rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
};

export default SupplierEmptyState;
