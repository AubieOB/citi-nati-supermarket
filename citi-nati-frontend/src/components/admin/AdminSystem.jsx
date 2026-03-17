import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { useModal } from '../../hooks/useModal.js';
import Modal from '../common/Modal.jsx';

const DEFAULT_MESSAGE = 'We are currently carrying out maintenance to improve your experience. We apologize for the inconvenience.';

const AdminSystem = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(DEFAULT_MESSAGE);
  const { modal, showError, showSuccess, closeModal } = useModal();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get('/admin/system/settings');
        const settings = response.data?.settings || {};
        setMaintenanceMode(Boolean(settings.maintenanceMode));
        setMaintenanceMessage(settings.maintenanceMessage || DEFAULT_MESSAGE);
      } catch (err) {
        showError('System settings', err.response?.data?.error || 'Failed to load system settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [showError]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await api.put('/admin/system/maintenance', {
        maintenanceMode,
        maintenanceMessage,
      });
      showSuccess('Success', response.data?.message || 'System settings saved');
    } catch (err) {
      showError('Save failed', err.response?.data?.error || 'Failed to save system settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '1.5rem', color: '#666' }}>Loading system settings...</div>;
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'grid', gap: '1.25rem' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0, color: '#333' }}>System Settings</h2>
        <p style={{ color: '#666', marginBottom: '1.25rem' }}>
          Control website-wide behavior. Maintenance mode blocks public access and shows an apology screen while keeping admin access available.
        </p>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: maintenanceMode ? '#fff7ed' : '#f9fafb'
          }}>
            <div>
              <div style={{ fontWeight: 700, color: '#333', marginBottom: '0.25rem' }}>Maintenance Mode</div>
              <div style={{ color: '#666', fontSize: '0.92rem' }}>
                {maintenanceMode ? 'Public users currently see the maintenance screen.' : 'Website is currently live for public users.'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(event) => setMaintenanceMode(event.target.checked)}
              style={{ width: '22px', height: '22px', cursor: 'pointer' }}
            />
          </label>

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, color: '#333' }}>
              Maintenance Message
            </label>
            <textarea
              value={maintenanceMessage}
              onChange={(event) => setMaintenanceMessage(event.target.value)}
              rows={5}
              style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ddd', resize: 'vertical' }}
              placeholder={DEFAULT_MESSAGE}
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              border: 'none',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              backgroundColor: saving ? '#94a3b8' : '#5B4B8A',
              color: '#fff',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Saving...' : 'Save System Settings'}
          </button>
        </div>
      </div>

      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={closeModal}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        showCancelButton={modal.showCancelButton}
      />
    </div>
  );
};

export default AdminSystem;
