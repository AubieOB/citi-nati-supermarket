import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { useModal } from '../../hooks/useModal.js';
import Modal from '../common/Modal.jsx';

const AdminSecurity = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSecurityKey, setHasSecurityKey] = useState(false);
  const [formData, setFormData] = useState({
    currentSecurityKey: '',
    securityKey: '',
    confirmSecurityKey: '',
  });
  const { modal, showError, showSuccess, closeModal } = useModal();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await api.get('/admin/security-key/status');
        setHasSecurityKey(Boolean(response.data?.hasSecurityKey));
      } catch (err) {
        showError('Security setup failed', err.response?.data?.error || 'Unable to load security key status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [showError]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.securityKey || !formData.confirmSecurityKey) {
      showError('Validation', 'Enter and confirm security key are required');
      return;
    }

    if (formData.securityKey !== formData.confirmSecurityKey) {
      showError('Validation', 'Security key confirmation does not match');
      return;
    }

    if (formData.securityKey.trim().length < 4) {
      showError('Validation', 'Security key must be at least 4 characters');
      return;
    }

    if (hasSecurityKey && !formData.currentSecurityKey) {
      showError('Validation', 'Current security key is required to change key');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        securityKey: formData.securityKey,
        confirmSecurityKey: formData.confirmSecurityKey,
      };

      if (hasSecurityKey) {
        payload.currentSecurityKey = formData.currentSecurityKey;
      }

      const response = await api.put('/admin/security-key', payload);
      showSuccess('Success', response.data?.message || 'Security key saved successfully');
      setHasSecurityKey(true);
      setFormData({ currentSecurityKey: '', securityKey: '', confirmSecurityKey: '' });
    } catch (err) {
      showError('Failed', err.response?.data?.error || 'Unable to save security key');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '1.5rem', color: '#666' }}>Loading security settings...</div>;
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <h2 style={{ marginTop: 0, color: '#333' }}>Admin Security Panel</h2>
      <p style={{ color: '#666', marginBottom: '1.25rem' }}>
        {hasSecurityKey
          ? 'Change your admin security key. You must enter your current key before setting a new one.'
          : 'Set your admin security key. This will be required before entering the admin dashboard on future logins.'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
        {hasSecurityKey && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Current Security Key</label>
            <input
              type="password"
              name="currentSecurityKey"
              value={formData.currentSecurityKey}
              onChange={handleInputChange}
              placeholder="Enter current key"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Enter Security Key</label>
          <input
            type="password"
            name="securityKey"
            value={formData.securityKey}
            onChange={handleInputChange}
            placeholder="Enter new key"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Confirm Security Key</label>
          <input
            type="password"
            name="confirmSecurityKey"
            value={formData.confirmSecurityKey}
            onChange={handleInputChange}
            placeholder="Confirm new key"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            border: 'none',
            borderRadius: '6px',
            padding: '0.8rem 1rem',
            backgroundColor: saving ? '#8898aa' : '#2D8659',
            color: '#fff',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : hasSecurityKey ? 'Change Security Key' : 'Set Security Key'}
        </button>
      </form>

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

export default AdminSecurity;
