import React, { useEffect, useState } from 'react';

const defaultForm = {
  locationId: '',
  minServiceMonths: '0',
  maxServiceMonths: '999',
  incrementPercent: '0',
  incrementAmount: '0',
  effectiveFromMonth: new Date().getMonth() + 1,
  effectiveFromYear: new Date().getFullYear(),
  effectiveToMonth: 12,
  effectiveToYear: new Date().getFullYear(),
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

const PayrollIncrementPolicyFormModal = ({
  isOpen,
  incrementPolicy,
  locations,
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
      locationId: toStringValue(incrementPolicy?.locationId, ''),
      minServiceMonths: toStringValue(incrementPolicy?.minServiceMonths, '0'),
      maxServiceMonths: toStringValue(incrementPolicy?.maxServiceMonths, '999'),
      incrementPercent: toStringValue(incrementPolicy?.incrementPercent, '0'),
      incrementAmount: toStringValue(incrementPolicy?.incrementAmount, '0'),
      effectiveFromMonth: incrementPolicy?.effectiveFromMonth || currentMonth,
      effectiveFromYear: incrementPolicy?.effectiveFromYear || currentYear,
      effectiveToMonth: incrementPolicy?.effectiveToMonth || 12,
      effectiveToYear: incrementPolicy?.effectiveToYear || currentYear,
      notes: incrementPolicy?.notes || '',
    });
  }, [isOpen, incrementPolicy]);

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
    if (!form.locationId) {
      setValidationError('Location is required.');
      return;
    }
    if (asNumber(form.maxServiceMonths, 0) <= asNumber(form.minServiceMonths, 0)) {
      setValidationError('Max service months must be greater than min service months.');
      return;
    }
    if (asNumber(form.incrementPercent, 0) === 0 && asNumber(form.incrementAmount, 0) === 0) {
      setValidationError('At least one of increment percent or increment amount must be specified.');
      return;
    }

    setValidationError('');
    onSubmit({
      locationId: Number(form.locationId),
      minServiceMonths: asNumber(form.minServiceMonths, 0),
      maxServiceMonths: asNumber(form.maxServiceMonths, 0),
      incrementPercent: asNumber(form.incrementPercent, 0),
      incrementAmount: asNumber(form.incrementAmount, 0),
      effectiveFromMonth: Number(form.effectiveFromMonth),
      effectiveFromYear: Number(form.effectiveFromYear),
      effectiveToMonth: Number(form.effectiveToMonth),
      effectiveToYear: Number(form.effectiveToYear),
      notes: form.notes.trim() || null,
    });
  };

  const showError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 245, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(800px, 100%)', maxHeight: '94vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 2 }}>
          <div style={{ color: '#065f46', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.05em' }}>Payroll Policy</div>
          <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{incrementPolicy ? 'Edit Increment Policy' : 'Create Increment Policy'}</h3>
        </div>

        {showError && (
          <div style={{ margin: '1rem 1.2rem 0', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca' }}>
            {showError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.1rem 1.2rem', display: 'grid', gap: '0.95rem' }}>
          <div>
            <label style={labelStyle}>Location</label>
            <select value={form.locationId} onChange={set('locationId')} disabled={Boolean(incrementPolicy)} style={{ ...fieldStyle, backgroundColor: incrementPolicy ? '#f8fafc' : '#fff' }}>
              <option value="">Select location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}{location.code ? ` (${location.code})` : ''}</option>
              ))}
            </select>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>Service Duration & Increment Amount</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
              <div><label style={labelStyle}>Min Service Months</label><input type="number" step="1" min="0" value={form.minServiceMonths} onChange={set('minServiceMonths')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Max Service Months</label><input type="number" step="1" min="0" value={form.maxServiceMonths} onChange={set('maxServiceMonths')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Increment % (Of Base Salary)</label><input type="number" step="0.01" min="0" max="100" value={form.incrementPercent} onChange={set('incrementPercent')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Increment Amount (Fixed)</label><input type="number" step="0.01" min="0" value={form.incrementAmount} onChange={set('incrementAmount')} style={fieldStyle} /></div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>Effective Period</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>From Month</label>
                <select value={form.effectiveFromMonth} onChange={set('effectiveFromMonth')} style={fieldStyle}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })}</option>
                  ))}
                </select>
              </div>
              <div><label style={labelStyle}>From Year</label><input type="number" min="2020" max="2050" value={form.effectiveFromYear} onChange={set('effectiveFromYear')} style={fieldStyle} /></div>
              <div>
                <label style={labelStyle}>To Month</label>
                <select value={form.effectiveToMonth} onChange={set('effectiveToMonth')} style={fieldStyle}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })}</option>
                  ))}
                </select>
              </div>
              <div><label style={labelStyle}>To Year</label><input type="number" min="2020" max="2050" value={form.effectiveToYear} onChange={set('effectiveToYear')} style={fieldStyle} /></div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={set('notes')} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="e.g. Annual increment policy 2026, applies after 6 months service, etc." />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#065f46', color: '#fff', borderRadius: '10px', padding: '0.7rem 1.15rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? (<><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.42rem' }}></i>Saving...</>) : (incrementPolicy ? 'Save Policy' : 'Create Policy')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayrollIncrementPolicyFormModal;
