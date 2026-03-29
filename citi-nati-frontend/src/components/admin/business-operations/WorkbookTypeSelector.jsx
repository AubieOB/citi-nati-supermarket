import React from 'react';

const WorkbookTypeSelector = ({ selectedType, onSelect, disabled }) => {
  const options = [
    {
      id: 'payroll',
      label: 'Payroll Workbook',
      description: 'Contains employee master data, salary structures, payroll entries, loans, and termination records.',
      icon: 'fa-money-check-dollar',
    },
    {
      id: 'business',
      label: 'Business Workbook',
      description: 'Contains supplier master data, transactions, expense records, and operational costs.',
      icon: 'fa-chart-line',
    },
  ];

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>Select Workbook Type</h3>
        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.92rem' }}>
          Choose the workbook type that matches the file you want to upload.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.id)}
            style={{
              border: selectedType === option.id ? '2px solid #5B4B8A' : '2px solid #e2e8f0',
              backgroundColor: selectedType === option.id ? '#f8f6ff' : '#fff',
              borderRadius: '16px',
              padding: '1.25rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
              transition: 'all 0.2s ease',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: selectedType === option.id ? '#5B4B8A' : '#e2e8f0',
                  color: selectedType === option.id ? '#fff' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  flexShrink: 0,
                }}
              >
                <i className={`fas ${option.icon}`}></i>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem' }}>{option.label}</div>
                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem', lineHeight: 1.5 }}>
                  {option.description}
                </p>
              </div>
              {selectedType === option.id && (
                <div style={{ color: '#5B4B8A', fontSize: '1.3rem', flexShrink: 0 }}>
                  <i className="fas fa-check-circle"></i>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default WorkbookTypeSelector;
