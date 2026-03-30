import React from 'react';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '1rem 1.1rem',
  display: 'grid',
  gap: '0.35rem',
};

const EmployeeSummaryCards = ({ totalEmployees = 0, activeCount = 0, inactiveCount = 0, departmentCount = 0 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.9rem' }}>
    <div style={cardStyle}>
      <span style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
        Total Employees
      </span>
      <strong style={{ fontSize: '1.6rem', color: '#0f172a' }}>{totalEmployees.toLocaleString('en-US')}</strong>
      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Records matching active filters.</span>
    </div>
    <div style={cardStyle}>
      <span style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
        Active
      </span>
      <strong style={{ fontSize: '1.6rem', color: '#166534' }}>{activeCount.toLocaleString('en-US')}</strong>
      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Currently active employees on page.</span>
    </div>
    <div style={cardStyle}>
      <span style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
        Inactive / Terminated
      </span>
      <strong style={{ fontSize: '1.6rem', color: '#475569' }}>{inactiveCount.toLocaleString('en-US')}</strong>
      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Non-active employees on page.</span>
    </div>
    <div style={cardStyle}>
      <span style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
        Departments
      </span>
      <strong style={{ fontSize: '1.6rem', color: '#0f172a' }}>{departmentCount.toLocaleString('en-US')}</strong>
      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Distinct departments visible on page.</span>
    </div>
  </div>
);

export default EmployeeSummaryCards;
