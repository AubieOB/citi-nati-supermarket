import React, { useEffect, useState } from 'react';

const defaultForm = {
  employeeId: '',
  basicSalary: '0',
  incrementAmount: '0',
  grossPay: '0',
  totalDeductions: '0',
  netPay: '0',
  daysWorked: '',
  daysAbsent: '',
  overtimeHours: '',
  overtimeAmount: '0',
  loanDeductionAmount: '0',
  otherDeductionAmount: '0',
  bonusAmount: '0',
  giftAmount: '0',
  leavePayAmount: '0',
  payeAmount: '0',
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

const PayrollEntryFormModal = ({
  isOpen,
  payrollEntry,
  periodId,
  employees,
  employeeSalary,
  saving,
  error,
  onClose,
  onEmployeeChange,
  onSubmit,
}) => {
  const [form, setForm] = useState(defaultForm);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setValidationError('');
    setForm({
      employeeId: toStringValue(payrollEntry?.employeeId, ''),
      basicSalary: toStringValue(payrollEntry?.basicSalary, '0'),
      incrementAmount: toStringValue(payrollEntry?.incrementAmount, '0'),
      grossPay: toStringValue(payrollEntry?.grossPay, '0'),
      totalDeductions: toStringValue(payrollEntry?.totalDeductions, '0'),
      netPay: toStringValue(payrollEntry?.netPay, '0'),
      daysWorked: toStringValue(payrollEntry?.daysWorked),
      daysAbsent: toStringValue(payrollEntry?.daysAbsent),
      overtimeHours: toStringValue(payrollEntry?.overtimeHours),
      overtimeAmount: toStringValue(payrollEntry?.overtimeAmount, '0'),
      loanDeductionAmount: toStringValue(payrollEntry?.loanDeductionAmount, '0'),
      otherDeductionAmount: toStringValue(payrollEntry?.otherDeductionAmount, '0'),
      bonusAmount: toStringValue(payrollEntry?.bonusAmount, '0'),
      giftAmount: toStringValue(payrollEntry?.giftAmount, '0'),
      leavePayAmount: toStringValue(payrollEntry?.leavePayAmount, '0'),
      payeAmount: toStringValue(payrollEntry?.payeAmount, '0'),
      notes: toStringValue(payrollEntry?.notes, ''),
    });
  }, [isOpen, payrollEntry]);

  useEffect(() => {
    if (!isOpen || payrollEntry) return;
    if (!employeeSalary) return;

    setForm((prev) => {
      const basic = asNumber(employeeSalary.agreedSalaryPerMonth, 0);
      const increment = asNumber(employeeSalary.annualIncrementAmount, 0);
      const gross = basic + increment;
      return {
        ...prev,
        basicSalary: String(basic),
        incrementAmount: String(increment),
        grossPay: String(gross),
        netPay: String(gross - asNumber(prev.totalDeductions, 0)),
      };
    });
  }, [employeeSalary, isOpen, payrollEntry]);

  if (!isOpen) return null;

  const updateDerived = (next) => {
    const gross = asNumber(next.grossPay, asNumber(next.basicSalary) + asNumber(next.incrementAmount));
    const deductions = asNumber(next.totalDeductions, 0);
    return {
      ...next,
      grossPay: String(gross),
      netPay: String(gross - deductions),
    };
  };

  const set = (field) => (event) => {
    const value = event.target.value;

    if (field === 'employeeId') {
      setForm((prev) => ({ ...prev, employeeId: value }));
      if (value) onEmployeeChange(Number(value));
      return;
    }

    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'basicSalary' || field === 'incrementAmount') {
        next.grossPay = String(asNumber(next.basicSalary, 0) + asNumber(next.incrementAmount, 0));
      }
      if (field === 'grossPay' || field === 'totalDeductions' || field === 'basicSalary' || field === 'incrementAmount') {
        return updateDerived(next);
      }
      return next;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.employeeId) {
      setValidationError('Employee is required.');
      return;
    }

    setValidationError('');
    onSubmit({
      payrollPeriodId: periodId,
      employeeId: Number(form.employeeId),
      basicSalary: asNumber(form.basicSalary, 0),
      incrementAmount: asNumber(form.incrementAmount, 0),
      grossPay: asNumber(form.grossPay, 0),
      totalDeductions: asNumber(form.totalDeductions, 0),
      netPay: asNumber(form.netPay, 0),
      daysWorked: form.daysWorked === '' ? null : asNumber(form.daysWorked, 0),
      daysAbsent: form.daysAbsent === '' ? null : asNumber(form.daysAbsent, 0),
      overtimeHours: form.overtimeHours === '' ? null : asNumber(form.overtimeHours, 0),
      overtimeAmount: asNumber(form.overtimeAmount, 0),
      loanDeductionAmount: asNumber(form.loanDeductionAmount, 0),
      otherDeductionAmount: asNumber(form.otherDeductionAmount, 0),
      bonusAmount: asNumber(form.bonusAmount, 0),
      giftAmount: asNumber(form.giftAmount, 0),
      leavePayAmount: asNumber(form.leavePayAmount, 0),
      payeAmount: asNumber(form.payeAmount, 0),
      notes: form.notes.trim() || null,
    });
  };

  const showError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 245, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(960px, 100%)', maxHeight: '94vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 2 }}>
          <div style={{ color: '#0f766e', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.05em' }}>Payroll Entry</div>
          <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{payrollEntry ? 'Edit Payroll Entry' : 'Add Payroll Entry'}</h3>
        </div>

        {showError && (
          <div style={{ margin: '1rem 1.2rem 0', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca' }}>
            {showError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.1rem 1.2rem', display: 'grid', gap: '0.95rem' }}>
          <div>
            <label style={labelStyle}>Employee</label>
            <select value={form.employeeId} onChange={set('employeeId')} disabled={Boolean(payrollEntry)} style={{ ...fieldStyle, backgroundColor: payrollEntry ? '#f8fafc' : '#fff' }}>
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {[employee.firstName, employee.surname].filter(Boolean).join(' ')}{employee.employeeNo ? ` (${employee.employeeNo})` : ''}
                </option>
              ))}
            </select>
            {!employees.length && !payrollEntry ? (
              <div style={{ marginTop: '0.35rem', color: '#b45309', fontSize: '0.8rem' }}>
                No employees available for the selected period/location scope.
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Basic Salary</label><input type="number" step="0.01" min="0" value={form.basicSalary} onChange={set('basicSalary')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Increment Amount</label><input type="number" step="0.01" min="0" value={form.incrementAmount} onChange={set('incrementAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Gross Pay</label><input type="number" step="0.01" min="0" value={form.grossPay} onChange={set('grossPay')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Total Deductions</label><input type="number" step="0.01" min="0" value={form.totalDeductions} onChange={set('totalDeductions')} style={fieldStyle} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Net Pay</label><input type="number" step="0.01" min="0" value={form.netPay} onChange={set('netPay')} style={{ ...fieldStyle, backgroundColor: '#f8fafc' }} /></div>
            <div><label style={labelStyle}>Days Worked</label><input type="number" step="0.01" min="0" value={form.daysWorked} onChange={set('daysWorked')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Days Absent</label><input type="number" step="0.01" min="0" value={form.daysAbsent} onChange={set('daysAbsent')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Overtime Hours</label><input type="number" step="0.01" min="0" value={form.overtimeHours} onChange={set('overtimeHours')} style={fieldStyle} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Overtime Amount</label><input type="number" step="0.01" min="0" value={form.overtimeAmount} onChange={set('overtimeAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Loan Deduction</label><input type="number" step="0.01" min="0" value={form.loanDeductionAmount} onChange={set('loanDeductionAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Other Deduction</label><input type="number" step="0.01" min="0" value={form.otherDeductionAmount} onChange={set('otherDeductionAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Bonus Amount</label><input type="number" step="0.01" min="0" value={form.bonusAmount} onChange={set('bonusAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Gift Amount</label><input type="number" step="0.01" min="0" value={form.giftAmount} onChange={set('giftAmount')} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Leave Pay</label><input type="number" step="0.01" min="0" value={form.leavePayAmount} onChange={set('leavePayAmount')} style={fieldStyle} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div><label style={labelStyle}>PAYE Amount</label><input type="number" step="0.01" min="0" value={form.payeAmount} onChange={set('payeAmount')} style={fieldStyle} /></div>
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea rows={2} value={form.notes} onChange={set('notes')} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Payroll notes for this employee entry" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#0f766e', color: '#fff', borderRadius: '10px', padding: '0.7rem 1.15rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? (<><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.42rem' }}></i>Saving...</>) : (payrollEntry ? 'Save Entry' : 'Add Entry')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayrollEntryFormModal;
