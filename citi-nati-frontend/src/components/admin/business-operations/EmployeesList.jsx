import React from 'react';
import EmployeesEmptyState from './EmployeesEmptyState.jsx';
import { boConfirm } from '../../../utils/boDialogBus.js';

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

const statusBadge = (status, isAdminDarkTheme = false) => ({
  display: 'inline-flex',
  borderRadius: '999px',
  padding: '0.3rem 0.65rem',
  fontSize: '0.76rem',
  fontWeight: 800,
  textTransform: 'capitalize',
  backgroundColor: status === 'active'
    ? (isAdminDarkTheme ? '#153828' : '#dcfce7')
    : status === 'terminated'
      ? (isAdminDarkTheme ? '#3b1618' : '#fee2e2')
      : (isAdminDarkTheme ? '#1e293b' : '#f1f5f9'),
  color: status === 'active'
    ? (isAdminDarkTheme ? '#91e0b4' : '#166534')
    : status === 'terminated'
      ? (isAdminDarkTheme ? '#fca5a5' : '#b91c1c')
      : (isAdminDarkTheme ? '#cbd5e1' : '#475569'),
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
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const colors = {
    panelBg: isAdminDarkTheme ? '#111827' : '#fff',
    headBg: isAdminDarkTheme ? '#0f172a' : '#f8fafc',
    headText: isAdminDarkTheme ? '#cbd5e1' : '#475569',
    headBorder: isAdminDarkTheme ? '#334155' : '#e2e8f0',
    rowEven: isAdminDarkTheme ? '#111827' : '#fff',
    rowOdd: isAdminDarkTheme ? '#0f172a' : '#fcfdff',
    rowHover: isAdminDarkTheme ? '#1e293b' : '#f8fafc',
    rowSelected: isAdminDarkTheme ? '#334155' : '#ede9fe',
    cellText: isAdminDarkTheme ? '#e2e8f0' : '#0f172a',
    cellMuted: isAdminDarkTheme ? '#94a3b8' : '#64748b',
    cellSubtle: isAdminDarkTheme ? '#7c8ea5' : '#94a3b8',
    cellBorder: isAdminDarkTheme ? '#243244' : '#eef2f7',
    buttonBg: isAdminDarkTheme ? '#0f172a' : '#fff',
    buttonBorder: isAdminDarkTheme ? '#334155' : '#dbe2ea',
    buttonText: isAdminDarkTheme ? '#e2e8f0' : '#334155',
    pagerBorder: isAdminDarkTheme ? '#334155' : '#e2e8f0',
  };

  const headerStyle = {
    ...thStyle,
    color: colors.headText,
    borderBottom: `1px solid ${colors.headBorder}`,
    backgroundColor: colors.headBg,
  };

  const cellStyle = {
    ...tdStyle,
    borderBottom: `1px solid ${colors.cellBorder}`,
    color: colors.cellText,
  };

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
      <div style={{ overflowX: 'auto', maxHeight: '560px', overflowY: 'auto', backgroundColor: colors.panelBg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th style={headerStyle}>Employee</th>
              <th style={headerStyle}>Dept / Position</th>
              <th style={headerStyle}>Status</th>
              <th style={headerStyle}>Contact</th>
              <th style={headerStyle}>Current Salary</th>
              <th style={headerStyle}>Action</th>
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
                    if (!selected) event.currentTarget.style.backgroundColor = colors.rowHover;
                  }}
                  onMouseLeave={(event) => {
                    if (!selected) event.currentTarget.style.backgroundColor = index % 2 === 0 ? colors.rowEven : colors.rowOdd;
                  }}
                  style={{ backgroundColor: selected ? colors.rowSelected : (index % 2 === 0 ? colors.rowEven : colors.rowOdd), cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                >
                  <td style={cellStyle}>
                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                      <strong>{buildFullName(emp)}</strong>
                      <span style={{ color: colors.cellSubtle, fontSize: '0.8rem' }}>{emp.employeeNo || 'No number'}</span>
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                      <span>{emp.department || '—'}</span>
                      <span style={{ color: colors.cellMuted, fontSize: '0.83rem' }}>{emp.position || '—'}</span>
                      {locationLabel(emp) && <span style={{ color: colors.cellSubtle, fontSize: '0.79rem' }}>{locationLabel(emp)}</span>}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <span style={statusBadge(normalStatus, isAdminDarkTheme)}>{emp.status || 'unknown'}</span>
                  </td>
                  <td style={cellStyle}>{emp.contactNumber || '—'}</td>
                  <td style={cellStyle}>
                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                      <strong>{latestSalary ? money(latestSalary.agreedSalaryPerMonth, latestSalary.currency) : '—'}</strong>
                      {latestSalary && (
                        <span style={{ color: colors.cellSubtle, fontSize: '0.79rem' }}>From {formatDate(latestSalary.effectiveFrom)}</span>
                      )}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditEmployee(emp); }}
                        style={{
                          border: `1px solid ${colors.buttonBorder}`,
                          backgroundColor: colors.buttonBg,
                          color: colors.buttonText,
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
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await boConfirm({
                            title: 'Delete Employee',
                            message: `Delete employee "${buildFullName(emp)}"? This cannot be undone.`,
                            confirmText: 'Delete',
                            cancelText: 'Cancel',
                          });
                          if (confirmed) {
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
          borderTop: `1px solid ${colors.pagerBorder}`,
          flexWrap: 'wrap',
        }}>
          <span style={{ color: colors.cellMuted, fontSize: '0.86rem' }}>
            Page {pagination.page || page} of {pagination.totalPages || 1} — {(pagination.total || 0).toLocaleString('en-US')} employees
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={(pagination.page || page) <= 1}
              style={{ border: `1px solid ${colors.buttonBorder}`, backgroundColor: colors.buttonBg, color: colors.buttonText, borderRadius: '8px', padding: '0.45rem 0.85rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={(pagination.page || page) >= (pagination.totalPages || 1)}
              style={{ border: `1px solid ${colors.buttonBorder}`, backgroundColor: colors.buttonBg, color: colors.buttonText, borderRadius: '8px', padding: '0.45rem 0.85rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
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
