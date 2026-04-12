import React, { useEffect, useState } from 'react';

const EMPLOYMENT_TYPES = ['permanent', 'contract', 'casual', 'temporary', 'part_time', 'other'];
const GENDERS = ['male', 'female', 'other'];
const STATUSES = ['active', 'inactive', 'terminated'];

const defaultForm = {
  locationId: '',
  employeeNo: '',
  firstName: '',
  surname: '',
  middleName: '',
  gender: '',
  dateOfBirth: '',
  districtOfOrigin: '',
  village: '',
  traditionalAuthority: '',
  nationalId: '',
  nationalIdExpiryDate: '',
  contactNumber: '',
  dateOfEmployment: '',
  position: '',
  department: '',
  employmentType: '',
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

const labelStyle = {
  display: 'block',
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: '0.35rem',
  fontSize: '0.87rem',
};

const sectionLabel = {
  fontSize: '0.74rem',
  fontWeight: 800,
  color: '#5B4B8A',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  gridColumn: '1 / -1',
  paddingTop: '0.35rem',
};

const toDateValue = (value) => {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
};

const EmployeeFormModal = ({ isOpen, employee, selectedLocationId = null, locations = [], saving, error, onClose, onSubmit }) => {
  const [form, setForm] = useState(defaultForm);
  const [validationError, setValidationError] = useState('');
  const isCreateMode = !employee;
  const isLocationLocked = isCreateMode && Boolean(selectedLocationId);

  useEffect(() => {
    if (!isOpen) return;
    setValidationError('');
    const scopedLocationId = selectedLocationId ? String(selectedLocationId) : '';
    const existingLocationId = employee?.locationId ? String(employee.locationId) : '';
    setForm({
      locationId: existingLocationId || scopedLocationId,
      employeeNo: employee?.employeeNo || '',
      firstName: employee?.firstName || '',
      surname: employee?.surname || '',
      middleName: employee?.middleName || '',
      gender: employee?.gender || '',
      dateOfBirth: toDateValue(employee?.dateOfBirth),
      districtOfOrigin: employee?.districtOfOrigin || '',
      village: employee?.village || '',
      traditionalAuthority: employee?.traditionalAuthority || '',
      nationalId: employee?.nationalId || '',
      nationalIdExpiryDate: toDateValue(employee?.nationalIdExpiryDate),
      contactNumber: employee?.contactNumber || '',
      dateOfEmployment: toDateValue(employee?.dateOfEmployment),
      position: employee?.position || '',
      department: employee?.department || '',
      employmentType: employee?.employmentType || '',
      status: employee?.status || 'active',
      notes: employee?.notes || '',
    });
  }, [isOpen, employee, selectedLocationId]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!String(form.firstName || '').trim()) {
      setValidationError('First name is required.');
      return;
    }
    if (!String(form.surname || '').trim()) {
      setValidationError('Surname is required.');
      return;
    }
    if (!form.locationId) {
      setValidationError('Location is required.');
      return;
    }
    setValidationError('');
    onSubmit({
      locationId: Number(form.locationId),
      employeeNo: form.employeeNo.trim() || null,
      firstName: form.firstName.trim(),
      surname: form.surname.trim(),
      middleName: form.middleName.trim() || null,
      gender: form.gender || null,
      dateOfBirth: form.dateOfBirth || null,
      districtOfOrigin: form.districtOfOrigin.trim() || null,
      village: form.village.trim() || null,
      traditionalAuthority: form.traditionalAuthority.trim() || null,
      nationalId: form.nationalId.trim() || null,
      nationalIdExpiryDate: form.nationalIdExpiryDate || null,
      contactNumber: form.contactNumber.trim() || null,
      dateOfEmployment: form.dateOfEmployment || null,
      position: form.position.trim() || null,
      department: form.department.trim() || null,
      employmentType: form.employmentType || null,
      status: form.status || 'active',
      notes: form.notes.trim() || null,
    });
  };

  const title = employee ? 'Edit Employee' : 'Add New Employee';
  const displayError = validationError || error;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 220, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(860px, 100%)', maxHeight: '94vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '22px', border: '1px solid #e2e8f0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.2rem 1.3rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 5, borderRadius: '22px 22px 0 0' }}>
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

        <form onSubmit={handleSubmit} style={{ padding: '1.3rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>

          {/* ── Employment info ── */}
          <div style={sectionLabel}>Employment Information</div>

          <div>
            <label style={labelStyle}>Location <span style={{ color: '#ef4444' }}>*</span></label>
            <select value={form.locationId} onChange={set('locationId')} disabled={isLocationLocked} style={{ ...fieldStyle, backgroundColor: isLocationLocked ? '#f8fafc' : '#fff' }}>
              {!isLocationLocked && <option value="">Select location</option>}
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}{location.code ? ` (${location.code})` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Employee Number</label>
            <input type="text" value={form.employeeNo} onChange={set('employeeNo')} placeholder="e.g. EMP001" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={form.status} onChange={set('status')} style={fieldStyle}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Position</label>
            <input type="text" value={form.position} onChange={set('position')} placeholder="e.g. Cashier" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Department</label>
            <input type="text" value={form.department} onChange={set('department')} placeholder="e.g. Operations" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Employment Type</label>
            <select value={form.employmentType} onChange={set('employmentType')} style={fieldStyle}>
              <option value="">Select type</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date of Employment</label>
            <input type="date" value={form.dateOfEmployment} onChange={set('dateOfEmployment')} style={fieldStyle} />
          </div>

          {/* ── Personal info ── */}
          <div style={sectionLabel}>Personal Information</div>

          <div>
            <label style={labelStyle}>First Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="text" value={form.firstName} onChange={set('firstName')} placeholder="First name" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Surname <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="text" value={form.surname} onChange={set('surname')} placeholder="Surname" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Middle Name</label>
            <input type="text" value={form.middleName} onChange={set('middleName')} placeholder="Middle name (optional)" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Gender</label>
            <select value={form.gender} onChange={set('gender')} style={fieldStyle}>
              <option value="">Select gender</option>
              {GENDERS.map((g) => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Contact Number</label>
            <input type="text" value={form.contactNumber} onChange={set('contactNumber')} placeholder="e.g. +265 999 000 000" style={fieldStyle} />
          </div>

          {/* ── Origin ── */}
          <div style={sectionLabel}>Origin / Residence</div>

          <div>
            <label style={labelStyle}>District of Origin</label>
            <input type="text" value={form.districtOfOrigin} onChange={set('districtOfOrigin')} placeholder="District" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Village</label>
            <input type="text" value={form.village} onChange={set('village')} placeholder="Village" style={fieldStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Traditional Authority</label>
            <input type="text" value={form.traditionalAuthority} onChange={set('traditionalAuthority')} placeholder="T/A" style={fieldStyle} />
          </div>

          {/* ── Identification ── */}
          <div style={sectionLabel}>Identification</div>

          <div>
            <label style={labelStyle}>National ID</label>
            <input type="text" value={form.nationalId} onChange={set('nationalId')} placeholder="National ID number" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>National ID Expiry Date</label>
            <input type="date" value={form.nationalIdExpiryDate} onChange={set('nationalIdExpiryDate')} style={fieldStyle} />
          </div>

          {/* ── Notes ── */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="Any additional notes about this employee..."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
            />
          </div>

          {/* ── Actions ── */}
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
              style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.75rem 1.3rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? (
                <><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.45rem' }} />Saving...</>
              ) : (
                <><i className="fas fa-check" style={{ marginRight: '0.45rem' }} />{employee ? 'Save Changes' : 'Add Employee'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeFormModal;
