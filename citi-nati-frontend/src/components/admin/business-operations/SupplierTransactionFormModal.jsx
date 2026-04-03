import React, { useEffect, useMemo, useState } from 'react';

const defaultForm = {
  supplierId: '',
  locationId: '',
  transactionDate: '',
  transactionType: 'debt',
  paymentMethod: 'cash',
  amount: '',
  description: '',
  referenceNo: '',
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

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'capital_injection', label: 'Capital Injection' },
  { value: 'other', label: 'Other' },
];

const TYPE_OPTIONS = [
  { value: 'debt', label: 'Debt' },
  { value: 'payment', label: 'Payment' },
  { value: 'adjustment', label: 'Adjustment' },
];

const toDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
};

const SupplierTransactionFormModal = ({
  isOpen,
  transaction,
  supplier,
  supplierOptions,
  selectedLocationId = null,
  locations = [],
  saving,
  error,
  onClose,
  onSubmit,
}) => {
  const [form, setForm] = useState(defaultForm);
  const [validationError, setValidationError] = useState('');
  const isCreateMode = !transaction;
  const isLocationLocked = isCreateMode && Boolean(selectedLocationId);

  const title = useMemo(() => (transaction ? 'Edit Supplier Transaction' : 'Add Supplier Transaction'), [transaction]);

  useEffect(() => {
    if (!isOpen) return;
    setValidationError('');
    const scopedLocationId = selectedLocationId ? String(selectedLocationId) : '';
    const existingLocationId = transaction?.locationId ? String(transaction.locationId) : '';
    setForm({
      supplierId: String(transaction?.supplierId || supplier?.id || ''),
      locationId: existingLocationId || scopedLocationId,
      transactionDate: toDateInput(transaction?.transactionDate) || toDateInput(new Date()),
      transactionType: transaction?.transactionType || 'debt',
      paymentMethod: transaction?.paymentMethod || 'cash',
      amount: transaction?.amount !== undefined && transaction?.amount !== null ? String(transaction.amount) : '',
      description: transaction?.description || '',
      referenceNo: transaction?.referenceNo || '',
    });
  }, [isOpen, supplier, transaction]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.supplierId) {
      setValidationError('Supplier is required.');
      return;
    }

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError('Amount must be greater than zero.');
      return;
    }

    if (!form.transactionDate) {
      setValidationError('Transaction date is required.');
      return;
    }
    if (!form.locationId) {
      setValidationError('Location is required.');
      return;
    }

    setValidationError('');
    onSubmit({
      supplierId: Number(form.supplierId),
      locationId: Number(form.locationId),
      transactionDate: form.transactionDate,
      transactionType: form.transactionType,
      paymentMethod: form.paymentMethod,
      amount,
      description: form.description.trim() || null,
      referenceNo: form.referenceNo.trim() || null,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 230, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(720px, 100%)', maxHeight: '92vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '22px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.2rem 1.3rem', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a' }}>{title}</h3>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>Record supplier debt, payment, or adjustment activity with clean audit detail.</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', backgroundColor: 'transparent', color: '#64748b', fontSize: '1.1rem', cursor: 'pointer' }}>
            <i className="fas fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.2rem 1.3rem', display: 'grid', gap: '1rem' }}>
          {(validationError || error) ? (
            <div style={{ padding: '0.9rem 1rem', borderRadius: '12px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
              {validationError || error}
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Location</span>
              <select value={form.locationId} onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))} disabled={isLocationLocked} style={{ ...fieldStyle, backgroundColor: isLocationLocked ? '#f8fafc' : '#fff' }}>
                {!isLocationLocked && <option value="">Select location</option>}
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}{location.code ? ` (${location.code})` : ''}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Supplier</span>
              <select value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))} style={fieldStyle}>
                <option value="">Select supplier</option>
                {supplierOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Transaction Date</span>
              <input type="date" value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Transaction Type</span>
              <select value={form.transactionType} onChange={(event) => setForm((current) => ({ ...current, transactionType: event.target.value }))} style={fieldStyle}>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Payment Method</span>
              <select value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))} style={fieldStyle}>
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Amount</span>
              <input type="number" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} style={fieldStyle} placeholder="0.00" />
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Reference Number</span>
              <input value={form.referenceNo} onChange={(event) => setForm((current) => ({ ...current, referenceNo: event.target.value }))} style={fieldStyle} placeholder="Bank ref, receipt no, voucher no" />
            </label>
          </div>

          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ fontWeight: 700, color: '#334155' }}>Description</span>
            <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} style={{ ...fieldStyle, minHeight: '96px', resize: 'vertical' }} placeholder="Narration or business context for this transaction" />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#0f766e', color: '#fff', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : transaction ? 'Save Transaction' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierTransactionFormModal;
