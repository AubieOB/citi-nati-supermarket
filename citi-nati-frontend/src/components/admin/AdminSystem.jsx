import React, { useEffect, useState, useRef } from 'react';
import api from '../../utils/api.js';
import { useModal } from '../../hooks/useModal.js';
import Modal from '../common/Modal.jsx';

const DEFAULT_MESSAGE = 'We are currently carrying out maintenance to improve your experience. We apologize for the inconvenience.';
const DEFAULT_VAT_RATE = 16.5;

const DEFAULT_BUSINESS_TIME = {
  timezoneName: 'UTC+02:00',
  offsetMinutes: 120,
  offsetLabel: 'UTC+02:00',
  now: '',
};

const pad2 = (value) => String(value).padStart(2, '0');

const formatBusinessNow = (offsetMinutes = 120) => {
  const shifted = new Date(Date.now() + (Number(offsetMinutes || 0) * 60000));
  const yyyy = shifted.getUTCFullYear();
  const mm = pad2(shifted.getUTCMonth() + 1);
  const dd = pad2(shifted.getUTCDate());
  const hh = pad2(shifted.getUTCHours());
  const min = pad2(shifted.getUTCMinutes());
  const sec = pad2(shifted.getUTCSeconds());
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${sec}`;
};

const AdminSystem = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(DEFAULT_MESSAGE);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [configuredVatRatePercent, setConfiguredVatRatePercent] = useState(DEFAULT_VAT_RATE);
  const [businessTime, setBusinessTime] = useState(DEFAULT_BUSINESS_TIME);
  const [businessNowDisplay, setBusinessNowDisplay] = useState('');
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const { modal, showError, showSuccess, closeModal } = useModal();
  const filterBarRef = useRef(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get('/admin/system/settings');
        const settings = response.data?.settings || {};
        setMaintenanceMode(Boolean(settings.maintenanceMode));
        setMaintenanceMessage(settings.maintenanceMessage || DEFAULT_MESSAGE);
        setVatEnabled(settings.vatEnabled !== false);
        setConfiguredVatRatePercent(Number(settings.configuredVatRatePercent || settings.vatRatePercent || DEFAULT_VAT_RATE));
        const businessTimeSettings = settings.businessTime || DEFAULT_BUSINESS_TIME;
        setBusinessTime(businessTimeSettings);
        setBusinessNowDisplay(formatBusinessNow(Number(businessTimeSettings.offsetMinutes || 120)));
      } catch (err) {
        showError('System settings', err.response?.data?.error || 'Failed to load system settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [showError]);

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

  // Re-measure bar height after each render to account for content wrapping
  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  useEffect(() => {
    const offset = Number(businessTime?.offsetMinutes || 120);
    setBusinessNowDisplay(formatBusinessNow(offset));

    const id = setInterval(() => {
      setBusinessNowDisplay(formatBusinessNow(offset));
    }, 1000);

    return () => clearInterval(id);
  }, [businessTime]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await api.put('/admin/system/maintenance', {
        maintenanceMode,
        maintenanceMessage,
        vatEnabled,
      });
      const settings = response.data?.settings || {};
      setVatEnabled(settings.vatEnabled !== false);
      setConfiguredVatRatePercent(Number(settings.configuredVatRatePercent || settings.vatRatePercent || DEFAULT_VAT_RATE));
      const businessTimeSettings = settings.businessTime || DEFAULT_BUSINESS_TIME;
      setBusinessTime(businessTimeSettings);
      setBusinessNowDisplay(formatBusinessNow(Number(businessTimeSettings.offsetMinutes || 120)));
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

  const systemFilterSpacerHeight = filterBarHeight > 0 ? filterBarHeight + 8 : 0;

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={filterBarRef}
        style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 80,
          backgroundColor: '#fff',
          border: '1px solid #eee',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          padding: '0.75rem 1rem',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
        }}>
          <i className="fas fa-sliders-h" style={{ fontSize: '1.2rem', color: '#5B4B8A' }}></i>
          <h1 style={{ margin: 0, color: '#333', fontSize: '1.15rem' }}>System Settings</h1>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <div>
            <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600' }}>
              Maintenance: {maintenanceMode ? 'ENABLED' : 'DISABLED'}
            </div>
            <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600', marginTop: '0.2rem' }}>
              VAT: {vatEnabled ? `ENABLED (${configuredVatRatePercent.toFixed(1)}%)` : 'DISABLED'}
            </div>
          </div>
          <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600' }}>
              Business Timezone: {businessTime.timezoneName} ({businessTime.offsetLabel})
            </div>
            <div style={{ color: '#334155', fontSize: '0.9rem', fontWeight: 700, marginTop: '0.2rem' }}>
              Current Business Time: {businessNowDisplay || formatBusinessNow(Number(businessTime.offsetMinutes || 120)) || 'N/A'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: `${systemFilterSpacerHeight}px` }}></div>

      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '1rem',
        maxWidth: '820px',
        margin: '0 auto',
        display: 'grid',
        gap: '1.25rem',
      }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0, color: '#333', marginBottom: '1rem' }}>System Configuration</h2>
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

          <label style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: vatEnabled ? '#effcf6' : '#f9fafb'
          }}>
            <div>
              <div style={{ fontWeight: 700, color: '#333', marginBottom: '0.25rem' }}>VAT on Online and Emergency Sales</div>
              <div style={{ color: '#666', fontSize: '0.92rem' }}>
                {vatEnabled
                  ? `Apply VAT at ${configuredVatRatePercent.toFixed(1)}% to website checkout and emergency sales.`
                  : 'Do not apply VAT to website checkout and emergency sales.'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={vatEnabled}
              onChange={(event) => setVatEnabled(event.target.checked)}
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

          <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
            VAT rate is fixed at {configuredVatRatePercent.toFixed(1)}%. This toggle only turns that rate on or off.
          </div>

          <div style={{ color: '#475569', fontSize: '0.9rem', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.75rem 0.85rem' }}>
            Business clock source: <strong>{businessTime.timezoneName}</strong> ({businessTime.offsetLabel}) | Live: <strong>{businessNowDisplay || formatBusinessNow(Number(businessTime.offsetMinutes || 120)) || 'N/A'}</strong>
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
