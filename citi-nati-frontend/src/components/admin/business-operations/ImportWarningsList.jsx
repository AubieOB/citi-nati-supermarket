import React from 'react';

const ImportWarningsList = ({ warnings, title = 'Warnings' }) => {
  if (!warnings || !warnings.length) return null;

  return (
    <div
      style={{
        backgroundColor: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: '12px',
        padding: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#b45309' }}>
        <i className="fas fa-triangle-exclamation"></i>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{title}</h4>
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#92400e' }}>
        {warnings.map((warning, idx) => (
          <li key={idx} style={{ fontSize: '0.88rem', lineHeight: 1.5, marginBottom: idx < warnings.length - 1 ? '0.4rem' : 0 }}>
            {typeof warning === 'string' ? warning : warning.message || JSON.stringify(warning)}
          </li>
        ))}
      </ul>
    </div>
  );
};

const ImportErrorsList = ({ errors, title = 'Errors' }) => {
  if (!errors || !errors.length) return null;

  return (
    <div
      style={{
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '12px',
        padding: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#b91c1c' }}>
        <i className="fas fa-circle-exclamation"></i>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{title}</h4>
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#7f1d1d' }}>
        {errors.map((error, idx) => (
          <li key={idx} style={{ fontSize: '0.88rem', lineHeight: 1.5, marginBottom: idx < errors.length - 1 ? '0.4rem' : 0 }}>
            {typeof error === 'string' ? error : error.message || JSON.stringify(error)}
          </li>
        ))}
      </ul>
    </div>
  );
};

export { ImportWarningsList, ImportErrorsList };
