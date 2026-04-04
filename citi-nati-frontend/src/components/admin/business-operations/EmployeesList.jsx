import React from 'react';
import EmployeesEmptyState from './EmployeesEmptyState.jsx';

const buildFullName = (e) =>
  [e?.firstName, e?.middleName, e?.surname].filter(Boolean).join(' ') || 'Unknown';

const money = (value, currency = 'MWK') => {
  if (value === null || value === undefined || value === '') return '—';
  return `${currency} ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const thStyle = {
  textAlign: 'left',
  padding: '0.85rem 0.9rem',
  color: '#475569',
  fontSize: '0.76rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const tdStyle = {
  padding: '0.88rem 0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
};

const statusBadge = (status) => ({
  display: 'inline-flex',
  borderRadius: '999px',
  padding: '0.3rem 0.65rem',
  fontSize: '0.76rem',
  fontWeight: 800,
  textTransform: 'capitalize',
  backgroundColor: status === 'active' ? '#dcfce7' : status === 'terminated' ? '#fee2e2' : '#f1f5f9',
  color: status === 'active' ? '#166534' : status === 'terminated' ? '#b91c1c' : '#475569',
});

const locationLabel = (item) => {
  if (item?.locationName) return item.locationName;
  if (item?.locationCode) return item.locationCode;
  if (item?.locationId) return `Location #${item.locationId}`;
  return null;
};

const EmployeesList = ({
  employees,
  loading,
  error,
  pagination,
  page,
  onPageChange,
  selectedEmployeeId,
  onSelectEmployee,
  onEditEmployee,
  onDeleteEmployee,
}) => {
  if (error) return <div style={{ padding: '1rem', color: '#b91c1c', fontSize: '0.9rem' }}>{error}</div>;

  if (loading) {
    return (
      <EmployeesEmptyState
        title="Loading employees"
        message="Fetching employee records."
        icon="fa-spinner fa-spin"
      />
    );
  }

  if (!employees.length) {
    return (
      <EmployeesEmptyState
        title="No employees found"
        message="Adjust filters or add the first employee to begin manual setup."
        icon="fa-users"
      />
    );
  }

  return (
    <>
      <div style={{ overflowX: 'auto', maxHeight: '560px', overflowY: 'auto', backgroundColor: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Dept / Position</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Contact</th>
              <th style={thStyle}>Current Salary</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, index) => {
              const selected = emp.id === selectedEmployeeId;
              const latestSalary = emp.salaryStructures?.[0] || null;
              const normalStatus = String(emp.status || '').toLowerCase();

              return (
                <tr
                  key={emp.id}
                  onClick={() => onSelectEmployee(emp)}
                  onMouseEnter={(event) => {
                    if (!selected) event.currentTarget.style.backgroundColor = '#f8fafc';
                  }}
                  onMouseLeave={(event) => {
                    if (!selected) event.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#fcfdff';
                  }}
                  style={{ backgroundColor: selected ? '#ede9fe' : (index % 2 === 0 ? '#fff' : '#fcfdff'), cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                >
                  <td style={tdStyle}>
                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                      <strong>{buildFullName(emp)}</strong>
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{emp.employeeNo || 'No number'}</span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                      <span>{emp.department || '—'}</span>
                      <span style={{ color: '#64748b', fontSize: '0.83rem' }}>{emp.position || '—'}</span>
                      {locationLabel(emp) && <span style={{ color: '#94a3b8', fontSize: '0.79rem' }}>{locationLabel(emp)}</span>}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={statusBadge(normalStatus)}>{emp.status || 'unknown'}</span>
                  </td>
                  <td style={tdStyle}>{emp.contactNumber || '—'}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                      <strong>{latestSalary ? money(latestSalary.agreedSalaryPerMonth, latestSalary.currency) : '—'}</strong>
                      {latestSalary && (
                        <span style={{ color: '#94a3b8', fontSize: '0.79rem' }}>From {formatDate(latestSalary.effectiveFrom)}</span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditEmployee(emp); }}
                        style={{
                          border: '1px solid #dbe2ea',
                          backgroundColor: '#fff',
                          color: '#334155',
                          borderRadius: '8px',
                          padding: '0.42rem 0.75rem',
                          fontSize: '0.79rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete employee "${buildFullName(emp)}"? This cannot be undone.`)) {
                            onDeleteEmployee(emp);
                          }
                        }}
                        style={{
                          border: '1px solid #fca5a5',
                          backgroundColor: '#fff',
                          color: '#b91c1c',
                          borderRadius: '8px',
                          padding: '0.42rem 0.75rem',
                          fontSize: '0.79rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagination && (pagination.totalPages || 0) > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.95rem 1rem',
          borderTop: '1px solid #e2e8f0',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: '#64748b', fontSize: '0.86rem' }}>
            Page {pagination.page || page} of {pagination.totalPages || 1} — {(pagination.total || 0).toLocaleString('en-US')} employees
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={(pagination.page || page) <= 1}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '8px', padding: '0.45rem 0.85rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={(pagination.page || page) >= (pagination.totalPages || 1)}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '8px', padding: '0.45rem 0.85rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default EmployeesList;
