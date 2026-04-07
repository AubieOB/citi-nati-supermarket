import React, { useEffect, useRef, useState } from 'react';
import api from '../../utils/api.js';
import { useModal } from '../../hooks/useModal.js';
import Modal from '../common/Modal.jsx';

const emptyFormState = {
  currentSecurityKey: '',
  securityKey: '',
  confirmSecurityKey: '',
};

const validateSecurityForm = ({ hasExistingKey, formData, showError, label }) => {
  if (!formData.securityKey || !formData.confirmSecurityKey) {
    showError('Validation', `Enter and confirm ${label} security key are required`);
    return false;
  }

  if (formData.securityKey !== formData.confirmSecurityKey) {
    showError('Validation', `${label} security key confirmation does not match`);
    return false;
  }

  if (formData.securityKey.trim().length < 4) {
    showError('Validation', `${label} security key must be at least 4 characters`);
    return false;
  }

  if (hasExistingKey && !formData.currentSecurityKey) {
    showError('Validation', `Current ${label} security key is required to change key`);
    return false;
  }

  return true;
};

const AdminSecurity = () => {
  const [loading, setLoading] = useState(true);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);
  const [savingCashier, setSavingCashier] = useState(false);
  const [hasAdminSecurityKey, setHasAdminSecurityKey] = useState(false);
  const [driverAccounts, setDriverAccounts] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedDriverName, setSelectedDriverName] = useState('');
  const [hasDriverSecurityKey, setHasDriverSecurityKey] = useState(false);
  const [driverStatusLoading, setDriverStatusLoading] = useState(false);
  const [cashierAccounts, setCashierAccounts] = useState([]);
  const [selectedCashierId, setSelectedCashierId] = useState('');
  const [selectedCashierName, setSelectedCashierName] = useState('');
  const [hasCashierSecurityKey, setHasCashierSecurityKey] = useState(false);
  const [cashierStatusLoading, setCashierStatusLoading] = useState(false);
  const [adminFormData, setAdminFormData] = useState(emptyFormState);
  const [driverFormData, setDriverFormData] = useState(emptyFormState);
  const [cashierFormData, setCashierFormData] = useState(emptyFormState);
  const [activeTab, setActiveTab] = useState('admin');
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const { modal, showError, showSuccess, closeModal } = useModal();
  const filterBarRef = useRef(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [adminStatus, usersResponse, cashiersResponse] = await Promise.all([
          api.get('/admin/security-key/status'),
          api.get('/admin/users'),
          api.get('/admin/cashiers'),
        ]);

        const drivers = (usersResponse.data?.users || []).filter((user) => user.role === 'driver');
        const fetchedCashiers = cashiersResponse.data?.cashiers || [];

        setHasAdminSecurityKey(Boolean(adminStatus.data?.hasSecurityKey));
        setDriverAccounts(drivers);
        setCashierAccounts(fetchedCashiers);

        if (drivers.length > 0) {
          setSelectedDriverId(drivers[0].id);
          setSelectedDriverName(drivers[0].name || drivers[0].email || 'Selected driver');
        }

        if (fetchedCashiers.length > 0) {
          setSelectedCashierId(fetchedCashiers[0].id);
          setSelectedCashierName(fetchedCashiers[0].name || fetchedCashiers[0].email || 'Selected cashier');
        }
      } catch (err) {
        showError('Security setup failed', err.response?.data?.error || 'Unable to load security key status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [showError]);

  useEffect(() => {
    const fetchDriverStatus = async () => {
      if (!selectedDriverId) {
        setHasDriverSecurityKey(false);
        setSelectedDriverName('');
        return;
      }

      try {
        setDriverStatusLoading(true);
        const response = await api.get(`/admin/security-key/driver/${selectedDriverId}/status`);
        setHasDriverSecurityKey(Boolean(response.data?.hasSecurityKey));
        setSelectedDriverName(response.data?.driver?.name || driverAccounts.find((driver) => driver.id === selectedDriverId)?.name || 'Selected driver');
      } catch (err) {
        showError('Driver security setup failed', err.response?.data?.error || 'Unable to load selected driver security key status');
      } finally {
        setDriverStatusLoading(false);
      }
    };

    fetchDriverStatus();
  }, [selectedDriverId, driverAccounts, showError]);

  useEffect(() => {
    const fetchCashierStatus = async () => {
      if (!selectedCashierId) {
        setHasCashierSecurityKey(false);
        setSelectedCashierName('');
        return;
      }

      try {
        setCashierStatusLoading(true);
        const response = await api.get(`/admin/security-key/cashier/${selectedCashierId}/status`);
        setHasCashierSecurityKey(Boolean(response.data?.hasSecurityKey));
        setSelectedCashierName(
          response.data?.cashier?.name ||
          cashierAccounts.find((c) => c.id === selectedCashierId)?.name ||
          'Selected cashier'
        );
      } catch (err) {
        showError('Cashier security setup failed', err.response?.data?.error || 'Unable to load selected cashier security key status');
      } finally {
        setCashierStatusLoading(false);
      }
    };

    fetchCashierStatus();
  }, [selectedCashierId, cashierAccounts, showError]);

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

  const handleInputChange = (event, scope) => {
    const { name, value } = event.target;

    if (scope === 'admin') {
      setAdminFormData((prev) => ({ ...prev, [name]: value }));
      return;
    }

    if (scope === 'cashier') {
      setCashierFormData((prev) => ({ ...prev, [name]: value }));
      return;
    }

    setDriverFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAdminSubmit = async (event) => {
    event.preventDefault();

    const isValid = validateSecurityForm({
      hasExistingKey: hasAdminSecurityKey,
      formData: adminFormData,
      showError,
      label: 'admin',
    });

    if (!isValid) {
      return;
    }

    try {
      setSavingAdmin(true);
      const payload = {
        securityKey: adminFormData.securityKey,
        confirmSecurityKey: adminFormData.confirmSecurityKey,
      };

      if (hasAdminSecurityKey) {
        payload.currentSecurityKey = adminFormData.currentSecurityKey;
      }

      const response = await api.put('/admin/security-key', payload);
      showSuccess('Success', response.data?.message || 'Admin security key saved successfully');
      setHasAdminSecurityKey(true);
      setAdminFormData(emptyFormState);
    } catch (err) {
      showError('Failed', err.response?.data?.error || 'Unable to save admin security key');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleDriverSubmit = async (event) => {
    event.preventDefault();

    if (!selectedDriverId) {
      showError('Validation', 'Select a driver account first');
      return;
    }

    const isValid = validateSecurityForm({
      hasExistingKey: hasDriverSecurityKey,
      formData: driverFormData,
      showError,
      label: 'driver',
    });

    if (!isValid) {
      return;
    }

    try {
      setSavingDriver(true);
      const payload = {
        securityKey: driverFormData.securityKey,
        confirmSecurityKey: driverFormData.confirmSecurityKey,
      };

      if (hasDriverSecurityKey) {
        payload.currentSecurityKey = driverFormData.currentSecurityKey;
      }

      const response = await api.put(`/admin/security-key/driver/${selectedDriverId}`, payload);
      showSuccess('Success', response.data?.message || 'Driver security key saved successfully');
      setHasDriverSecurityKey(true);
      setDriverFormData(emptyFormState);
    } catch (err) {
      showError('Failed', err.response?.data?.error || 'Unable to save driver security key');
    } finally {
      setSavingDriver(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '1.5rem', color: '#666' }}>Loading security settings...</div>;
  }

  const handleCashierSubmit = async (event) => {
    event.preventDefault();

    if (!selectedCashierId) {
      showError('Validation', 'Select a cashier account first');
      return;
    }

    const isValid = validateSecurityForm({
      hasExistingKey: false, // Admin can always override cashier PIN without the current key
      formData: cashierFormData,
      showError,
      label: 'cashier',
    });

    if (!isValid) {
      return;
    }

    try {
      setSavingCashier(true);
      const payload = {
        securityKey: cashierFormData.securityKey,
        confirmSecurityKey: cashierFormData.confirmSecurityKey,
      };

      const response = await api.put(`/admin/security-key/cashier/${selectedCashierId}`, payload);
      showSuccess('Success', response.data?.message || 'Cashier security key saved successfully');
      setHasCashierSecurityKey(true);
      setCashierFormData(emptyFormState);
    } catch (err) {
      showError('Failed', err.response?.data?.error || 'Unable to save cashier security key');
    } finally {
      setSavingCashier(false);
    }
  };

  const securityTabs = [
    { id: 'admin', label: 'Admin Security', icon: 'fa-user-shield' },
    { id: 'driver', label: 'Driver Security', icon: 'fa-id-card' },
    { id: 'cashier', label: 'Cashier Security', icon: 'fa-user-tag' },
  ];

  const securityFilterSpacerHeight = filterBarHeight > 0 ? filterBarHeight + 8 : 0;

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
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <i className="fas fa-lock" style={{ fontSize: '1.2rem', color: '#5B4B8A' }}></i>
            <h1 style={{ margin: 0, color: '#333', fontSize: '1.15rem' }}>Security Management</h1>
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600' }}>
            Admin key: {hasAdminSecurityKey ? 'SET' : 'NOT SET'} | Driver key: {selectedDriverId ? (hasDriverSecurityKey ? 'SET' : 'NOT SET') : 'N/A'} | Cashier key: {selectedCashierId ? (hasCashierSecurityKey ? 'SET' : 'NOT SET') : 'N/A'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {securityTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`admin-tab-button${activeTab === tab.id ? ' active' : ''}`}
            >
              <i className={`fas ${tab.icon} admin-tab-icon`}></i>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: `${securityFilterSpacerHeight}px` }}></div>

      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '1rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
      {activeTab === 'admin' && (
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0, color: '#333' }}>Admin Security Key</h2>
        <p style={{ color: '#666', marginBottom: '1.25rem' }}>
          {hasAdminSecurityKey
            ? 'Change the admin security key. Current key is required before setting a new one.'
            : 'Set the first admin security key. Admins will be prompted before entering the dashboard.'}
        </p>

        <form onSubmit={handleAdminSubmit} style={{ display: 'grid', gap: '1rem' }}>
          {hasAdminSecurityKey && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Current Admin Security Key</label>
              <input
                type="password"
                name="currentSecurityKey"
                value={adminFormData.currentSecurityKey}
                onChange={(event) => handleInputChange(event, 'admin')}
                placeholder="Enter current key"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Enter Admin Security Key</label>
            <input
              type="password"
              name="securityKey"
              value={adminFormData.securityKey}
              onChange={(event) => handleInputChange(event, 'admin')}
              placeholder="Enter new key"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Confirm Admin Security Key</label>
            <input
              type="password"
              name="confirmSecurityKey"
              value={adminFormData.confirmSecurityKey}
              onChange={(event) => handleInputChange(event, 'admin')}
              placeholder="Confirm new key"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>

          <button
            type="submit"
            disabled={savingAdmin}
            style={{
              border: 'none',
              borderRadius: '6px',
              padding: '0.8rem 1rem',
              backgroundColor: savingAdmin ? '#8898aa' : '#2D8659',
              color: '#fff',
              fontWeight: 600,
              cursor: savingAdmin ? 'not-allowed' : 'pointer'
            }}
          >
            {savingAdmin ? 'Saving...' : hasAdminSecurityKey ? 'Change Admin Security Key' : 'Set Admin Security Key'}
          </button>
        </form>
      </div>
      )}

      {activeTab === 'driver' && (
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0, color: '#333' }}>Driver Security Key</h2>
        <p style={{ color: '#666', marginBottom: '1.25rem' }}>
          {selectedDriverId
            ? hasDriverSecurityKey
              ? `Change the security key for ${selectedDriverName}. This affects only that driver account.`
              : `Set the first security key for ${selectedDriverName}. Only that driver will be prompted for it.`
            : 'Choose a driver account to create or change that driver\'s unique security key.'}
        </p>

        <form onSubmit={handleDriverSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Driver Account</label>
            <select
              value={selectedDriverId}
              onChange={(event) => {
                const nextId = event.target.value;
                const selectedDriver = driverAccounts.find((driver) => driver.id === nextId);
                setSelectedDriverId(nextId);
                setSelectedDriverName(selectedDriver?.name || selectedDriver?.email || 'Selected driver');
                setDriverFormData(emptyFormState);
              }}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            >
              {driverAccounts.length === 0 ? (
                <option value="">No driver accounts found</option>
              ) : (
                driverAccounts.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} ({driver.email})
                  </option>
                ))
              )}
            </select>
          </div>

          {driverStatusLoading && <div style={{ color: '#666' }}>Loading selected driver security status...</div>}

          {hasDriverSecurityKey && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Current Driver Security Key</label>
              <input
                type="password"
                name="currentSecurityKey"
                value={driverFormData.currentSecurityKey}
                onChange={(event) => handleInputChange(event, 'driver')}
                placeholder="Enter current key"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Enter Driver Security Key</label>
            <input
              type="password"
              name="securityKey"
              value={driverFormData.securityKey}
              onChange={(event) => handleInputChange(event, 'driver')}
              placeholder="Enter new key"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Confirm Driver Security Key</label>
            <input
              type="password"
              name="confirmSecurityKey"
              value={driverFormData.confirmSecurityKey}
              onChange={(event) => handleInputChange(event, 'driver')}
              placeholder="Confirm new key"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>

          <button
            type="submit"
            disabled={savingDriver || !selectedDriverId || driverStatusLoading}
            style={{
              border: 'none',
              borderRadius: '6px',
              padding: '0.8rem 1rem',
              backgroundColor: savingDriver ? '#8898aa' : '#5B4B8A',
              color: '#fff',
              fontWeight: 600,
              cursor: savingDriver ? 'not-allowed' : 'pointer'
            }}
          >
            {savingDriver ? 'Saving...' : hasDriverSecurityKey ? 'Change Driver Security Key' : 'Set Driver Security Key'}
          </button>
        </form>
      </div>
      )}

      {activeTab === 'cashier' && (
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0, color: '#333' }}>Cashier Security PIN</h2>
        <p style={{ color: '#666', marginBottom: '1.25rem' }}>
          {selectedCashierId
            ? hasCashierSecurityKey
              ? `Set a new security PIN for ${selectedCashierName}. The cashier will be prompted to enter it before accessing the POS.`
              : `Set the first security PIN for ${selectedCashierName}. Only that cashier will be prompted for it.`
            : 'Choose a cashier account to create or update that cashier\'s security PIN.'}
        </p>
        <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '1.25rem' }}>
          <i className="fas fa-info-circle" style={{ marginRight: '0.4rem' }}></i>
          As admin you can always set or replace a cashier PIN without requiring the current PIN.
        </p>

        <form onSubmit={handleCashierSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Cashier Account</label>
            <select
              value={selectedCashierId}
              onChange={(event) => {
                const nextId = event.target.value;
                const selectedCashier = cashierAccounts.find((c) => c.id === nextId);
                setSelectedCashierId(nextId);
                setSelectedCashierName(selectedCashier?.name || selectedCashier?.email || 'Selected cashier');
                setCashierFormData(emptyFormState);
              }}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            >
              {cashierAccounts.length === 0 ? (
                <option value="">No cashier accounts found</option>
              ) : (
                cashierAccounts.map((cashier) => (
                  <option key={cashier.id} value={cashier.id}>
                    {cashier.name} ({cashier.email})
                  </option>
                ))
              )}
            </select>
          </div>

          {cashierStatusLoading && <div style={{ color: '#666' }}>Loading selected cashier security status...</div>}

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Enter Cashier Security PIN</label>
            <input
              type="password"
              name="securityKey"
              value={cashierFormData.securityKey}
              onChange={(event) => handleInputChange(event, 'cashier')}
              placeholder="Enter new PIN"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 600 }}>Confirm Cashier Security PIN</label>
            <input
              type="password"
              name="confirmSecurityKey"
              value={cashierFormData.confirmSecurityKey}
              onChange={(event) => handleInputChange(event, 'cashier')}
              placeholder="Confirm new PIN"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>

          <button
            type="submit"
            disabled={savingCashier || !selectedCashierId || cashierStatusLoading}
            style={{
              border: 'none',
              borderRadius: '6px',
              padding: '0.8rem 1rem',
              backgroundColor: savingCashier ? '#8898aa' : '#5B4B8A',
              color: '#fff',
              fontWeight: 600,
              cursor: savingCashier ? 'not-allowed' : 'pointer',
            }}
          >
            {savingCashier ? 'Saving...' : hasCashierSecurityKey ? 'Change Cashier Security PIN' : 'Set Cashier Security PIN'}
          </button>
        </form>
      </div>
      )}

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

export default AdminSecurity;
