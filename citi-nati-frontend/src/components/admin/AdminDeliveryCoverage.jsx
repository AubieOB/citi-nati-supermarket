import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api.js';

const emptyForm = {
  district: '',
  area: '',
  latitude: '',
  longitude: '',
  radiusKm: '',
  deliveryFee: '',
  isActive: true,
};

const numberToInput = (value) => (value === null || value === undefined ? '' : String(value));

const AdminDeliveryCoverage = () => {
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const districts = useMemo(
    () => Array.from(new Set(zones.map((zone) => zone.district))).sort((a, b) => a.localeCompare(b)),
    [zones]
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

  useEffect(() => {
    fetchZones();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingZoneId(null);
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const toPayload = () => ({
    district: form.district.trim(),
    area: form.area.trim(),
    latitude: form.latitude === '' ? null : Number(form.latitude),
    longitude: form.longitude === '' ? null : Number(form.longitude),
    radiusKm: form.radiusKm === '' ? null : Number(form.radiusKm),
    deliveryFee: form.deliveryFee === '' ? null : Number(form.deliveryFee),
    isActive: Boolean(form.isActive),
  });

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.district.trim() || !form.area.trim()) {
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
    setEditingZoneId(zone.id);
    setForm({
      district: zone.district || '',
      area: zone.area || '',
      latitude: numberToInput(zone.latitude),
      longitude: numberToInput(zone.longitude),
      radiusKm: numberToInput(zone.radiusKm),
      deliveryFee: numberToInput(zone.deliveryFee),
      isActive: Boolean(zone.isActive),
    });
    setError('');
    setSuccess('');
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

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 6px 22px rgba(15, 23, 42, 0.06)',
        padding: '1rem',
        marginBottom: '1rem',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#334155' }}>
          Delivery Coverage
        </h2>
        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
          Manage supported districts and delivery areas with optional GPS radius enforcement.
        </p>
      </div>

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

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <form onSubmit={handleSubmit} style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 6px 22px rgba(15, 23, 42, 0.05)',
          padding: '1rem',
          display: 'grid',
          gap: '0.75rem',
          alignContent: 'start',
        }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#334155' }}>
            {editingZoneId ? 'Edit Delivery Zone' : 'Add Delivery Zone'}
          </h3>

          <label>
            District
            <input name="district" value={form.district} onChange={handleInputChange} placeholder="e.g. Blantyre" style={{ width: '100%', marginTop: '0.25rem' }} />
          </label>

          <label>
            Area
            <input name="area" value={form.area} onChange={handleInputChange} placeholder="e.g. Namiwawa" style={{ width: '100%', marginTop: '0.25rem' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
            <label>
              Latitude
              <input type="number" step="0.000001" name="latitude" value={form.latitude} onChange={handleInputChange} style={{ width: '100%', marginTop: '0.25rem' }} />
            </label>
            <label>
              Longitude
              <input type="number" step="0.000001" name="longitude" value={form.longitude} onChange={handleInputChange} style={{ width: '100%', marginTop: '0.25rem' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
            <label>
              Radius (km)
              <input type="number" step="0.1" name="radiusKm" value={form.radiusKm} onChange={handleInputChange} style={{ width: '100%', marginTop: '0.25rem' }} />
            </label>
            <label>
              Delivery Fee (MWK)
              <input type="number" step="0.01" name="deliveryFee" value={form.deliveryFee} onChange={handleInputChange} style={{ width: '100%', marginTop: '0.25rem' }} />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleInputChange} />
            Active
          </label>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: '9px', background: '#2563eb', color: '#fff', padding: '0.55rem 0.9rem', cursor: 'pointer' }}>
              {saving ? 'Saving...' : editingZoneId ? 'Update Zone' : 'Save Zone'}
            </button>
            {editingZoneId && (
              <button type="button" onClick={resetForm} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', background: '#fff', color: '#334155', padding: '0.55rem 0.9rem', cursor: 'pointer' }}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>

        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 6px 22px rgba(15, 23, 42, 0.05)',
          padding: '1rem',
          overflow: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#334155' }}>Delivery Zones</h3>
            <button type="button" onClick={fetchZones} disabled={loading} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', color: '#334155', padding: '0.45rem 0.75rem', cursor: 'pointer' }}>
              Refresh
            </button>
          </div>

          <p style={{ margin: '0 0 0.55rem', color: '#64748b', fontSize: '0.85rem' }}>
            Districts: {districts.join(', ') || 'None'}
          </p>

          {loading ? (
            <div style={{ color: '#64748b' }}>Loading zones...</div>
          ) : zones.length === 0 ? (
            <div style={{ color: '#64748b' }}>No delivery zones configured yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
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
                    <td style={{ padding: '0.45rem 0.35rem', borderBottom: '1px solid #f1f5f9' }}>{zone.district}</td>
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
                        <button type="button" onClick={() => handleEdit(zone)} style={{ border: '1px solid #cbd5e1', borderRadius: '7px', background: '#fff', color: '#334155', padding: '0.3rem 0.55rem', cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button type="button" onClick={() => handleToggleActive(zone)} style={{ border: '1px solid #cbd5e1', borderRadius: '7px', background: '#fff', color: '#334155', padding: '0.3rem 0.55rem', cursor: 'pointer' }}>
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
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDeliveryCoverage;
