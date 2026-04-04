import React from 'react';
import PayrollEmptyState from './PayrollEmptyState.jsx';

const thStyle = {
  textAlign: 'left',
  padding: '0.82rem 0.9rem',
  color: '#475569',
  fontSize: '0.76rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
};

const tdStyle = {
  padding: '0.86rem 0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
  fontSize: '0.9rem',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fullName = (employee) => [employee?.firstName, employee?.surname].filter(Boolean).join(' ') || 'Unknown';

const PayrollEntriesTable = ({
  entries,
  loading,
  error,
  page,
  pagination,
  selectedEntryId,
  onSelectEntry,
  onEditEntry,
  onDeleteEntry,
  onPageChange,
  onAddEntry,
}) => {
  const totalPages = pagination?.totalPages || 1;

  if (error) {
    return <div style={{ marginTop: '0.9rem', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca' }}>{error}</div>;
  }

  if (loading) {
    return <PayrollEmptyState title="Loading payroll entries" message="Please wait while payroll entries are being fetched." icon="fas fa-spinner fa-spin" />;
  }

  if (!entries.length) {
    return (
      <PayrollEmptyState
        title="No payroll entries"
        message="Add payroll entries for employees in this period to begin salary processing."
        actionLabel="Add Payroll Entry"
        onAction={onAddEntry}
      />
    );
  }

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Basic Salary</th>
              <th style={thStyle}>Increment</th>
              <th style={thStyle}>Gross Pay</th>
              <th style={thStyle}>Deductions</th>
              <th style={thStyle}>Net Pay</th>
              <th style={thStyle}>Overtime</th>
              <th style={thStyle}>Days Absent</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const selected = selectedEntryId === entry.id;
              const zebraBase = index % 2 === 0 ? '#fff' : '#fcfdff';
              return (
                <tr
                  key={entry.id}
                  onClick={() => onSelectEntry(entry)}
                  onMouseEnter={(event) => { if (!selected) event.currentTarget.style.backgroundColor = '#f0fdf4'; }}
                  onMouseLeave={(event) => { if (!selected) event.currentTarget.style.backgroundColor = zebraBase; }}
                  style={{ backgroundColor: selected ? '#ecfeff' : zebraBase, cursor: 'pointer', transition: 'background-color 0.12s ease' }}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{fullName(entry.employee)}</div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{entry.employee?.employeeNo || 'No employee number'}</div>
                  </td>
                  <td style={tdStyle}>{money(entry.basicSalary)}</td>
                  <td style={tdStyle}>{money(entry.incrementAmount)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{money(entry.grossPay)}</td>
                  <td style={tdStyle}>{money(entry.totalDeductions)}</td>
                  <td style={{ ...tdStyle, color: '#166534', fontWeight: 700 }}>{money(entry.netPay)}</td>
                  <td style={tdStyle}>{money(entry.overtimeAmount)} ({Number(entry.overtimeHours || 0).toLocaleString('en-US')}h)</td>
                  <td style={tdStyle}>{Number(entry.daysAbsent || 0).toLocaleString('en-US')}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditEntry(entry);
                        }}
                        style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '9px', color: '#334155', padding: '0.43rem 0.72rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
                      >
                        <i className="fas fa-pen" style={{ marginRight: '0.35rem' }}></i>Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm(`Delete payroll entry for ${fullName(entry.employee)}?`)) {
                            onDeleteEntry(entry);
                          }
                        }}
                        style={{ border: '1px solid #fca5a5', backgroundColor: '#fff', borderRadius: '9px', color: '#b91c1c', padding: '0.43rem 0.72rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
                      >
                        <i className="fas fa-trash" style={{ marginRight: '0.35rem' }}></i>Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', paddingTop: '0.9rem', borderTop: '1px solid #e2e8f0', marginTop: '0.7rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b', fontSize: '0.83rem' }}>
          Page {pagination?.page || page} of {totalPages} ({Number(pagination?.total || entries.length).toLocaleString('en-US')} entries)
        </span>
        <div style={{ display: 'flex', gap: '0.45rem' }}>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '9px', color: '#334155', padding: '0.43rem 0.72rem', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '9px', color: '#334155', padding: '0.43rem 0.72rem', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
};

export default PayrollEntriesTable;
