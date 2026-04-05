import React, { useEffect, useState } from 'react';

const defaultForm = {
  employeeId: '',
  linkedTerminationId: '',
  effectiveDate: new Date().toISOString().split('T')[0],
  wageAtRetrenchment: '0',
  reengagementWage: '0',
  occupation: '',
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

const EmployeeReengagementFormModal = ({
  isOpen,
  reengagement,
  employees,
  terminations,
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
      employeeId: toStringValue(reengagement?.employeeId, ''),
      linkedTerminationId: toStringValue(reengagement?.linkedTerminationId, ''),
      effectiveDate: reengagement?.effectiveDate ? reengagement.effectiveDate.split('T')[0] : new Date().toISOString().split('T')[0],
      wageAtRetrenchment: toStringValue(reengagement?.wageAtRetrenchment, '0'),
      reengagementWage: toStringValue(reengagement?.reengagementWage, '0'),
      occupation: toStringValue(reengagement?.occupation, ''),
      notes: reengagement?.notes || '',
    });
  }, [isOpen, reengagement]);

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
    if (asNumber(form.reengagementWage, 0) <= 0) {
      setValidationError('New agreed salary must be greater than 0.');
      return;
    }

    setValidationError('');
    onSubmit({
      employeeId: Number(form.employeeId),
      linkedTerminationId: form.linkedTerminationId ? Number(form.linkedTerminationId) : null,
      effectiveDate: form.effectiveDate,
      wageAtRetrenchment: asNumber(form.wageAtRetrenchment, 0),
      previousWage: asNumber(form.wageAtRetrenchment, 0),
      reengagementWage: asNumber(form.reengagementWage, 0),
      occupation: form.occupation.trim() || null,
      notes: form.notes.trim() || null,
    });
  };

  const showError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 320, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(700px, 100%)', maxHeight: '94vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 2 }}>
          <div style={{ color: '#1e40af', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.05em' }}>Employee Reengagement</div>
          <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{reengagement ? 'Edit Employee Reengagement' : 'Record Employee Reengagement'}</h3>
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
              <select value={form.employeeId} onChange={set('employeeId')} disabled={Boolean(reengagement)} style={{ ...fieldStyle, backgroundColor: reengagement ? '#f8fafc' : '#fff' }}>
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {[employee.firstName, employee.surname].filter(Boolean).join(' ')}{employee.employeeNo ? ` (${employee.employeeNo})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Link to Termination (Optional)</label>
              <select value={form.linkedTerminationId} onChange={set('linkedTerminationId')} style={fieldStyle}>
                <option value="">No termination linked</option>
                {terminations.map((termination) => (
                  <option key={termination.id} value={termination.id}>
                    Termination #{termination.id} - {termination.terminationType}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Effective Date</label>
              <input type="date" value={form.effectiveDate} onChange={set('effectiveDate')} style={fieldStyle} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>Wage Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <div><label style={labelStyle}>Wage at Retrenchment</label><input type="number" step="0.01" min="0" value={form.wageAtRetrenchment} onChange={set('wageAtRetrenchment')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Reengagement Wage</label><input type="number" step="0.01" min="0" value={form.reengagementWage} onChange={set('reengagementWage')} style={fieldStyle} /></div>
              <div><label style={labelStyle}>Occupation</label><input type="text" value={form.occupation} onChange={set('occupation')} style={fieldStyle} placeholder="e.g. Cashier, Supervisor" /></div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Reengagement Notes</label>
            <textarea rows={2} value={form.notes} onChange={set('notes')} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="e.g. Contract type, special conditions, etc." />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#1e40af', color: '#fff', borderRadius: '10px', padding: '0.7rem 1.15rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? (<><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.42rem' }}></i>Saving...</>) : (reengagement ? 'Save Reengagement' : 'Record Reengagement')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeReengagementFormModal;
