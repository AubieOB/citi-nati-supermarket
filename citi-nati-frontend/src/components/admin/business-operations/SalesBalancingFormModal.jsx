import React, { useEffect, useRef, useState } from 'react';

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.82rem 0.95rem',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  fontSize: '0.92rem',
  backgroundColor: '#fff',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: '0.35rem',
  fontSize: '0.88rem',
};

const amountInputStyle = {
  ...fieldStyle,
  padding: '0.72rem 0.95rem',
  textAlign: 'right',
  fontSize: '1.55rem',
  fontWeight: 800,
  fontFamily: 'Consolas, monospace',
  letterSpacing: '0.4px',
  color: '#0f172a',
  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
};

const amountCardStyle = {
  border: '1px solid #dbe3f0',
  borderRadius: '16px',
  padding: '0.85rem',
  backgroundColor: '#f8fafc',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
};

const PAYMENT_FIELDS = [
  { key: 'cashAmount', label: 'Cash', icon: 'fa-money-bill' },
  { key: 'airtelMoneyAmount', label: 'Airtel Money', icon: 'fa-mobile' },
  { key: 'tnmMpambaAmount', label: 'TNM Mpamba', icon: 'fa-sim-card' },
  { key: 'posCardAmount', label: 'POS / Card Machine', icon: 'fa-credit-card' },
  { key: 'bankTransferAmount', label: 'M0626 / National Bank / Bank Transfer', icon: 'fa-bank' },
  { key: 'otherAmount', label: 'Other', icon: 'fa-ellipsis' },
];

function normalizeAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Number(parsed.toFixed(2));
}

const toDateInputValue = (value) => {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
};

