import React from 'react';
import PayrollEmptyState from './PayrollEmptyState.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

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

const modeLabel = (mode) => String(mode || '').replace('_', ' ');

const formatDate = (value) => {
  if (!value) return 'Not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const locationLabel = (item) => {
  if (item?.locationName) return item.locationName;
  if (item?.locationCode) return item.locationCode;
  if (item?.locationId) return `Location #${item.locationId}`;
  return null;
};

const PayrollPeriodsList = ({
  periods,
  loading,
  error,
  page,
  pagination,
  selectedPeriodId,
  onPageChange,
  onSelectPeriod,
  onEditPeriod,
  onCreatePeriod,
}) => {
  const totalPages = pagination?.totalPages || 1;

  return (
    <div style={cardStyle}>
      <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>Payroll Periods</h3>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.84rem' }}>Select a period to manage payroll entries and totals.</p>
        </div>
        <button
          type="button"
          onClick={onCreatePeriod}
          style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.6rem 0.9rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          <i className="fas fa-plus" style={{ marginRight: '0.38rem' }}></i>Create Period
        </button>
      </div>

      {error ? (
        <div style={{ margin: '1rem', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca' }}>
          {error}
        </div>
      ) : loading ? (
        <PayrollEmptyState title="Loading payroll periods" message="Please wait while payroll periods are being fetched." icon="fas fa-spinner fa-spin" />
      ) : !periods.length ? (
        <PayrollEmptyState
          title="No payroll periods"
          message="Create your first payroll period to begin structured payroll management."
          actionLabel="Create Payroll Period"
          onAction={onCreatePeriod}
        />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Period</th>
                  <th style={thStyle}>Mode</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Entries</th>
                  <th style={thStyle}>Net Total</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period, index) => {
                  const selected = selectedPeriodId === period.id;
                  const zebraBase = index % 2 === 0 ? '#fff' : '#fcfdff';
                  return (
                    <tr
                      key={period.id}
                      onClick={() => onSelectPeriod(period)}
                      onMouseEnter={(event) => { if (!selected) event.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={(event) => { if (!selected) event.currentTarget.style.backgroundColor = zebraBase; }}
                      style={{ backgroundColor: selected ? '#f5f3ff' : zebraBase, cursor: 'pointer', transition: 'background-color 0.12s ease' }}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700 }}>{period.description || `Period #${period.id}`}</div>
                        <div style={{ color: '#64748b', fontSize: '0.8rem' }}>RP: {period.reportingPeriodId || 'N/A'}</div>
                        {locationLabel(period) && <div style={{ color: '#94a3b8', fontSize: '0.79rem' }}>{locationLabel(period)}</div>}
                      </td>
                      <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{modeLabel(period.payrollMode) || 'Not set'}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.24rem 0.58rem', borderRadius: '999px', backgroundColor: period.status === 'finalized' ? '#dcfce7' : '#e2e8f0', color: period.status === 'finalized' ? '#166534' : '#334155', fontSize: '0.78rem', fontWeight: 700 }}>
                          {period.status || 'draft'}
                        </span>
                      </td>
                      <td style={tdStyle}>{Number(period.entryCount || 0).toLocaleString('en-US')}</td>
                      <td style={tdStyle}>{money(period.totalNetPay || 0)}</td>
                      <td style={tdStyle}>{formatDate(period.createdAt)}</td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditPeriod(period);
                          }}
                          style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '9px', color: '#334155', padding: '0.43rem 0.72rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
                        >
                          <i className="fas fa-pen" style={{ marginRight: '0.35rem' }}></i>Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', padding: '0.9rem 1rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b', fontSize: '0.83rem' }}>
              Page {pagination?.page || page} of {totalPages} ({Number(pagination?.total || periods.length).toLocaleString('en-US')} total periods)
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
      )}
    </div>
  );
};

export default PayrollPeriodsList;
