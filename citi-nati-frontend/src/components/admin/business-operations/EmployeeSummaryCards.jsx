import React from 'react';

const cardBaseStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '0.95rem 1rem',
  display: 'grid',
  gap: '0.36rem',
  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)',
};

const stats = ({ totalEmployees, activeCount, inactiveCount, departmentCount }) => ([
  { label: 'Total Employees', value: totalEmployees, note: 'Records in the current list context.', color: '#0f172a' },
  { label: 'Active', value: activeCount, note: 'Employees currently marked active.', color: '#166534' },
  { label: 'Inactive / Terminated', value: inactiveCount, note: 'Employees not currently active.', color: '#475569' },
  { label: 'Departments', value: departmentCount, note: 'Distinct departments represented.', color: '#0f172a' },
]);

const EmployeeSummaryCards = ({ totalEmployees = 0, activeCount = 0, inactiveCount = 0, departmentCount = 0 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem' }}>
    {stats({ totalEmployees, activeCount, inactiveCount, departmentCount }).map((item) => (
      <div key={item.label} style={cardBaseStyle}>
        <span style={{ color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
          {item.label}
        </span>
        <strong style={{ fontSize: '1.4rem', color: item.color, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{Number(item.value || 0).toLocaleString('en-US')}</strong>
        <span style={{ color: '#64748b', fontSize: '0.82rem' }}>{item.note}</span>
      </div>
    ))}
  </div>
);

export default EmployeeSummaryCards;