const MONEY = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusBadgeStyle = (resultStatus) => {
  if (resultStatus === 'shortage') {
    return { backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' };
  }
  if (resultStatus === 'overage') {
    return { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' };
  }
  return { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
};

const SalesBalancingFormModal = ({ isOpen, record, selectedLocationId, selectedLocationCode, selectedLocationName, saving, error, onClose, onSubmit }) => {
  const amountInputRefs = useRef(new Map());
  const [form, setForm] = useState({
    balancingDate: new Date().toISOString().slice(0, 10),
    referenceTitle: '',
    preparedBy: '',
    cashierReference: '',
    shiftReference: '',
    expectedSystemSales: 0,
    cashAmount: 0,
    airtelMoneyAmount: 0,
    tnmMpambaAmount: 0,
    posCardAmount: 0,
    bankTransferAmount: 0,
    otherAmount: 0,
    notes: '',
  });

  const [validationError, setValidationError] = useState('');
  const [activeAmountKey, setActiveAmountKey] = useState('cashAmount');
  const isCreateMode = !record;

  useEffect(() => {
    if (!isOpen) return;
    setValidationError('');
    setActiveAmountKey('cashAmount');
    if (record) {
      setForm({
        balancingDate: toDateInputValue(record.balancingDate) || new Date().toISOString().slice(0, 10),
        referenceTitle: record.referenceTitle || '',
        preparedBy: record.preparedBy || '',
        cashierReference: record.cashierReference || '',
        shiftReference: record.shiftReference || '',
        expectedSystemSales: normalizeAmount(record.expectedSystemSales),
        cashAmount: normalizeAmount(record.cashAmount),
        airtelMoneyAmount: normalizeAmount(record.airtelMoneyAmount),
        tnmMpambaAmount: normalizeAmount(record.tnmMpambaAmount),
        posCardAmount: normalizeAmount(record.posCardAmount),
        bankTransferAmount: normalizeAmount(record.bankTransferAmount),
        otherAmount: normalizeAmount(record.otherAmount),
        notes: record.notes || '',
      });
    } else {
      setForm({
        balancingDate: new Date().toISOString().slice(0, 10),
        referenceTitle: '',
        preparedBy: '',
        cashierReference: '',
        shiftReference: '',
        expectedSystemSales: 0,
        cashAmount: 0,
        airtelMoneyAmount: 0,
        tnmMpambaAmount: 0,
        posCardAmount: 0,
        bankTransferAmount: 0,
        otherAmount: 0,
        notes: '',
      });
    }
  }, [isOpen, record]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const setAmount = (key) => (event) => {
    const val = event.target.value;
    setForm((prev) => ({ ...prev, [key]: val === '' ? 0 : normalizeAmount(val) }));
  };

  const handleAmountKeyDown = (fieldKey) => (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const currentIndex = PAYMENT_FIELDS.findIndex((field) => field.key === fieldKey);
    const nextField = PAYMENT_FIELDS[currentIndex + 1];
    if (!nextField) {
      event.currentTarget.select();
      return;
    }
    const nextInput = amountInputRefs.current.get(nextField.key);
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  const totalActual = PAYMENT_FIELDS.reduce((sum, field) => sum + normalizeAmount(form[field.key]), 0);
  const difference = Number((totalActual - normalizeAmount(form.expectedSystemSales)).toFixed(2));
  const resultStatus = Math.abs(difference) < 0.005 ? 'balanced' : difference < 0 ? 'shortage' : 'overage';

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.balancingDate) {
      setValidationError('Balancing date is required.');
      return;
    }
    setValidationError('');
    onSubmit({
      balancingDate: form.balancingDate,
      referenceTitle: form.referenceTitle.trim() || null,
      preparedBy: form.preparedBy.trim() || null,
      cashierReference: form.cashierReference.trim() || null,
      shiftReference: form.shiftReference.trim() || null,
      expectedSystemSales: normalizeAmount(form.expectedSystemSales),
      cashAmount: normalizeAmount(form.cashAmount),
      airtelMoneyAmount: normalizeAmount(form.airtelMoneyAmount),
      tnmMpambaAmount: normalizeAmount(form.tnmMpambaAmount),
      posCardAmount: normalizeAmount(form.posCardAmount),
      bankTransferAmount: normalizeAmount(form.bankTransferAmount),
      otherAmount: normalizeAmount(form.otherAmount),
      notes: form.notes.trim() || null,
    });
  };

  const title = record ? 'Edit Balancing Record' : 'New Balancing Record';
  const displayError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 220, display: 'grid', placeItems: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div style={{ width: 'min(900px, 100%)', maxHeight: '95vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '22px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.2rem 1.3rem', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Business Operations
            </div>
            <h3 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>{title}</h3>
            <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              Branch: {selectedLocationName || selectedLocationCode || `ID ${selectedLocationId}`}
            </p>
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

        {/* Error Alert */}
        {displayError && (
          <div style={{ margin: '1rem 1.3rem 0', padding: '0.9rem 1rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca', fontSize: '0.9rem' }}>
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.3rem', display: 'grid', gap: '1.2rem' }}>
          {/* Context Section */}
          <div>
            <h4 style={{ margin: 0, color: '#334155', fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.75rem' }}>Balancing Context</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.9rem' }}>
              <div>
                <label style={labelStyle}>
                  Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input type="date" value={form.balancingDate} onChange={set('balancingDate')} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Reference / Title</label>
                <input value={form.referenceTitle} onChange={set('referenceTitle')} placeholder="e.g., EOD Reconciliation" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Prepared By</label>
                <input value={form.preparedBy} onChange={set('preparedBy')} placeholder="Operator name" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cashier / Session Ref</label>
                <input value={form.cashierReference} onChange={set('cashierReference')} placeholder="Cashier, shift, till" style={fieldStyle} />
              </div>
            </div>
          </div>

          {/* Payment Methods Section */}
          <div>
            <h4 style={{ margin: 0, color: '#334155', fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              <i className="fas fa-money-bill-wave" style={{ marginRight: '0.35rem' }}></i>
              Payment Method Totals
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.9rem' }}>
              {PAYMENT_FIELDS.map((field) => (
                <div
                  key={field.key}
                  style={{
                    ...amountCardStyle,
                    borderColor: activeAmountKey === field.key ? '#8f94c9' : '#dbe3f0',
                    boxShadow: activeAmountKey === field.key
                      ? '0 0 0 3px rgba(143, 148, 201, 0.16), inset 0 1px 0 rgba(255,255,255,0.92)'
                      : amountCardStyle.boxShadow,
                    backgroundColor: activeAmountKey === field.key ? '#eef2ff' : amountCardStyle.backgroundColor,
                  }}
                >
                  <label style={labelStyle}>
                    <i className={`fas ${field.icon}`} style={{ marginRight: '0.35rem', color: '#5B4B8A' }}></i>
                    {field.label}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#5B4B8A', letterSpacing: '0.08em' }}>MWK</span>
                    <input
                      ref={(element) => {
                        if (element) {
                          amountInputRefs.current.set(field.key, element);
                        } else {
                          amountInputRefs.current.delete(field.key);
                        }
                      }}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form[field.key] || 0}
                      onChange={setAmount(field.key)}
                      onFocus={(event) => {
                        setActiveAmountKey(field.key);
                        event.target.select();
                      }}
                      onKeyDown={handleAmountKeyDown(field.key)}
                      onClick={(event) => event.target.select()}
                      onBlur={() => setActiveAmountKey((current) => (current === field.key ? '' : current))}
                      autoFocus={isCreateMode && field.key === 'cashAmount'}
                      placeholder="0.00"
                      style={{
                        ...amountInputStyle,
                        borderColor: activeAmountKey === field.key ? '#8f94c9' : '#cbd5e1',
                        background: activeAmountKey === field.key
                          ? 'linear-gradient(180deg, #ffffff 0%, #eef2ff 100%)'
                          : amountInputStyle.background,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary Section */}
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '1rem', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 0.75rem', color: '#334155', fontSize: '0.95rem', fontWeight: 800 }}>Calculation Summary</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.3rem' }}>Expected System Sales</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{MONEY(form.expectedSystemSales)}</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.3rem' }}>Total Actual Entered</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{MONEY(totalActual)}</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.3rem' }}>Difference</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: resultStatus === 'balanced' ? '#166534' : resultStatus === 'shortage' ? '#b91c1c' : '#c2410c' }}>{MONEY(difference)}</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.3rem' }}>Result</div>
                <span style={{ display: 'inline-flex', borderRadius: '999px', padding: '0.4rem 0.75rem', fontWeight: 800, fontSize: '0.82rem', ...statusBadgeStyle(resultStatus) }}>
                  {resultStatus === 'balanced' ? '✓ Balanced' : resultStatus === 'shortage' ? '⚠ Shortage' : '◆ Overage'}
                </span>
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div>
            <h4 style={{ margin: 0, color: '#334155', fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.5rem' }}>Notes & Comments</h4>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="e.g., Cash rechecked, delayed mobile money confirmation, missing slip, float adjustment..."
              style={{ ...fieldStyle, resize: 'vertical', paddingTop: '0.7rem', paddingBottom: '0.7rem' }}
            />
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.6rem 1rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.6rem 1.2rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800 }}
            >
              <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} style={{ marginRight: '0.4rem' }}></i>
              {saving ? 'Saving...' : record ? 'Update Record' : 'Create Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalesBalancingFormModal;
