import React, { useEffect, useState } from 'react';

const defaultForm = {
  code: '',
  name: '',
  description: '',
  isActive: true,
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

const ExpenseCategoryFormModal = ({ isOpen, category, saving, error, onClose, onSubmit }) => {
  const [form, setForm] = useState(defaultForm);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setValidationError('');
    setForm({
      code: category?.code || '',
      name: category?.name || '',
      description: category?.description || '',
      isActive: category?.isActive !== false,
    });
  }, [isOpen, category]);

  if (!isOpen) return null;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!String(form.code || '').trim()) {
      setValidationError('Category code is required.');
      return;
    }
    if (!String(form.name || '').trim()) {
      setValidationError('Category name is required.');
      return;
    }
    setValidationError('');
    onSubmit({
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      isActive: form.isActive,
    });
  };

  const title = category ? 'Edit Expense Category' : 'Add Expense Category';
  const displayError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 230, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '22px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.2rem 1.3rem', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Expense Categories
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.9rem' }}>
            <div>
              <label style={labelStyle}>
                Code <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={set('code')}
                placeholder="e.g. UTIL"
                maxLength={20}
                style={{ ...fieldStyle, textTransform: 'uppercase' }}
              />
            </div>
            <div>
              <label style={labelStyle}>
                Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="e.g. Utilities"
                style={fieldStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              placeholder="Optional description of what this category covers..."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <input
              type="checkbox"
              id="cat-is-active"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
            />
            <label htmlFor="cat-is-active" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer', fontWeight: 600 }}>
              Active — available for new expense entries
            </label>
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
                <><i className="fas fa-check" style={{ marginRight: '0.45rem' }} />{category ? 'Save Changes' : 'Add Category'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseCategoryFormModal;
