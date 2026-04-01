import React, { useEffect, useMemo, useState } from 'react';

const defaultForm = {
  locationId: '',
  supplierCode: '',
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  openingBalance: '0',
  status: 'active',
  notes: '',
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

const SupplierFormModal = ({ isOpen, supplier, selectedLocationId = null, locations = [], saving, error, onClose, onSubmit }) => {
  const [form, setForm] = useState(defaultForm);
  const [validationError, setValidationError] = useState('');
  const isCreateMode = !supplier;
  const isLocationLocked = isCreateMode && Boolean(selectedLocationId);

  const title = useMemo(() => (supplier ? 'Edit Supplier' : 'Add New Supplier'), [supplier]);

  useEffect(() => {
    if (!isOpen) return;
    setValidationError('');
    const scopedLocationId = selectedLocationId ? String(selectedLocationId) : '';
    const existingLocationId = supplier?.locationId ? String(supplier.locationId) : '';
    setForm({
      locationId: existingLocationId || scopedLocationId,
      supplierCode: supplier?.supplierCode || '',
      name: supplier?.name || '',
      contactPerson: supplier?.contactPerson || '',
      phone: supplier?.phone || '',
      email: supplier?.email || '',
      address: supplier?.address || '',
      openingBalance: String(supplier?.openingBalance ?? 0),
      status: supplier?.status || 'active',
      notes: supplier?.notes || '',
    });
  }, [isOpen, supplier, selectedLocationId]);

  if (!isOpen) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!String(form.name || '').trim()) {
      setValidationError('Supplier name is required.');
      return;
    }

    const openingBalance = Number(form.openingBalance || 0);
    if (!Number.isFinite(openingBalance)) {
      setValidationError('Opening balance must be numeric.');
      return;
    }
    if (!form.locationId) {
      setValidationError('Location is required.');
      return;
    }

    setValidationError('');
    onSubmit({
      locationId: Number(form.locationId),
      supplierCode: form.supplierCode.trim() || null,
      name: form.name.trim(),
      contactPerson: form.contactPerson.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      openingBalance,
      status: form.status,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 220, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '22px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.2rem 1.3rem', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a' }}>{title}</h3>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>Maintain clean verified supplier master data for ongoing use.</p>
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
              <span style={{ fontWeight: 700, color: '#334155' }}>Supplier Code</span>
              <input value={form.supplierCode} onChange={(event) => setForm((current) => ({ ...current, supplierCode: event.target.value }))} style={fieldStyle} placeholder="Optional internal code" />
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Supplier Name</span>
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} style={fieldStyle} placeholder="Supplier legal or trading name" />
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Contact Person</span>
              <input value={form.contactPerson} onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))} style={fieldStyle} placeholder="Primary contact" />
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Phone</span>
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} style={fieldStyle} placeholder="Phone number" />
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Email</span>
              <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} style={fieldStyle} placeholder="Email address" />
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Opening Balance</span>
              <input type="number" step="0.01" value={form.openingBalance} onChange={(event) => setForm((current) => ({ ...current, openingBalance: event.target.value }))} style={fieldStyle} placeholder="0.00" />
            </label>
            <label style={{ display: 'grid', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Status</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} style={fieldStyle}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ fontWeight: 700, color: '#334155' }}>Address</span>
            <textarea value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} style={{ ...fieldStyle, minHeight: '84px', resize: 'vertical' }} placeholder="Physical or mailing address" />
          </label>

          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ fontWeight: 700, color: '#334155' }}>Notes</span>
            <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} style={{ ...fieldStyle, minHeight: '96px', resize: 'vertical' }} placeholder="Payment terms, account notes, relationship notes" />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : supplier ? 'Save Supplier' : 'Create Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierFormModal;
