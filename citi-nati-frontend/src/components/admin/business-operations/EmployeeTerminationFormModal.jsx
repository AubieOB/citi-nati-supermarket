import React, { useEffect, useState } from 'react';

const defaultForm = {
  employeeId: '',
  terminationDate: new Date().toISOString().split('T')[0],
  terminationType: 'resignation',
  halfPayDueInTerminationMonth: '0',
  amountPaidInTerminationMonth: '0',
  leavePayAccruedDays: '0',
  leavePayAccruedAmount: '0',
  outstandingLoanObligations: '0',
  grossSettlementAmount: '0',
  netSettlementAmount: '0',
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

const EmployeeTerminationFormModal = ({
  isOpen,
  termination,
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
    setForm({
      employeeId: toStringValue(termination?.employeeId, ''),
      terminationDate: termination?.terminationDate ? termination.terminationDate.split('T')[0] : new Date().toISOString().split('T')[0],
      terminationType: termination?.terminationType || 'resignation',
      halfPayDueInTerminationMonth: toStringValue(termination?.halfPayDueInTerminationMonth, '0'),
      amountPaidInTerminationMonth: toStringValue(termination?.amountPaidInTerminationMonth, '0'),
      leavePayAccruedDays: toStringValue(termination?.leavePayAccruedDays, '0'),
      leavePayAccruedAmount: toStringValue(termination?.leavePayAccruedAmount, '0'),
      outstandingLoanObligations: toStringValue(termination?.outstandingLoanObligations, '0'),
      grossSettlementAmount: toStringValue(termination?.grossSettlementAmount, '0'),
      netSettlementAmount: toStringValue(termination?.netSettlementAmount, '0'),
      notes: termination?.notes || '',
    });
  }, [isOpen, termination]);

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

    setValidationError('');
    onSubmit({
      employeeId: Number(form.employeeId),
      terminationDate: form.terminationDate,
      terminationType: form.terminationType,
      halfPayDueInTerminationMonth: asNumber(form.halfPayDueInTerminationMonth, 0),
      amountPaidInTerminationMonth: asNumber(form.amountPaidInTerminationMonth, 0),
      leavePayAccruedDays: asNumber(form.leavePayAccruedDays, 0),
      leavePayAccruedAmount: asNumber(form.leavePayAccruedAmount, 0),
      outstandingLoanObligations: asNumber(form.outstandingLoanObligations, 0),
      grossSettlementAmount: asNumber(form.grossSettlementAmount, 0),
      netSettlementAmount: asNumber(form.netSettlementAmount, 0),
      notes: form.notes.trim() || null,
    });
  };

  const showError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 320, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '94vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 2 }}>
          <div style={{ color: '#991b1b', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.05em' }}>Employee Termination</div>
          <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{termination ? 'Edit Employee Termination' : 'Record Employee Termination'}</h3>
        </div>

        {showError && (
          <div style={{ margin: '1rem 1.2rem 0', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca' }}>
            {showError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.1rem 1.2rem', display: 'grid', gap: '0.95rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
            <div>
              <label style={labelStyle}>Employee</label>
              <select value={form.employeeId} onChange={set('employeeId')} disabled={Boolean(termination)} style={{ ...fieldStyle, backgroundColor: termination ? '#f8fafc' : '#fff' }}>
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {[employee.firstName, employee.surname].filter(Boolean).join(' ')}{employee.employeeNo ? ` (${employee.employeeNo})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Termination Date</label>
              <input type="date" value={form.terminationDate} onChange={set('terminationDate')} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Termination Type</label>
              <select value={form.terminationType} onChange={set('terminationType')} style={fieldStyle}>
                <option value="resignation">Resignation</option>
                <option value="dismissal">Dismissal</option>
                <option value="retrenchment">Retrenchment</option>
                <option value="contract_expiry">Contract Expiry</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>Termination Month Settlement</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
              <div><label style={labelStyle}>Half Pay Due</label><input type="number" step="0.01" min="0" value={form.halfPayDueInTerminationMonth} onChange={set('halfPayDueInTerminationMonth')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Amount Paid in Month</label><input type="number" step="0.01" min="0" value={form.amountPaidInTerminationMonth} onChange={set('amountPaidInTerminationMonth')} style={fieldStyle} /></div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>Leave Pay Accrual</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
              <div><label style={labelStyle}>Accrued Days</label><input type="number" step="0.01" min="0" value={form.leavePayAccruedDays} onChange={set('leavePayAccruedDays')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Accrued Amount</label><input type="number" step="0.01" min="0" value={form.leavePayAccruedAmount} onChange={set('leavePayAccruedAmount')} style={fieldStyle} /></div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>Settlement Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
              <div><label style={labelStyle}>Outstanding Loan Obligations</label><input type="number" step="0.01" min="0" value={form.outstandingLoanObligations} onChange={set('outstandingLoanObligations')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Gross Settlement Amount</label><input type="number" step="0.01" min="0" value={form.grossSettlementAmount} onChange={set('grossSettlementAmount')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Net Settlement Amount</label><input type="number" step="0.01" min="0" value={form.netSettlementAmount} onChange={set('netSettlementAmount')} style={fieldStyle} /></div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Termination Notes</label>
            <textarea rows={2} value={form.notes} onChange={set('notes')} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Reason for termination, any additional notes etc." />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#991b1b', color: '#fff', borderRadius: '10px', padding: '0.7rem 1.15rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? (<><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.42rem' }}></i>Saving...</>) : (termination ? 'Save Termination' : 'Record Termination')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeTerminationFormModal;
