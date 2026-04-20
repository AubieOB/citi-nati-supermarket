import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../utils/api.js';

const emptyForm = {
  district: '',
  area: '',
  customArea: '',
  allowCustomArea: false,
  latitude: '',
  longitude: '',
  radiusKm: '',
  deliveryFee: '',
  isActive: true,
};

const numberToInput = (value) => (value === null || value === undefined ? '' : String(value));

const districtLabel = (district) => String(district || '').replace(/\s+district$/i, '').trim();

const cardStyle = {
  background: '#ffffff',
  borderRadius: '14px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 6px 22px rgba(15, 23, 42, 0.05)',
};

const fieldStyle = {
  width: '100%',
  marginTop: '0.35rem',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  padding: '0.62rem 0.7rem',
  fontSize: '0.92rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
  boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
  outline: 'none',
  transition: 'border-color 0.16s ease, box-shadow 0.16s ease',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'grid',
  gap: '0.15rem',
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#334155',
};

const subtleButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: '9px',
  background: '#fff',
  color: '#334155',
  padding: '0.55rem 0.9rem',
  cursor: 'pointer',
  fontWeight: 600,
};

const AdminDeliveryCoverage = () => {
  const [zones, setZones] = useState([]);
  const [masterDistricts, setMasterDistricts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masterLoading, setMasterLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [autofillState, setAutofillState] = useState({
    status: 'idle',
    message: '',
  });
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const filterBarRef = useRef(null);

  const districtOptions = useMemo(() => {
    const base = masterDistricts.map((entry) => entry.district);
    const zoneOnlyDistricts = zones
      .map((zone) => zone.district)
      .filter((district) => district && !base.includes(district));
    return [...base, ...zoneOnlyDistricts];
  }, [masterDistricts, zones]);

  const areaOptionsForDistrict = useMemo(() => {
    if (!form.district) return [];
    const districtEntry = masterDistricts.find((entry) => entry.district === form.district);
    return districtEntry?.areas || [];
  }, [masterDistricts, form.district]);

  const activeAreaCount = useMemo(
    () => zones.filter((zone) => zone.isActive).length,
    [zones]
  );

  const selectedDistrictActiveAreaCount = useMemo(
    () => zones.filter((zone) => zone.isActive && zone.district === form.district).length,
    [zones, form.district]
  );

  const fetchZones = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/admin/delivery-zones');
      setZones(Array.isArray(response.data?.zones) ? response.data.zones : []);
    } catch (err) {
      console.error('Failed to fetch delivery zones:', err);
      setError(err.response?.data?.error || 'Failed to load delivery zones.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterLocations = async () => {
    try {
      setMasterLoading(true);
      const response = await api.get('/admin/delivery-zones/master');
      setMasterDistricts(Array.isArray(response.data?.districts) ? response.data.districts : []);
    } catch (err) {
      console.error('Failed to fetch Malawi location master:', err);
      setError(err.response?.data?.error || 'Failed to load Malawi districts and areas.');
    } finally {
      setMasterLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterLocations();
    fetchZones();
  }, []);

  useEffect(() => {
    let resizeObserver;

    const updateFilterBarLayout = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;

      const rect = contentArea.getBoundingClientRect();
      const mobileTopOffset = 56;

      setFilterBarLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? mobileTopOffset : 0,
      });

      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };

    updateFilterBarLayout();
    window.addEventListener('resize', updateFilterBarLayout);

    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFilterBarLayout);
      resizeObserver.observe(contentArea);
    }

    return () => {
      window.removeEventListener('resize', updateFilterBarLayout);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  useEffect(() => {
    if (!success) return undefined;
    const timerId = setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(timerId);
  }, [success]);

  useEffect(() => {
    if (!error) return undefined;
    const timerId = setTimeout(() => setError(''), 6500);
    return () => clearTimeout(timerId);
  }, [error]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingZoneId(null);
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    if (name === 'district') {
      setForm((prev) => ({
        ...prev,
        district: value,
        area: '',
        customArea: '',
      }));
      setAutofillState({ status: 'idle', message: '' });
      return;
    }

    if (name === 'area') {
      const districtEntry = masterDistricts.find((entry) => entry.district === form.district);
      const selectedArea = districtEntry?.areas?.find((area) => area.name === value) || null;

      setForm((prev) => ({
        ...prev,
        area: value,
        latitude: selectedArea?.defaultLatitude != null ? String(selectedArea.defaultLatitude) : prev.latitude,
        longitude: selectedArea?.defaultLongitude != null ? String(selectedArea.defaultLongitude) : prev.longitude,
        radiusKm: selectedArea?.defaultRadiusKm != null ? String(selectedArea.defaultRadiusKm) : prev.radiusKm,
      }));

      if (selectedArea?.defaultLatitude != null && selectedArea?.defaultLongitude != null && selectedArea?.defaultRadiusKm != null) {
        setAutofillState({
          status: 'filled',
          message: 'Latitude, longitude, and radius were auto-filled from the selected area and can be adjusted manually.',
        });
      } else {
        setAutofillState({
          status: 'missing',
          message: 'Selected area has no default coordinates metadata yet. Please enter values manually.',
        });
      }
      return;
    }

    if (name === 'allowCustomArea') {
      setForm((prev) => ({
        ...prev,
        allowCustomArea: checked,
        ...(checked ? { area: '' } : { customArea: '' }),
      }));

      setAutofillState({
        status: checked ? 'missing' : 'idle',
        message: checked
          ? 'Custom area mode enabled. Enter coordinates manually or adjust as needed.'
          : '',
      });
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const toPayload = () => ({
    district: form.district.trim(),
    area: (form.allowCustomArea ? form.customArea : form.area).trim(),
    allowCustomArea: Boolean(form.allowCustomArea),
    latitude: form.latitude === '' ? null : Number(form.latitude),
    longitude: form.longitude === '' ? null : Number(form.longitude),
    radiusKm: form.radiusKm === '' ? null : Number(form.radiusKm),
    deliveryFee: form.deliveryFee === '' ? null : Number(form.deliveryFee),
    isActive: Boolean(form.isActive),
  });

  const handleSubmit = async (event) => {
    event.preventDefault();

    const selectedArea = (form.allowCustomArea ? form.customArea : form.area).trim();
    if (!form.district.trim() || !selectedArea) {
      setError('District and area are required.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const payload = toPayload();

      if (editingZoneId) {
        await api.put(`/admin/delivery-zones/${editingZoneId}`, payload);
        setSuccess('Delivery zone updated successfully.');
      } else {
        await api.post('/admin/delivery-zones', payload);
        setSuccess('Delivery zone created successfully.');
      }

      resetForm();
      await fetchZones();
    } catch (err) {
      console.error('Failed to save delivery zone:', err);
      setError(err.response?.data?.error || 'Failed to save delivery zone.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (zone) => {
    const districtAreas = masterDistricts.find((entry) => entry.district === zone.district)?.areas || [];
    const isKnownArea = districtAreas.some((entry) => entry.name === zone.area);

    setEditingZoneId(zone.id);
    setForm({
      district: zone.district || '',
      area: isKnownArea ? zone.area : '',
      customArea: isKnownArea ? '' : (zone.area || ''),
      allowCustomArea: !isKnownArea,
      latitude: numberToInput(zone.latitude),
      longitude: numberToInput(zone.longitude),
      radiusKm: numberToInput(zone.radiusKm),
      deliveryFee: numberToInput(zone.deliveryFee),
      isActive: Boolean(zone.isActive),
    });
    setError('');
    setSuccess('');
    setAutofillState({
      status: 'filled',
      message: 'Loaded existing zone values. You can manually adjust coordinates and radius before saving.',
    });
  };

  const handleToggleActive = async (zone) => {
    try {
      setError('');
      setSuccess('');
      await api.patch(`/admin/delivery-zones/${zone.id}/active`, { isActive: !zone.isActive });
      setSuccess(`Zone ${zone.isActive ? 'disabled' : 'enabled'} successfully.`);
      await fetchZones();
    } catch (err) {
      console.error('Failed to update active state:', err);
      setError(err.response?.data?.error || 'Failed to update zone state.');
    }
  };

  const handleDelete = async (zoneId) => {
    if (!window.confirm('Delete this delivery zone permanently?')) return;

    try {
      setError('');
      setSuccess('');
      await api.delete(`/admin/delivery-zones/${zoneId}`);
      setSuccess('Delivery zone deleted successfully.');
      if (editingZoneId === zoneId) {
        resetForm();
      }
      await fetchZones();
    } catch (err) {
      console.error('Failed to delete delivery zone:', err);
      setError(err.response?.data?.error || 'Failed to delete delivery zone.');
    }
  };

  const filterBarSpacerHeight = filterBarHeight > 0 ? filterBarHeight + 8 : 0;

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={filterBarRef}
        className="admin-filter-bar-fixed admin-mobile-filter-bar"
        style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 80,
          backgroundColor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          padding: '0.82rem 1rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.12rem', color: '#0f172a', fontWeight: 800 }}>
          Delivery Coverage
        </h2>
        <p style={{ margin: '0.38rem 0 0', color: '#0f172a', fontSize: '0.82rem', fontWeight: 700 }}>
          Malawi districts: {masterDistricts.length} | Active delivery areas: {activeAreaCount} | Configured zones: {zones.length}
        </p>
      </div>

      <div style={{ height: filterBarSpacerHeight }} />

      <div style={{ padding: '0.95rem', background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 45%)' }}>

      {error && (
        <div style={{ marginBottom: '0.9rem', padding: '0.75rem', borderRadius: '10px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ marginBottom: '0.9rem', padding: '0.75rem', borderRadius: '10px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534' }}>
          {success}
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <form onSubmit={handleSubmit} style={{
          ...cardStyle,
          padding: '1rem',
          display: 'grid',
          gap: '0.8rem',
          alignContent: 'start',
          maxHeight: '72vh',
          overflowY: 'auto',
        }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 700, letterSpacing: '0.01em' }}>
            {editingZoneId ? 'Edit Delivery Zone' : 'Add Delivery Zone'}
          </h3>

          <label style={labelStyle}>
            District
            <select
              name="district"
              value={form.district}
              onChange={handleInputChange}
              disabled={masterLoading}
              style={fieldStyle}
            >
              <option value="">Select district</option>
              {districtOptions.map((district) => {
                const areaCount = masterDistricts.find((entry) => entry.district === district)?.areas?.length || 0;
                return (
                  <option key={district} value={district}>{`${districtLabel(district)}${areaCount ? ` (${areaCount})` : ''}`}</option>
                );
              })}
            </select>
          </label>

          {!!form.district && (
            <p style={{ margin: '-0.15rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Total predefined areas for {form.district}: {areaOptionsForDistrict.length}
            </p>
          )}

          <label style={labelStyle}>
            Area
            <select
              name="area"
              value={form.area}
              onChange={handleInputChange}
              disabled={!form.district || form.allowCustomArea || masterLoading}
              style={fieldStyle}
            >
              <option value="">Select area</option>
              {areaOptionsForDistrict.map((area) => (
                <option key={area.name} value={area.name}>{area.name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
            <input type="checkbox" name="allowCustomArea" checked={form.allowCustomArea} onChange={handleInputChange} />
            Use custom area (optional)
          </label>

          {form.allowCustomArea && (
            <label style={labelStyle}>
              Custom Area Name
              <input
                name="customArea"
                value={form.customArea}
                onChange={handleInputChange}
                placeholder="Type custom area"
                style={fieldStyle}
              />
            </label>
          )}

          {!!form.district && selectedDistrictActiveAreaCount === 0 && (
            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '8px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: '0.82rem' }}>
              No areas are active yet for {form.district}. Activate one or more areas to allow checkout deliveries.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.55rem' }}>
            <label style={labelStyle}>
              Latitude
              <input type="number" step="0.000001" name="latitude" value={form.latitude} onChange={handleInputChange} style={fieldStyle} placeholder="e.g. -15.7867" />
            </label>
            <label style={labelStyle}>
              Longitude
              <input type="number" step="0.000001" name="longitude" value={form.longitude} onChange={handleInputChange} style={fieldStyle} placeholder="e.g. 35.0058" />
            </label>
          </div>

          {autofillState.message && (
            <div style={{
              padding: '0.55rem 0.65rem',
              borderRadius: '8px',
              background: autofillState.status === 'filled' ? '#eff6ff' : '#fff7ed',
              border: autofillState.status === 'filled' ? '1px solid #bfdbfe' : '1px solid #fed7aa',
              color: autofillState.status === 'filled' ? '#1d4ed8' : '#9a3412',
              fontSize: '0.82rem',
            }}>
              {autofillState.message}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.55rem' }}>
            <label style={labelStyle}>
              Radius (km)
              <input type="number" step="0.1" name="radiusKm" value={form.radiusKm} onChange={handleInputChange} style={fieldStyle} placeholder="e.g. 4.5" />
            </label>
            <label style={labelStyle}>
              Delivery Fee (MWK)
              <input type="number" step="0.01" name="deliveryFee" value={form.deliveryFee} onChange={handleInputChange} style={fieldStyle} placeholder="e.g. 2500" />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleInputChange} />
            Active
          </label>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: '10px', background: '#2563eb', color: '#fff', padding: '0.58rem 0.95rem', cursor: 'pointer', fontWeight: 700 }}>
              {saving ? 'Saving...' : editingZoneId ? 'Update Zone' : 'Save Zone'}
            </button>
            {editingZoneId && (
              <button type="button" onClick={resetForm} style={subtleButtonStyle}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>

        <div style={{
          ...cardStyle,
          padding: '1rem',
          maxHeight: '72vh',
          overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>Delivery Zones</h3>
            <button type="button" onClick={fetchZones} disabled={loading} style={subtleButtonStyle}>
              Refresh
            </button>
          </div>

          <p style={{ margin: '0 0 0.55rem', color: '#64748b', fontSize: '0.85rem' }}>
            Preloaded districts: {masterDistricts.length} | Active areas: {activeAreaCount}
          </p>

          {loading ? (
            <div style={{ color: '#64748b' }}>Loading zones...</div>
          ) : zones.length === 0 ? (
            <div style={{ color: '#64748b' }}>No delivery zones configured yet.</div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: '56vh', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', background: '#fff' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '0.45rem 0.35rem' }}>District</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '0.45rem 0.35rem' }}>Area</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '0.45rem 0.35rem' }}>Status</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '0.45rem 0.35rem' }}>Fee</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '0.45rem 0.35rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td style={{ padding: '0.45rem 0.35rem', borderBottom: '1px solid #f1f5f9' }}>{districtLabel(zone.district)}</td>
                    <td style={{ padding: '0.45rem 0.35rem', borderBottom: '1px solid #f1f5f9' }}>{zone.area}</td>
                    <td style={{ padding: '0.45rem 0.35rem', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '999px',
                        fontWeight: 700,
                        background: zone.isActive ? '#dcfce7' : '#fee2e2',
                        color: zone.isActive ? '#166534' : '#b91c1c',
                      }}>
                        {zone.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.45rem 0.35rem', borderBottom: '1px solid #f1f5f9' }}>
                      {zone.deliveryFee == null ? 'N/A' : `MWK ${Number(zone.deliveryFee).toLocaleString()}`}
                    </td>
                    <td style={{ padding: '0.45rem 0.35rem', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => handleEdit(zone)} style={{ ...subtleButtonStyle, borderRadius: '7px', padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}>
                          Edit
                        </button>
                        <button type="button" onClick={() => handleToggleActive(zone)} style={{ ...subtleButtonStyle, borderRadius: '7px', padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}>
                          {zone.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" onClick={() => handleDelete(zone.id)} style={{ border: '1px solid #fecaca', borderRadius: '7px', background: '#fff1f2', color: '#b91c1c', padding: '0.3rem 0.55rem', cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default AdminDeliveryCoverage;
