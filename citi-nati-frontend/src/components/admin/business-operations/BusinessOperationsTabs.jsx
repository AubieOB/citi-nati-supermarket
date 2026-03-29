import React from 'react';

const tabStyle = (active) => ({
  border: 'none',
  background: active ? '#5B4B8A' : 'transparent',
  color: active ? '#fff' : '#475569',
  borderRadius: '999px',
  padding: '0.7rem 1rem',
  fontSize: '0.9rem',
  fontWeight: active ? 700 : 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
  boxShadow: active ? '0 10px 24px rgba(91, 75, 138, 0.22)' : 'none',
  transition: 'all 0.2s ease',
});

const BusinessOperationsTabs = ({ tabs, activeTab, onChange }) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.45rem',
        overflowX: 'auto',
        paddingBottom: '0.1rem',
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          style={tabStyle(activeTab === tab.id)}
        >
          <i className={`fas ${tab.icon}`}></i>
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default BusinessOperationsTabs;
