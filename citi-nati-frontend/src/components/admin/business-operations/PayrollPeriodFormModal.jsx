import React, { useEffect, useMemo, useState } from 'react';

const defaultForm = {
  locationId: '',
  reportingPeriodId: '',
  payrollMode: 'full_month',
  payrollMonth: new Date().getMonth() + 1,
  payrollYear: new Date().getFullYear(),
  payrollPositionInMonth: '2',
  runStartedAt: '',
  finalizedAt: '',
  description: '',
  status: 'draft',
};

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.8rem 0.92rem',
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

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const PayrollPeriodFormModal = ({
  isOpen,
  period,
  selectedLocationId = null,
  selectedBranchCode = '',
  selectedLocationCode = '',
  selectedLocationName = '',
  locations = [],
  saving,
  error,
  onClose,
  onSubmit,
}) => {
  const [form, setForm] = useState(defaultForm);
  const [validationError, setValidationError] = useState('');

  const effectiveBranchCode = normalizeCode(selectedBranchCode || period?.branchCode);
  const effectiveLocationCode = normalizeCode(selectedLocationCode || period?.locationCode);

  const scopeLabel = useMemo(() => {
    if (selectedLocationName) return selectedLocationName;
    if (effectiveBranchCode && effectiveLocationCode) return `${effectiveBranchCode} / ${effectiveLocationCode}`;
    if (effectiveLocationCode) return effectiveLocationCode;
    return selectedLocationId ? `Location ID ${selectedLocationId}` : 'No branch/location selected';
  }, [effectiveBranchCode, effectiveLocationCode, selectedLocationId, selectedLocationName]);

  const hasCanonicalScope = Boolean(effectiveBranchCode && effectiveLocationCode);

  useEffect(() => {
    if (!isOpen) return;

    setValidationError('');

    const scopedLocationId = selectedLocationId ? String(selectedLocationId) : '';
    const existingLocationId = period?.locationId ? String(period.locationId) : '';

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    setForm({
      locationId: existingLocationId || scopedLocationId,
      reportingPeriodId: period?.reportingPeriodId ? String(period.reportingPeriodId) : '',
      payrollMode: period?.payrollMode || 'full_month',
      payrollMonth: period?.payrollMonth || currentMonth,
      payrollYear: period?.payrollYear || currentYear,
      payrollPositionInMonth: period?.payrollPositionInMonth ? String(period.payrollPositionInMonth) : '2',
      runStartedAt: period?.runStartedAt ? String(period.runStartedAt).split('T')[0] : '',
      finalizedAt: period?.finalizedAt ? String(period.finalizedAt).split('T')[0] : '',
      description: period?.description || '',
      status: period?.status || 'draft',
    });
  }, [isOpen, period, selectedLocationId]);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event) => {
      if (event.key === 'Escape') onClose();
    };

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

    if (!hasCanonicalScope && !form.locationId) {
      setValidationError('Branch/location scope is required.');
      return;
    }

    setValidationError('');

    onSubmit({
      locationId: form.locationId ? Number(form.locationId) : selectedLocationId || null,
      branchCode: effectiveBranchCode || null,
      locationCode: effectiveLocationCode || null,
      locationName: selectedLocationName || scopeLabel || null,
      reportingPeriodId: form.reportingPeriodId ? Number(form.reportingPeriodId) : null,
      payrollMode: form.payrollMode,
      payrollMonth: Number(form.payrollMonth),
      payrollYear: Number(form.payrollYear),
      payrollPositionInMonth: form.payrollPositionInMonth,
      runStartedAt: form.runStartedAt || null,
      finalizedAt: form.finalizedAt || null,
      description: form.description.trim() || null,
      status: form.status,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 240, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(560px, 100%)', maxHeight: '90vh', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ color: '#5B4B8A', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.05em' }}>Payroll</div>
          <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{period ? 'Edit Payroll Period' : 'Create Payroll Period'}</h3>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.84rem' }}>Scope: {scopeLabel}</p>
        </div>

        {(validationError || error) && (
          <div style={{ margin: '1rem 1.2rem 0', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca', flexShrink: 0 }}>
            {validationError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.1rem 1.2rem', display: 'grid', gap: '0.9rem', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
            <div>
              <label style={labelStyle}>Branch / Location</label>
              <input value={scopeLabel} disabled readOnly style={{ ...fieldStyle, backgroundColor: '#f8fafc', color: '#64748b' }} />
            </div>

            {!hasCanonicalScope && locations.length > 0 && (
              <div>
                <label style={labelStyle}>Legacy Location</label>
                <select value={form.locationId} onChange={set('locationId')} style={fieldStyle}>
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}{location.code ? ` (${location.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={labelStyle}>Reporting Period ID</label>
              <input type="number" min="1" value={form.reportingPeriodId} onChange={set('reportingPeriodId')} placeholder="Optional internal period id" style={fieldStyle} />
            </div>

            <div>
              <label style={labelStyle}>Payroll Mode</label>
              <select value={form.payrollMode} onChange={set('payrollMode')} style={fieldStyle}>
                <option value="mid_month">Mid Month</option>
                <option value="full_month">Full Month</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.8rem' }}>
            <div>
              <label style={labelStyle}>Payroll Month</label>
              <select value={form.payrollMonth} onChange={set('payrollMonth')} style={fieldStyle}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Payroll Year</label>
              <input type="number" min="2020" max="2050" value={form.payrollYear} onChange={set('payrollYear')} style={fieldStyle} />
            </div>

            <div>
              <label style={labelStyle}>Position in Month</label>
              <select value={form.payrollPositionInMonth} onChange={set('payrollPositionInMonth')} style={fieldStyle}>
                <option value="1">1 (Mid-Month Run)</option>
                <option value="2">2 (End-Month Run)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
            <div>
              <label style={labelStyle}>Run Started Date</label>
              <input type="date" value={form.runStartedAt} onChange={set('runStartedAt')} style={fieldStyle} />
            </div>

            <div>
              <label style={labelStyle}>Finalized Date</label>
              <input type="date" value={form.finalizedAt} onChange={set('finalizedAt')} style={fieldStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <input type="text" value={form.description} onChange={set('description')} placeholder="e.g. March 2026 Full Month" style={fieldStyle} />
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select value={form.status} onChange={set('status')} style={fieldStyle}>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
              <option value="finalized">Finalized</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid #e2e8f0', flexShrink: 0, marginTop: 'auto' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              Cancel
            </button>

            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.7rem 1.15rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? (
                <><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.42rem' }}></i>Saving...</>
              ) : (
                period ? 'Save Changes' : 'Create Period'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayrollPeriodFormModal;