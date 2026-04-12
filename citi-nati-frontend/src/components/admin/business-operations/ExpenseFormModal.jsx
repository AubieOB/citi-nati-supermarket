import React, { useEffect, useState } from 'react';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'capital_injection', label: 'Capital Injection' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const defaultForm = {
  expenseCategoryId: '',
  locationId: '',
  expenseDate: '',
  amount: '',
  description: '',
  paymentMethod: 'cash',
  referenceNo: '',
  enteredBy: '',
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
  fontSize: '0.88rem',
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
};

const ExpenseFormModal = ({ isOpen, expense, categories, selectedLocationId = null, locations = [], saving, error, onClose, onSubmit }) => {
  const [form, setForm] = useState(defaultForm);
  const [validationError, setValidationError] = useState('');
  const isCreateMode = !expense;
  const isLocationLocked = isCreateMode && Boolean(selectedLocationId);

  useEffect(() => {
    if (!isOpen) return;
    setValidationError('');
    const scopedLocationId = selectedLocationId ? String(selectedLocationId) : '';
    const existingLocationId = expense?.locationId ? String(expense.locationId) : '';
    setForm({
      expenseCategoryId: expense?.expenseCategoryId || '',
      locationId: existingLocationId || scopedLocationId,
      expenseDate: toDateInputValue(expense?.expenseDate) || toDateInputValue(new Date()),
      amount: expense?.amount != null ? String(expense.amount) : '',
      description: expense?.description || '',
      paymentMethod: expense?.paymentMethod || 'cash',
      referenceNo: expense?.referenceNo || '',
      enteredBy: expense?.enteredBy || '',
    });
  }, [isOpen, expense, selectedLocationId]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.expenseCategoryId) {
      setValidationError('Expense category is required.');
      return;
    }
    if (!form.expenseDate) {
      setValidationError('Expense date is required.');
      return;
    }
    if (!form.locationId) {
      setValidationError('Location is required.');
      return;
    }
    const amount = Number(form.amount);
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
      setValidationError('Amount must be a positive number.');
      return;
    }
    setValidationError('');
    onSubmit({
      expenseCategoryId: form.expenseCategoryId,
      locationId: Number(form.locationId),
      expenseDate: form.expenseDate,
      amount,
      description: form.description.trim() || null,
      paymentMethod: form.paymentMethod || null,
      referenceNo: form.referenceNo.trim() || null,
      enteredBy: form.enteredBy.trim() || null,
    });
  };

  const title = expense ? 'Edit Expense' : 'Add New Expense';
  const displayError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 220, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(720px, 100%)', maxHeight: '92vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '22px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.2rem 1.3rem', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Business Operations
            </div>
            <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{title}</h3>
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

        <form onSubmit={handleSubmit} style={{ padding: '1.3rem', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
            <div>
              <label style={labelStyle}>
                Location <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select value={form.locationId} onChange={set('locationId')} disabled={isLocationLocked} style={{ ...fieldStyle, backgroundColor: isLocationLocked ? '#f8fafc' : '#fff' }}>
                {!isLocationLocked && <option value="">Select a location</option>}
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}{location.code ? ` (${location.code})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                Category <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select value={form.expenseCategoryId} onChange={set('expenseCategoryId')} style={fieldStyle}>
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                Expense Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                value={form.expenseDate}
                onChange={set('expenseDate')}
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
            <div>
              <label style={labelStyle}>
                Amount (MWK) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={set('amount')}
                min="0.01"
                step="0.01"
                placeholder="0.00"
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select value={form.paymentMethod} onChange={set('paymentMethod')} style={fieldStyle}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              placeholder="Describe the expense..."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
            <div>
              <label style={labelStyle}>Reference Number</label>
              <input
                type="text"
                value={form.referenceNo}
                onChange={set('referenceNo')}
                placeholder="Invoice / receipt number"
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Entered By</label>
              <input
                type="text"
                value={form.enteredBy}
                onChange={set('enteredBy')}
                placeholder="Name of person entering this expense"
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.7rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
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
              style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.75rem 1.3rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? (
                <><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.45rem' }} />Saving...</>
              ) : (
                <><i className="fas fa-check" style={{ marginRight: '0.45rem' }} />{expense ? 'Save Changes' : 'Add Expense'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseFormModal;
