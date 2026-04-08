import React, { useEffect } from 'react';
import PayrollEmptyState from './PayrollEmptyState.jsx';
import { boConfirm } from '../../../utils/boDialogBus.js';

const formatDate = (value) => {
  if (!value) return 'Not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sectionStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '0.8rem',
  display: 'grid',
  gap: '0.45rem',
};

const tag = (bg, color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.2rem 0.55rem',
  borderRadius: '999px',
  backgroundColor: bg,
  color,
  fontSize: '0.75rem',
  fontWeight: 700,
});

const PayrollSupportDrawer = ({
  isOpen,
  employeeName,
  loading,
  error,
  loans,
  terminations,
  reengagements,
  onAddLoan,
  onEditLoan,
  onDeleteLoan,
  onAddLoanTransaction,
  onAddTermination,
  onEditTermination,
  onDeleteTermination,
  onAddReengagement,
  onEditReengagement,
  onDeleteReengagement,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 260, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 'min(640px, 100%)', backgroundColor: '#fff', height: '100%', overflowY: 'auto', boxShadow: '-18px 0 40px rgba(15, 23, 42, 0.24)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '1rem 1.1rem', display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#5B4B8A', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', fontSize: '0.72rem' }}>Payroll Support Drilldown</div>
            <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a', fontSize: '1rem' }}>{employeeName || 'Selected Employee'}</h3>
          </div>
          <button type="button" onClick={onClose} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.5rem 0.78rem', cursor: 'pointer', fontWeight: 700 }}>
            <i className="fas fa-times" style={{ marginRight: '0.32rem' }}></i>Close
          </button>
        </div>

        <div style={{ padding: '1rem 1.1rem', display: 'grid', gap: '0.8rem' }}>
          {loading ? (
            <PayrollEmptyState title="Loading support records" message="Fetching loans, terminations, and reengagements for this employee." icon="fas fa-spinner fa-spin" />
          ) : error ? (
            <div style={{ padding: '0.85rem 0.95rem', borderRadius: '12px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{error}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={onAddLoan} style={{ border: '1px solid #bae6fd', backgroundColor: '#f0f9ff', color: '#075985', borderRadius: '9px', padding: '0.45rem 0.72rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                  <i className="fas fa-plus" style={{ marginRight: '0.32rem' }}></i>Loan
                </button>
                <button type="button" onClick={onAddTermination} style={{ border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '9px', padding: '0.45rem 0.72rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                  <i className="fas fa-plus" style={{ marginRight: '0.32rem' }}></i>Termination
                </button>
                <button type="button" onClick={onAddReengagement} style={{ border: '1px solid #ddd6fe', backgroundColor: '#f5f3ff', color: '#5b21b6', borderRadius: '9px', padding: '0.45rem 0.72rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                  <i className="fas fa-plus" style={{ marginRight: '0.32rem' }}></i>Reengagement
                </button>
              </div>

              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: '#0f172a' }}>Employee Loans</strong>
                  <span style={tag('#e0f2fe', '#075985')}>{loans.length} record(s)</span>
                </div>
                {!loans.length ? (
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No active or historical employee loans found.</div>
                ) : loans.map((loan) => (
                  <div key={loan.id} style={{ borderTop: '1px solid #eef2f7', paddingTop: '0.55rem', display: 'grid', gap: '0.24rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{loan.loanReference || `Loan #${loan.id}`}</span>
                      <span style={tag(loan.status === 'closed' ? '#dcfce7' : '#fef9c3', loan.status === 'closed' ? '#166534' : '#854d0e')}>{loan.status || 'active'}</span>
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.84rem' }}>Principal: {money(loan.principalAmount)} | Balance: {money(loan.balanceAmount)}</div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Monthly deduction: {money(loan.monthlyDeductionAmount || 0)} | Start: {formatDate(loan.startDate)} | End: {formatDate(loan.endDate)}</div>
                    <div style={{ display: 'flex', gap: '0.42rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      <button type="button" onClick={() => onEditLoan(loan)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '0.35rem 0.55rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>
                        <i className="fas fa-pen" style={{ marginRight: '0.28rem' }}></i>Edit Loan
                      </button>
                      <button type="button" onClick={() => onAddLoanTransaction(loan)} style={{ border: '1px solid #bae6fd', backgroundColor: '#f0f9ff', color: '#075985', borderRadius: '8px', padding: '0.35rem 0.55rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>
                        <i className="fas fa-plus" style={{ marginRight: '0.28rem' }}></i>Payment
                      </button>
                      <button type="button" onClick={async () => { const confirmed = await boConfirm({ title: 'Delete Loan', message: `Delete loan "${loan.loanReference || `Loan #${loan.id}`}"? This cannot be undone.`, confirmText: 'Delete', cancelText: 'Cancel' }); if (confirmed) onDeleteLoan(loan); }} style={{ border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#b91c1c', borderRadius: '8px', padding: '0.35rem 0.55rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>
                        <i className="fas fa-trash" style={{ marginRight: '0.28rem' }}></i>Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: '#0f172a' }}>Terminations</strong>
                  <span style={tag('#fee2e2', '#991b1b')}>{terminations.length} record(s)</span>
                </div>
                {!terminations.length ? (
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No termination history found.</div>
                ) : terminations.map((term) => (
                  <div key={term.id} style={{ borderTop: '1px solid #eef2f7', paddingTop: '0.55rem', display: 'grid', gap: '0.24rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{formatDate(term.terminationDate)}</span>
                      <span style={tag('#fee2e2', '#991b1b')}>Termination</span>
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.84rem' }}>Reason: {term.reason || 'Not provided'}</div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Settlement: {money(term.settlementAmount || 0)} | Final month days worked: {Number(term.daysWorkedInFinalMonth || 0).toLocaleString('en-US')}</div>
                    <div style={{ display: 'flex', gap: '0.42rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      <button type="button" onClick={() => onEditTermination(term)} style={{ border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '8px', padding: '0.35rem 0.55rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>
                        <i className="fas fa-pen" style={{ marginRight: '0.28rem' }}></i>Edit
                      </button>
                      <button type="button" onClick={async () => { const confirmed = await boConfirm({ title: 'Delete Termination', message: `Delete termination record from ${formatDate(term.terminationDate)}? This cannot be undone.`, confirmText: 'Delete', cancelText: 'Cancel' }); if (confirmed) onDeleteTermination(term); }} style={{ border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#b91c1c', borderRadius: '8px', padding: '0.35rem 0.55rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>
                        <i className="fas fa-trash" style={{ marginRight: '0.28rem' }}></i>Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: '#0f172a' }}>Reengagements</strong>
                  <span style={tag('#ede9fe', '#5b21b6')}>{reengagements.length} record(s)</span>
                </div>
                {!reengagements.length ? (
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No reengagement records found.</div>
                ) : reengagements.map((item) => (
                  <div key={item.id} style={{ borderTop: '1px solid #eef2f7', paddingTop: '0.55rem', display: 'grid', gap: '0.24rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{formatDate(item.effectiveDate)}</span>
                      <span style={tag('#ede9fe', '#5b21b6')}>{item.occupation || 'Reengagement'}</span>
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.84rem' }}>Previous wage: {money(item.previousWage || 0)} | Reengagement wage: {money(item.reengagementWage || 0)}</div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Contract expiry: {formatDate(item.contractExpiryDate)}</div>
                    <div style={{ display: 'flex', gap: '0.42rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      <button type="button" onClick={() => onEditReengagement(item)} style={{ border: '1px solid #ddd6fe', backgroundColor: '#f5f3ff', color: '#5b21b6', borderRadius: '8px', padding: '0.35rem 0.55rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>
                        <i className="fas fa-pen" style={{ marginRight: '0.28rem' }}></i>Edit
                      </button>
                      <button type="button" onClick={async () => { const confirmed = await boConfirm({ title: 'Delete Reengagement', message: `Delete reengagement record from ${formatDate(item.effectiveDate)}? This cannot be undone.`, confirmText: 'Delete', cancelText: 'Cancel' }); if (confirmed) onDeleteReengagement(item); }} style={{ border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#b91c1c', borderRadius: '8px', padding: '0.35rem 0.55rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>
                        <i className="fas fa-trash" style={{ marginRight: '0.28rem' }}></i>Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayrollSupportDrawer;
