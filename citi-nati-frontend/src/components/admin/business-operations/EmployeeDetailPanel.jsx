import React from 'react';
import EmployeesEmptyState from './EmployeesEmptyState.jsx';
import SalaryStructurePanel from './SalaryStructurePanel.jsx';

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

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

const formatLocation = (item) => {
  if (item?.locationName) return item.locationName;
  if (item?.locationCode) return item.locationCode;
  if (item?.locationId) return `Location #${item.locationId}`;
  return '—';
};

const row = { display: 'grid', gap: '0.2rem' };
const sectionCardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '14px',
  padding: '0.95rem',
  backgroundColor: '#fff',
  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.03)',
};

const EmployeeDetailPanel = ({
  employee,
  salaryHistory,
  salaryLoading,
  salaryError,
  detailLoading,
  detailError,
  onEditEmployee,
  onAddSalary,
  onEditSalary,
  onAddEmployee,
}) => {
  if (detailLoading && !employee) {
    return (
      <EmployeesEmptyState
        title="Loading employee details"
        message="Fetching employee profile and salary history."
        icon="fa-spinner fa-spin"
      />
    );
  }

  if (detailError && !employee) {
    return <div style={{ padding: '1rem', color: '#b91c1c', fontSize: '0.9rem' }}>{detailError}</div>;
  }

  if (!employee) {
    return (
      <EmployeesEmptyState
        title="No employee selected"
        message="Add the first employee or select one from the register to view their full profile and salary history."
        icon="fa-user-circle"
        actionLabel="Add New Employee"
        onAction={onAddEmployee}
      />
    );
  }

  const currentSalary = salaryHistory.find((s) => s.isCurrent) || salaryHistory[0] || null;
  const normalStatus = String(employee.status || '').toLowerCase();

  return (
    <div style={{ display: 'grid', gap: '0.9rem', padding: '0.95rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
            Employee Profile
          </div>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>{buildFullName(employee)}</h3>
          <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', marginTop: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b', fontSize: '0.88rem' }}>{employee.employeeNo || 'No employee number'}</span>
            <span style={statusBadge(normalStatus)}>{employee.status || 'unknown'}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEditEmployee(employee)}
          style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '9px', padding: '0.55rem 0.82rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}
        >
          <i className="fas fa-pen" style={{ marginRight: '0.45rem' }} />
          Edit
        </button>
      </div>

      {/* Current salary highlight */}
      {currentSalary && (
        <div style={{ padding: '0.88rem 0.95rem', background: 'linear-gradient(135deg, #ecfdf5 0%, #f8fafc 100%)', borderRadius: '14px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Salary</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '0.2rem' }}>
              {money(currentSalary.agreedSalaryPerMonth, currentSalary.currency)}
            </div>
          </div>
          <div style={{ color: '#64748b', fontSize: '0.86rem', textAlign: 'right' }}>
            <div>Effective {formatDate(currentSalary.effectiveFrom)}</div>
            {currentSalary.annualIncrementAmount > 0 && (
              <div>Annual incr: {money(currentSalary.annualIncrementAmount, currentSalary.currency)}</div>
            )}
          </div>
        </div>
      )}

      {/* Employment info */}
      <div style={sectionCardStyle}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Employment
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Position</span>
            <strong style={{ color: '#0f172a' }}>{employee.position || '—'}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Department</span>
            <strong style={{ color: '#0f172a' }}>{employee.department || '—'}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Location</span>
            <strong style={{ color: '#0f172a' }}>{formatLocation(employee)}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Employment Type</span>
            <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{employee.employmentType || '—'}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Date of Employment</span>
            <strong style={{ color: '#0f172a' }}>{formatDate(employee.dateOfEmployment)}</strong>
          </div>
        </div>
      </div>

      {/* Personal biodata */}
      <div style={sectionCardStyle}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Personal
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Gender</span>
            <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{employee.gender || '—'}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Date of Birth</span>
            <strong style={{ color: '#0f172a' }}>{formatDate(employee.dateOfBirth)}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Contact Number</span>
            <strong style={{ color: '#0f172a' }}>{employee.contactNumber || '—'}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>District of Origin</span>
            <strong style={{ color: '#0f172a' }}>{employee.districtOfOrigin || '—'}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Village</span>
            <strong style={{ color: '#0f172a' }}>{employee.village || '—'}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>Traditional Authority</span>
            <strong style={{ color: '#0f172a' }}>{employee.traditionalAuthority || '—'}</strong>
          </div>
        </div>
      </div>

      {/* Identification */}
      <div style={sectionCardStyle}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Identification
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem' }}>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>National ID</span>
            <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{employee.nationalId || '—'}</strong>
          </div>
          <div style={row}>
            <span style={{ color: '#64748b', fontSize: '0.79rem' }}>ID Expiry Date</span>
            <strong style={{ color: '#0f172a' }}>{formatDate(employee.nationalIdExpiryDate)}</strong>
          </div>
        </div>
      </div>

      {/* Notes */}
      {employee.notes && (
        <div style={sectionCardStyle}>
          <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Notes</div>
          <div style={{ color: '#0f172a', lineHeight: 1.65, padding: '0.8rem', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.89rem' }}>
            {employee.notes}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div style={{ ...sectionCardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div style={row}>
          <span style={{ color: '#94a3b8', fontSize: '0.77rem' }}>Created</span>
          <span style={{ color: '#64748b', fontSize: '0.83rem' }}>{formatDateTime(employee.createdAt)}</span>
        </div>
        <div style={row}>
          <span style={{ color: '#94a3b8', fontSize: '0.77rem' }}>Last Updated</span>
          <span style={{ color: '#64748b', fontSize: '0.83rem' }}>{formatDateTime(employee.updatedAt)}</span>
        </div>
      </div>

      {/* Salary panel */}
      <SalaryStructurePanel
        salaryHistory={salaryHistory}
        loading={salaryLoading}
        error={salaryError}
        onAddSalary={onAddSalary}
        onEditSalary={onEditSalary}
      />
    </div>
  );
};

export default EmployeeDetailPanel;
