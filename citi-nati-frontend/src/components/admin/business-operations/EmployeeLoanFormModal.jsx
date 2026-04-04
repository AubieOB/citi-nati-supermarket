import React, { useEffect, useState } from 'react';

const defaultForm = {
  employeeId: '',
  principalAmount: '0',
  balanceAmount: '0',
  monthlyDeductionAmount: '0',
  interestRate: '0',
  accruedInterest: '0',
  loanGrantedMonth: new Date().getMonth() + 1,
  loanGrantedYear: new Date().getFullYear(),
  repaymentEndMonth: new Date().getMonth() + 1,
  repaymentEndYear: new Date().getFullYear() + 1,
  reason: '',
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

const EmployeeLoanFormModal = ({
  isOpen,
  loan,
  employees,
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
    
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    setForm({
      employeeId: toStringValue(loan?.employeeId, ''),
      principalAmount: toStringValue(loan?.principalAmount, '0'),
      balanceAmount: toStringValue(loan?.balanceAmount, '0'),
      monthlyDeductionAmount: toStringValue(loan?.monthlyDeductionAmount, '0'),
      interestRate: toStringValue(loan?.interestRate, '0'),
      accruedInterest: toStringValue(loan?.accruedInterest, '0'),
      loanGrantedMonth: loan?.loanGrantedMonth || currentMonth,
      loanGrantedYear: loan?.loanGrantedYear || currentYear,
      repaymentEndMonth: loan?.repaymentEndMonth || currentMonth,
      repaymentEndYear: loan?.repaymentEndYear || currentYear + 1,
      reason: loan?.reason || '',
      notes: loan?.notes || '',
    });
  }, [isOpen, loan]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.employeeId) {
      setValidationError('Employee is required.');
      return;
    }
    if (asNumber(form.principalAmount, 0) <= 0) {
      setValidationError('Loan amount must be greater than 0.');
      return;
    }

    setValidationError('');
    onSubmit({
      employeeId: Number(form.employeeId),
      principalAmount: asNumber(form.principalAmount, 0),
      balanceAmount: asNumber(form.balanceAmount, 0),
      monthlyDeductionAmount: asNumber(form.monthlyDeductionAmount, 0),
      interestRate: asNumber(form.interestRate, 0),
      accruedInterest: asNumber(form.accruedInterest, 0),
      loanGrantedMonth: Number(form.loanGrantedMonth),
      loanGrantedYear: Number(form.loanGrantedYear),
      repaymentEndMonth: Number(form.repaymentEndMonth),
      repaymentEndYear: Number(form.repaymentEndYear),
      reason: form.reason.trim() || null,
      notes: null,
    });
  };

  const showError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 245, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(700px, 100%)', maxHeight: '94vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 2 }}>
          <div style={{ color: '#7c2d12', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.05em' }}>Employee Loan</div>
          <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{loan ? 'Edit Employee Loan' : 'Create Employee Loan'}</h3>
        </div>

        {showError && (
          <div style={{ margin: '1rem 1.2rem 0', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca' }}>
            {showError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.1rem 1.2rem', display: 'grid', gap: '0.95rem' }}>
          <div>
            <label style={labelStyle}>Employee</label>
            <select value={form.employeeId} onChange={set('employeeId')} disabled={Boolean(loan)} style={{ ...fieldStyle, backgroundColor: loan ? '#f8fafc' : '#fff' }}>
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {[employee.firstName, employee.surname].filter(Boolean).join(' ')}{employee.employeeNo ? ` (${employee.employeeNo})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Principal Amount</label><input type="number" step="0.01" min="0" value={form.principalAmount} onChange={set('principalAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Balance Amount</label><input type="number" step="0.01" min="0" value={form.balanceAmount} onChange={set('balanceAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Monthly Deduction</label><input type="number" step="0.01" min="0" value={form.monthlyDeductionAmount} onChange={set('monthlyDeductionAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Interest Rate (%)</label><input type="number" step="0.01" min="0" max="100" value={form.interestRate} onChange={set('interestRate')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Accrued Interest</label><input type="number" step="0.01" min="0" value={form.accruedInterest} onChange={set('accruedInterest')} style={fieldStyle} /></div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>Loan Dates</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Granted Month</label>
                <select value={form.loanGrantedMonth} onChange={set('loanGrantedMonth')} style={fieldStyle}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })}</option>
                  ))}
                </select>
              </div>
              <div><label style={labelStyle}>Granted Year</label><input type="number" min="2020" max="2050" value={form.loanGrantedYear} onChange={set('loanGrantedYear')} style={fieldStyle} /></div>
              <div>
                <label style={labelStyle}>Repayment End Month</label>
                <select value={form.repaymentEndMonth} onChange={set('repaymentEndMonth')} style={fieldStyle}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })}</option>
                  ))}
                </select>
              </div>
              <div><label style={labelStyle}>Repayment End Year</label><input type="number" min="2020" max="2050" value={form.repaymentEndYear} onChange={set('repaymentEndYear')} style={fieldStyle} /></div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Reason for Loan</label>
            <textarea rows={2} value={form.reason} onChange={set('reason')} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="e.g. Medical Emergency, School Fees, etc." />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#7c2d12', color: '#fff', borderRadius: '10px', padding: '0.7rem 1.15rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? (<><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.42rem' }}></i>Saving...</>) : (loan ? 'Save Loan' : 'Create Loan')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeLoanFormModal;
