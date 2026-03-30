import React, { useEffect, useState } from 'react';

const defaultForm = {
  reportingPeriodId: '',
  payrollMode: 'full_month',
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

const PayrollPeriodFormModal = ({ isOpen, period, saving, error, onClose, onSubmit }) => {
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      reportingPeriodId: period?.reportingPeriodId ? String(period.reportingPeriodId) : '',
      payrollMode: period?.payrollMode || 'full_month',
      description: period?.description || '',
      status: period?.status || 'draft',
    });
  }, [isOpen, period]);

  if (!isOpen) return null;

  const set = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      reportingPeriodId: form.reportingPeriodId ? Number(form.reportingPeriodId) : null,
      payrollMode: form.payrollMode,
      description: form.description.trim() || null,
      status: form.status,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 240, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(560px, 100%)', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ color: '#5B4B8A', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.05em' }}>Payroll</div>
          <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{period ? 'Edit Payroll Period' : 'Create Payroll Period'}</h3>
        </div>

        {error && (
          <div style={{ margin: '1rem 1.2rem 0', padding: '0.85rem 0.95rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.1rem 1.2rem', display: 'grid', gap: '0.9rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.7rem 1.15rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? (<><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.42rem' }}></i>Saving...</>) : (period ? 'Save Changes' : 'Create Period')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayrollPeriodFormModal;
