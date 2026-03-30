import React from 'react';
import PayrollEmptyState from './PayrollEmptyState.jsx';
import PayrollSummaryCards from './PayrollSummaryCards.jsx';
import PayrollEntriesTable from './PayrollEntriesTable.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const formatDate = (value) => {
  if (!value) return 'Not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const modeLabel = (mode) => String(mode || '').replace('_', ' ');

const PayrollPeriodDetailPanel = ({
  period,
  summary,
  entries,
  entriesLoading,
  entriesError,
  entriesPage,
  entriesPagination,
  selectedEntryId,
  supportData,
  supportLoading,
  onSelectEntry,
  onEditEntry,
  onPageChange,
  onAddEntry,
  onOpenSupportDrawer,
}) => {
  if (!period) {
    return (
      <div style={cardStyle}>
        <PayrollEmptyState title="No period selected" message="Choose a payroll period from the left panel to review entries and totals." icon="fas fa-calendar-check" />
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, padding: '1rem 1.05rem', display: 'grid', gap: '0.95rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#5B4B8A', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', fontSize: '0.73rem' }}>Selected Payroll Period</div>
          <h3 style={{ margin: '0.28rem 0 0', color: '#0f172a', fontSize: '1.06rem' }}>{period.description || `Period #${period.id}`}</h3>
          <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.86rem' }}>
            {modeLabel(period.payrollMode)} | Status: {period.status || 'draft'} | Created by {period.createdBy || 'System'} on {formatDate(period.createdAt)}
          </p>
        </div>
        <button type="button" onClick={onAddEntry} style={{ border: 'none', backgroundColor: '#0f766e', color: '#fff', borderRadius: '10px', padding: '0.62rem 0.94rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
          <i className="fas fa-plus" style={{ marginRight: '0.35rem' }}></i>Add Payroll Entry
        </button>
      </div>

      <PayrollSummaryCards summary={summary} />

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.8rem 0.9rem', backgroundColor: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
          <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.88rem' }}>Linked Employee Payroll Support Records</div>
          <button
            type="button"
            onClick={onOpenSupportDrawer}
            disabled={!selectedEntryId}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '8px', color: '#334155', padding: '0.36rem 0.64rem', cursor: selectedEntryId ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.76rem' }}
          >
            <i className="fas fa-up-right-from-square" style={{ marginRight: '0.3rem' }}></i>View Records
          </button>
        </div>
        {supportLoading ? (
          <div style={{ color: '#64748b', fontSize: '0.83rem' }}>Loading linked records...</div>
        ) : supportData ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            <span style={{ backgroundColor: '#e0f2fe', color: '#075985', borderRadius: '999px', padding: '0.22rem 0.58rem', fontSize: '0.76rem', fontWeight: 700 }}>Loans: {Number(supportData.loansTotal || 0).toLocaleString('en-US')}</span>
            <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '999px', padding: '0.22rem 0.58rem', fontSize: '0.76rem', fontWeight: 700 }}>Terminations: {Number(supportData.terminationsTotal || 0).toLocaleString('en-US')}</span>
            <span style={{ backgroundColor: '#ede9fe', color: '#5b21b6', borderRadius: '999px', padding: '0.22rem 0.58rem', fontSize: '0.76rem', fontWeight: 700 }}>Reengagements: {Number(supportData.reengagementsTotal || 0).toLocaleString('en-US')}</span>
          </div>
        ) : (
          <div style={{ color: '#64748b', fontSize: '0.83rem' }}>Select a payroll entry to view linked loans, terminations, and reengagements.</div>
        )}
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.9rem 0.9rem 0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ color: '#0f172a', fontSize: '0.96rem' }}>Payroll Entries</strong>
            <p style={{ margin: '0.22rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>Entries linked to this payroll period.</p>
          </div>
          <button type="button" onClick={() => onEditEntry(entries.find((entry) => entry.id === selectedEntryId))} disabled={!selectedEntryId} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '9px', color: '#334155', padding: '0.45rem 0.76rem', cursor: selectedEntryId ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.8rem' }}>
            <i className="fas fa-pen" style={{ marginRight: '0.35rem' }}></i>Edit Selected
          </button>
        </div>

        <PayrollEntriesTable
          entries={entries}
          loading={entriesLoading}
          error={entriesError}
          page={entriesPage}
          pagination={entriesPagination}
          selectedEntryId={selectedEntryId}
          onSelectEntry={onSelectEntry}
          onEditEntry={onEditEntry}
          onPageChange={onPageChange}
          onAddEntry={onAddEntry}
        />
      </div>
    </div>
  );
};

export default PayrollPeriodDetailPanel;
