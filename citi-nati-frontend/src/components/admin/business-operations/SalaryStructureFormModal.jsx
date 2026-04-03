import React, { useEffect, useState } from 'react';

const CURRENCIES = ['MWK', 'USD', 'GBP', 'EUR', 'ZAR'];

const defaultForm = {
  agreedSalaryPerMonth: '',
  annualIncrementAmount: '0',
  salaryAfterIncrement: '',
  currency: 'MWK',
  effectiveFrom: '',
  effectiveTo: '',
  isCurrent: true,
};

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.82rem 0.95rem',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  fontSize: '0.92rem',
  backgroundColor: '#fff',
};

const labelStyle = {
  display: 'block',
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: '0.35rem',
  fontSize: '0.87rem',
};

const toDateValue = (value) => {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const tryNum = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

const SalaryStructureFormModal = ({
  isOpen,
  salaryStructure,
  employeeId,
  employeeName,
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
      agreedSalaryPerMonth: salaryStructure ? String(salaryStructure.agreedSalaryPerMonth ?? '') : '',
      annualIncrementAmount: salaryStructure ? String(salaryStructure.annualIncrementAmount ?? '0') : '0',
      salaryAfterIncrement: salaryStructure ? String(salaryStructure.salaryAfterIncrement ?? '') : '',
      currency: salaryStructure?.currency || 'MWK',
      effectiveFrom: toDateValue(salaryStructure?.effectiveFrom),
      effectiveTo: toDateValue(salaryStructure?.effectiveTo),
      isCurrent: salaryStructure ? Boolean(salaryStructure.isCurrent) : true,
    });
  }, [isOpen, salaryStructure]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'agreedSalaryPerMonth' || key === 'annualIncrementAmount') {
        const base = key === 'agreedSalaryPerMonth' ? tryNum(value) : tryNum(prev.agreedSalaryPerMonth);
        const incr = key === 'annualIncrementAmount' ? tryNum(value) : tryNum(prev.annualIncrementAmount);
        next.salaryAfterIncrement = String(base + incr);
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const salary = tryNum(form.agreedSalaryPerMonth);
    if (!form.agreedSalaryPerMonth.trim() || salary <= 0) {
      setValidationError('Agreed salary per month is required and must be greater than zero.');
      return;
    }
    if (!form.effectiveFrom) {
      setValidationError('Effective from date is required.');
      return;
    }
    setValidationError('');
    onSubmit({
      employeeId,
      agreedSalaryPerMonth: salary,
      annualIncrementAmount: tryNum(form.annualIncrementAmount),
      salaryAfterIncrement: tryNum(form.salaryAfterIncrement),
      currency: form.currency || 'MWK',
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
      isCurrent: form.isCurrent,
    });
  };

  const title = salaryStructure ? 'Edit Salary Structure' : 'Add Salary Structure';
  const displayError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 225, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(560px, 100%)', backgroundColor: '#fff', borderRadius: '22px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.2rem 1.3rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {employeeName || 'Employee'}
            </div>
            <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a', fontSize: '1.05rem' }}>{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.6rem 0.85rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}
          >
            Cancel
          </button>
        </div>

        {displayError && (
          <div style={{ margin: '1rem 1.3rem 0', padding: '0.9rem 1rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca', fontSize: '0.9rem' }}>
            {displayError}
          </div>
        )}

        {form.isCurrent && !salaryStructure && (
          <div style={{ margin: '1rem 1.3rem 0', padding: '0.9rem 1rem', backgroundColor: '#fffbeb', color: '#92400e', borderRadius: '12px', border: '1px solid #fde68a', fontSize: '0.88rem' }}>
            <i className="fas fa-info-circle" style={{ marginRight: '0.45rem' }} />
            Setting this as the current salary will mark all previous structures as historical.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.3rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>

          <div>
            <label style={labelStyle}>Agreed Salary / Month <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.agreedSalaryPerMonth}
              onChange={set('agreedSalaryPerMonth')}
              placeholder="0.00"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Currency</label>
            <select value={form.currency} onChange={set('currency')} style={fieldStyle}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Annual Increment</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.annualIncrementAmount}
              onChange={set('annualIncrementAmount')}
              placeholder="0.00"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Salary After Increment</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.salaryAfterIncrement}
              onChange={set('salaryAfterIncrement')}
              placeholder="Auto-calculated"
              style={{ ...fieldStyle, backgroundColor: '#f8fafc' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Effective From <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Effective To</label>
            <input type="date" value={form.effectiveTo} onChange={set('effectiveTo')} style={fieldStyle} />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 0.95rem', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
            <input
              id="isCurrent"
              type="checkbox"
              checked={form.isCurrent}
              onChange={set('isCurrent')}
              style={{ width: '1.1rem', height: '1.1rem', accentColor: '#16a34a', cursor: 'pointer' }}
            />
            <label htmlFor="isCurrent" style={{ cursor: 'pointer', fontWeight: 700, color: '#15803d', fontSize: '0.9rem' }}>
              Mark as the Current Salary Structure
            </label>
          </div>

          {/* Actions */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.7rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.75rem 1.1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ border: 'none', backgroundColor: '#0f766e', color: '#fff', borderRadius: '10px', padding: '0.75rem 1.3rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? (
                <><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.45rem' }} />Saving...</>
              ) : (
                <><i className="fas fa-check" style={{ marginRight: '0.45rem' }} />{salaryStructure ? 'Save Changes' : 'Add Salary Structure'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalaryStructureFormModal;
