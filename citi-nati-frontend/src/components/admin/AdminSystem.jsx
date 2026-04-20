import React, { useEffect, useState, useRef } from 'react';
import api from '../../utils/api.js';
import { useModal } from '../../hooks/useModal.js';
import Modal from '../common/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSION_KEYS, hasPermission } from '../../utils/permissions.js';

const DEFAULT_MESSAGE = 'We are currently carrying out maintenance to improve your experience. We apologize for the inconvenience.';
const DEFAULT_VAT_RATE = 16.5;
const DEFAULT_MINIMUM_ORDER_VALUE = 10000;

const DEFAULT_BUSINESS_TIME = {
  timezoneName: 'UTC+02:00',
  offsetMinutes: 120,
  offsetLabel: 'UTC+02:00',
  now: '',
};

const formatChangeDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
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
  const { user: loggedInUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(DEFAULT_MESSAGE);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [configuredVatRatePercent, setConfiguredVatRatePercent] = useState(DEFAULT_VAT_RATE);
  const [minimumOrderValue, setMinimumOrderValue] = useState(DEFAULT_MINIMUM_ORDER_VALUE);
  const [emergencySalesDayOpen, setEmergencySalesDayOpen] = useState(true);
  const [emergencySalesDayLastChange, setEmergencySalesDayLastChange] = useState(null);
  const [updatingEmergencySalesDay, setUpdatingEmergencySalesDay] = useState(false);
  const [businessTime, setBusinessTime] = useState(DEFAULT_BUSINESS_TIME);
  const [businessNowDisplay, setBusinessNowDisplay] = useState('');
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const { modal, showConfirm, showError, showSuccess, closeModal } = useModal();
  const filterBarRef = useRef(null);
  const canManageSystem = hasPermission(loggedInUser, PERMISSION_KEYS.ADMIN_SYSTEM_MANAGE);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get('/admin/system/settings');
        const settings = response.data?.settings || {};
        setMaintenanceMode(Boolean(settings.maintenanceMode));
        setMaintenanceMessage(settings.maintenanceMessage || DEFAULT_MESSAGE);
        setVatEnabled(settings.vatEnabled !== false);
        setConfiguredVatRatePercent(Number(settings.configuredVatRatePercent || settings.vatRatePercent || DEFAULT_VAT_RATE));
        setMinimumOrderValue(Number(settings.minimumOrderValue ?? DEFAULT_MINIMUM_ORDER_VALUE));
        setEmergencySalesDayOpen(settings.emergencySalesDayOpen !== false);
        setEmergencySalesDayLastChange(settings.emergencySalesDayLastChange || null);
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
    if (!canManageSystem) {
      showError('Access denied', 'You do not have permission to update system settings.');
      return;
    }

    try {
      setSaving(true);
      const normalizedMinimumOrderValue = Number(minimumOrderValue);
      if (!Number.isFinite(normalizedMinimumOrderValue) || normalizedMinimumOrderValue < 0) {
        showError('Validation', 'Minimum order value must be a valid non-negative number.');
        setSaving(false);
        return;
      }

      const response = await api.put('/admin/system/maintenance', {
        maintenanceMode,
        maintenanceMessage,
        vatEnabled,
        minimumOrderValue: normalizedMinimumOrderValue,
      });
      const settings = response.data?.settings || {};
      setVatEnabled(settings.vatEnabled !== false);
      setConfiguredVatRatePercent(Number(settings.configuredVatRatePercent || settings.vatRatePercent || DEFAULT_VAT_RATE));
      setMinimumOrderValue(Number(settings.minimumOrderValue ?? DEFAULT_MINIMUM_ORDER_VALUE));
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

  const handleEmergencySalesDayToggle = () => {
    if (!canManageSystem || updatingEmergencySalesDay) {
      if (!canManageSystem) {
        showError('Access denied', 'You do not have permission to change emergency sales day access.');
      }
      return;
    }

    const nextOpenState = !emergencySalesDayOpen;

    showConfirm(
      nextOpenState ? 'Open Emergency Sales Day' : 'Close Emergency Sales Day',
      nextOpenState
        ? 'This will unlock the cashier emergency sales dashboard for all cashiers.'
        : 'This will immediately lock the cashier emergency sales dashboard for all cashiers.',
      async () => {
        try {
          setUpdatingEmergencySalesDay(true);
          const response = await api.put('/admin/system/emergency-sales-day', {
            emergencySalesDayOpen: nextOpenState,
          });

          setEmergencySalesDayOpen(response.data?.settings?.emergencySalesDayOpen !== false);
          setEmergencySalesDayLastChange(response.data?.settings?.emergencySalesDayLastChange || null);
          showSuccess('Emergency Sales Day Updated', response.data?.message || 'Emergency sales day state updated successfully.');
        } catch (err) {
          showError('Update failed', err.response?.data?.error || 'Failed to update emergency sales day state');
        } finally {
          setUpdatingEmergencySalesDay(false);
        }
      }
    );
  };

  if (loading) {
    return <div style={{ padding: '1.5rem', color: '#666' }}>Loading system settings...</div>;
  }

  const systemFilterSpacerHeight = filterBarHeight > 0 ? filterBarHeight + 8 : 0;

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
          border: '1px solid #eee',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          padding: '0.75rem 1rem',
        }}
      >
        <div className="admin-mobile-filter-top-row" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
        }}>
          <i className="fas fa-sliders-h" style={{ fontSize: '1.2rem', color: '#5B4B8A' }}></i>
          <h1 style={{ margin: 0, color: '#333', fontSize: '1.15rem' }}>System Settings</h1>
        </div>
        <div className="admin-mobile-filter-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <div>
            <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600' }}>
              Maintenance: {maintenanceMode ? 'ENABLED' : 'DISABLED'}
            </div>
            <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600', marginTop: '0.2rem' }}>
              VAT: {vatEnabled ? `ENABLED (${configuredVatRatePercent.toFixed(1)}%)` : 'DISABLED'}
            </div>
            <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600', marginTop: '0.2rem' }}>
              Emergency Sales Day: {emergencySalesDayOpen ? 'OPEN' : 'CLOSED'}
            </div>
            <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600', marginTop: '0.2rem' }}>
              Checkout Minimum: MWK {Number(minimumOrderValue || 0).toLocaleString()}
            </div>
          </div>
          <div className="admin-mobile-filter-meta" style={{ textAlign: 'right', marginLeft: 'auto' }}>
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
              disabled={!canManageSystem}
              style={{ width: '22px', height: '22px', cursor: canManageSystem ? 'pointer' : 'not-allowed' }}
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
              disabled={!canManageSystem}
              style={{ width: '22px', height: '22px', cursor: canManageSystem ? 'pointer' : 'not-allowed' }}
            />
          </label>

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, color: '#333' }}>
              Maintenance Message
            </label>
            <textarea
              value={maintenanceMessage}
              onChange={(event) => setMaintenanceMessage(event.target.value)}
              disabled={!canManageSystem}
              rows={1}
              style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #ddd', resize: 'vertical', minHeight: '42px' }}
              placeholder={DEFAULT_MESSAGE}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600, color: '#333' }}>
              Minimum Order Value (MWK)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={minimumOrderValue}
              onChange={(event) => setMinimumOrderValue(event.target.value)}
              disabled={!canManageSystem}
              style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #ddd' }}
              placeholder={String(DEFAULT_MINIMUM_ORDER_VALUE)}
            />
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', fontSize: '0.85rem', lineHeight: 1.45 }}>
              Minimum order value applies to cart subtotal only. Delivery fee is added after the minimum threshold is met.
            </p>
          </div>

          {canManageSystem && (
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
          )}
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#111827', fontSize: '1.05rem' }}>Emergency Sales Day Control</div>
            <p style={{ color: '#666', margin: '0.4rem 0 0', maxWidth: '560px', lineHeight: 1.5 }}>
              This is a global lock for the cashier emergency sales dashboard. When closed, cashiers cannot search products, load the emergency sales panel, or record emergency sales online.
            </p>
          </div>
          <div style={{
            borderRadius: '999px',
            padding: '0.45rem 0.85rem',
            fontWeight: 800,
            fontSize: '0.85rem',
            backgroundColor: emergencySalesDayOpen ? '#dcfce7' : '#fee2e2',
            color: emergencySalesDayOpen ? '#166534' : '#991b1b',
            alignSelf: 'center',
          }}>
            {emergencySalesDayOpen ? 'OPEN FOR CASHIERS' : 'CLOSED FOR CASHIERS'}
          </div>
        </div>

        <div style={{
          marginTop: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '1rem',
          backgroundColor: emergencySalesDayOpen ? '#f0fdf4' : '#fff7ed',
          display: 'grid',
          gap: '0.8rem',
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#333', marginBottom: '0.25rem' }}>
              {emergencySalesDayOpen ? 'Emergency sales are currently open.' : 'Emergency sales are currently closed.'}
            </div>
            <div style={{ color: '#666', fontSize: '0.92rem' }}>
              {emergencySalesDayOpen
                ? 'Cashiers can access the emergency sales dashboard and process online emergency sales.'
                : 'Cashier emergency sales access is locked until an admin opens the day again.'}
            </div>
          </div>

          <div style={{
            borderTop: '1px dashed #d1d5db',
            paddingTop: '0.7rem',
            color: '#4b5563',
            fontSize: '0.88rem',
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, color: '#374151', marginBottom: '0.25rem' }}>Last Status Change</div>
            {emergencySalesDayLastChange ? (
              <>
                <div>
                  Action: {emergencySalesDayLastChange.action === 'EMERGENCY_SALES_DAY_OPENED' ? 'Opened' : 'Closed'}
                </div>
                <div>
                  Changed At: {formatChangeDateTime(emergencySalesDayLastChange.changedAt)}
                </div>
                <div>
                  By: {emergencySalesDayLastChange.actorName || emergencySalesDayLastChange.actorEmail || emergencySalesDayLastChange.actorUserId || 'Unknown'}
                </div>
              </>
            ) : (
              <div>No status change has been recorded yet.</div>
            )}
          </div>

          {canManageSystem && (
            <button
              type="button"
              onClick={handleEmergencySalesDayToggle}
              disabled={updatingEmergencySalesDay}
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '0.9rem 1rem',
                backgroundColor: updatingEmergencySalesDay
                  ? '#94a3b8'
                  : emergencySalesDayOpen
                    ? '#b91c1c'
                    : '#166534',
                color: '#fff',
                fontWeight: 800,
                cursor: updatingEmergencySalesDay ? 'not-allowed' : 'pointer',
                width: 'fit-content',
              }}
            >
              {updatingEmergencySalesDay
                ? 'Updating...'
                : emergencySalesDayOpen
                  ? 'Close Emergency Sales Day'
                  : 'Open Emergency Sales Day'}
            </button>
          )}
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
