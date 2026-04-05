import React, { useEffect, useState } from 'react';

const defaultForm = {
  employeeLoanId: '',
  amount: '0',
  principalComponent: '0',
  interestComponent: '0',
  notes: '',
};

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.76rem 0.9rem',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  fontSize: '0.9rem',
  backgroundColor: '#fff',
};

const labelStyle = {
  display: 'block',
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: '0.32rem',
  fontSize: '0.83rem',
};

const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toStringValue = (value, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  return String(value);
};

const LoanTransactionFormModal = ({
  isOpen,
  transaction,
  loans,
  defaultLoanId,
  saving,
  error,
  onClose,
  onSubmit,
}) => {
  const [form, setForm] = useState(defaultForm);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setValidationError('');
    setForm({
      employeeLoanId: toStringValue(transaction?.employeeLoanId, defaultLoanId || ''),
      amount: toStringValue(transaction?.amount, '0'),
      principalComponent: toStringValue(transaction?.principalComponent, '0'),
      interestComponent: toStringValue(transaction?.interestComponent, '0'),
      notes: transaction?.notes || '',
    });
  }, [defaultLoanId, isOpen, transaction]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (field) => (event) => {
    const value = event.target.value;
    
    if (field === 'principalComponent' || field === 'interestComponent') {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        next.amount = String(asNumber(next.principalComponent) + asNumber(next.interestComponent));
        return next;
      });
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.employeeLoanId) {
      setValidationError('Loan is required.');
      return;
    }
    if (asNumber(form.amount, 0) <= 0) {
      setValidationError('Transaction amount must be greater than 0.');
      return;
    }

    setValidationError('');
    onSubmit({
      employeeLoanId: Number(form.employeeLoanId),
      amount: asNumber(form.amount, 0),
      principalComponent: asNumber(form.principalComponent, 0),
      interestComponent: asNumber(form.interestComponent, 0),
      notes: form.notes.trim() || null,
    });
  };

  const showError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 320, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(650px, 100%)', maxHeight: '94vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 2 }}>
          <div style={{ color: '#7c2d12', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.05em' }}>Loan Transaction</div>
          <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{transaction ? 'Edit Loan Transaction' : 'Record Loan Repayment'}</h3>
        </div>

        {showError && (
          <div style={{ margin: '1rem 1.2rem 0', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca' }}>
            {showError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.1rem 1.2rem', display: 'grid', gap: '0.95rem' }}>
          <div>
            <label style={labelStyle}>Select Loan</label>
            <select value={form.employeeLoanId} onChange={set('employeeLoanId')} disabled={Boolean(transaction)} style={{ ...fieldStyle, backgroundColor: transaction ? '#f8fafc' : '#fff' }}>
              <option value="">Select loan</option>
              {loans.map((loan) => (
                <option key={loan.id} value={loan.id}>
                  {loan.loanReference || `Loan #${loan.id}`} - Balance: {loan.balanceAmount || 0}
                </option>
              ))}
            </select>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>Payment Breakdown</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
              <div><label style={labelStyle}>Principal Component</label><input type="number" step="0.01" min="0" value={form.principalComponent} onChange={set('principalComponent')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Interest Component</label><input type="number" step="0.01" min="0" value={form.interestComponent} onChange={set('interestComponent')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Total Amount</label><input type="number" step="0.01" min="0" value={form.amount} onChange={set('amount')} disabled style={{ ...fieldStyle, backgroundColor: '#f8fafc' }} /></div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={set('notes')} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="e.g. Monthly repayment, Bonus deduction etc." />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#7c2d12', color: '#fff', borderRadius: '10px', padding: '0.7rem 1.15rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? (<><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.42rem' }}></i>Saving...</>) : (transaction ? 'Save Transaction' : 'Record Payment')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoanTransactionFormModal;
