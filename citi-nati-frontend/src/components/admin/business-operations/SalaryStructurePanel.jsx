import React from 'react';
import EmployeesEmptyState from './EmployeesEmptyState.jsx';

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
};

const tdStyle = {
  padding: '0.85rem 0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
  fontSize: '0.88rem',
};

const currentBadge = {
  display: 'inline-flex',
  borderRadius: '999px',
  padding: '0.28rem 0.6rem',
  fontSize: '0.74rem',
  fontWeight: 800,
  backgroundColor: '#dcfce7',
  color: '#166534',
};

const SalaryStructurePanel = ({
  salaryHistory,
  loading,
  error,
  onAddSalary,
  onEditSalary,
}) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)' }}>
    <div style={{
      padding: '1rem 1.05rem',
      borderBottom: '1px solid #e2e8f0',
      backgroundColor: '#f8fafc',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '0.75rem',
      flexWrap: 'wrap',
    }}>
      <div>
        <strong style={{ color: '#0f172a' }}>Salary Structures</strong>
        <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.87rem' }}>
          Current and historical salary records for this employee.
        </p>
      </div>
      <button
        type="button"
        onClick={onAddSalary}
        style={{
          border: 'none',
          backgroundColor: '#0f766e',
          color: '#fff',
          borderRadius: '9px',
          padding: '0.56rem 0.85rem',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: '0.84rem',
        }}
      >
        <i className="fas fa-plus" style={{ marginRight: '0.4rem' }} />
        Add Salary Structure
      </button>
    </div>

    {error ? (
      <div style={{ padding: '1rem', color: '#b91c1c', fontSize: '0.9rem' }}>{error}</div>
    ) : loading ? (
      <EmployeesEmptyState title="Loading salary history" message="Fetching salary records." icon="fa-spinner fa-spin" />
    ) : !salaryHistory.length ? (
      <EmployeesEmptyState
        title="No salary structures yet"
        message="Add the employee's salary to prepare them for payroll processing."
        icon="fa-money-bill-wave"
        actionLabel="Add Salary Structure"
        onAction={onAddSalary}
      />
    ) : (
      <div style={{ overflowX: 'auto', backgroundColor: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Effective From</th>
              <th style={thStyle}>Effective To</th>
              <th style={thStyle}>Agreed Salary</th>
              <th style={thStyle}>Annual Incr.</th>
              <th style={thStyle}>After Incr.</th>
              <th style={thStyle}>Currency</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {salaryHistory.map((s, index) => (
              <tr key={s.id}>
                <td style={{ ...tdStyle, backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>{formatDate(s.effectiveFrom)}</td>
                <td style={{ ...tdStyle, backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>{s.effectiveTo ? formatDate(s.effectiveTo) : 'Ongoing'}</td>
                <td style={{ ...tdStyle, fontWeight: 700, backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>{money(s.agreedSalaryPerMonth, s.currency)}</td>
                <td style={{ ...tdStyle, backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>{s.annualIncrementAmount ? money(s.annualIncrementAmount, s.currency) : '—'}</td>
                <td style={{ ...tdStyle, backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>{s.salaryAfterIncrement ? money(s.salaryAfterIncrement, s.currency) : '—'}</td>
                <td style={{ ...tdStyle, backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>{s.currency || 'MWK'}</td>
                <td style={{ ...tdStyle, backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>
                  {s.isCurrent ? (
                    <span style={currentBadge}>Current</span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Historical</span>
                  )}
                </td>
                <td style={{ ...tdStyle, backgroundColor: index % 2 === 0 ? '#fff' : '#fcfdff' }}>
                  <button
                    type="button"
                    onClick={() => onEditSalary(s)}
                    style={{
                      border: '1px solid #dbe2ea',
                      backgroundColor: '#fff',
                      color: '#334155',
                      borderRadius: '8px',
                      padding: '0.38rem 0.68rem',
                      fontSize: '0.79rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default SalaryStructurePanel;
