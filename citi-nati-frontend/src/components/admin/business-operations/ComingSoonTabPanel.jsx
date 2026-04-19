import React from 'react';

const ComingSoonTabPanel = ({ title, description }) => {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '18px',
        padding: '2rem',
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%)',
          color: '#5B4B8A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.25rem',
          marginBottom: '1rem',
        }}
      >
        <i className="fas fa-layer-group"></i>
      </div>
      <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.25rem' }}>{title}</h3>
      <p style={{ margin: '0.75rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '700px' }}>
        {description || 'This section is coming soon.'}
      </p>
    </div>
  );
};

export default ComingSoonTabPanel;
