import React, { useState, useEffect, useRef } from 'react';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/**
 * 🚗 ADMIN DRIVERS MANAGEMENT
 * 
 * View drivers, create drivers with user accounts, update phone numbers
 */

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPhoneId, setEditingPhoneId] = useState(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const { modal, closeModal, showError, showConfirm } = useModal();
  const filterBarRef = useRef(null);

  useEffect(() => {
    fetchDrivers();
  }, []);

  // Listen for driver updates from other components (e.g., AdminUsers)
  useEffect(() => {
    const handleDriversUpdated = () => {
      console.log('[AdminDrivers] Drivers updated event received, refetching...');
      fetchDrivers();
    };

    window.addEventListener('driversUpdated', handleDriversUpdated);
    return () => window.removeEventListener('driversUpdated', handleDriversUpdated);
  }, []);

  // 30-second polling for real-time driver list updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDrivers();
    }, 30000);
    return () => clearInterval(interval);
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

  // Re-measure bar height after each render to account for content wrapping
  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/drivers');
      setDrivers(response.data.drivers || []);
    } catch (err) {
      console.error('Error fetching drivers:', err);
      setError(err.response?.data?.error || 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    if (formError) setFormError('');
  };

  const validateForm = () => {
    if (!formData.name?.trim()) return 'Driver name is required';
    if (!formData.email?.trim()) return 'Email is required';
    if (!formData.password?.trim()) return 'Password is required';
    if (formData.password.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError('');

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        ...(formData.phone && { phone: formData.phone.trim() }),
      };

      // Use the new endpoint that creates both user and driver
      await api.post('/drivers/with-account', payload);
      await fetchDrivers();
      resetForm();
    } catch (err) {
      console.error('Error creating driver:', err);
      setFormError(err.response?.data?.error || 'Failed to create driver');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditPhoneClick = (driverId, currentPhone) => {
    setEditingPhoneId(driverId);
    setEditingPhoneValue(currentPhone || '');
  };

  const handleSavePhone = async (driverId) => {
    try {
      await api.put(`/drivers/${driverId}`, { phone: editingPhoneValue || null });
      await fetchDrivers();
      setEditingPhoneId(null);
    } catch (err) {
      console.error('Error updating phone number:', err);
      showError('Error', err.response?.data?.error || 'Failed to update phone number');
    }
  };

  const handleDelete = async (id) => {
    showConfirm(
      'Delete Driver?',
      'Are you sure you want to delete this driver?',
      async () => {
        try {
          await api.delete(`/drivers/${id}`);
          await fetchDrivers();
          // Notify AdminUsers that a driver was deleted (user role may have changed to 'user')
          console.log('[AdminDrivers] Driver deleted, dispatching usersUpdated event');
          window.dispatchEvent(new CustomEvent('usersUpdated'));
        } catch (err) {
          console.error('Error deleting driver:', err);
          showError('Error', err.response?.data?.error || 'Failed to delete driver');
        }
      }
    );
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', password: '' });
    setShowForm(false);
    setFormError('');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Loading drivers...</p>
      </div>
    );
  }

  const driversFilterSpacerHeight = filterBarHeight > 0 ? filterBarHeight + 8 : 0;

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
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <i className="fas fa-car" style={{ fontSize: '1.2rem', color: '#5B4B8A' }}></i>
            <h1 style={{ margin: 0, color: '#333', fontSize: '1.15rem' }}>Drivers Management</h1>
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600' }}>
            Total drivers: {drivers.length}
          </div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <Button
            variant="primary"
            onClick={() => setShowForm(!showForm)}
            style={{ fontSize: '0.9rem', padding: '0.6rem 1rem' }}
          >
            {showForm ? '✕ Cancel' : '+ Create New Driver'}
          </Button>
        </div>
      </div>

      <div style={{ height: `${driversFilterSpacerHeight}px` }}></div>

      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '1rem',
      }}>
        {/* Create Form */}
        {showForm && (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            borderLeft: '4px solid #5B4B8A',
          }}>
            <h3 style={{ marginBottom: '1rem', marginTop: 0, color: '#5B4B8A' }}>Create New Driver Account</h3>

          {formError && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '1rem',
              borderRadius: '4px',
              marginBottom: '1rem',
            }}>
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Driver Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                placeholder="Your full name"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Email * (Login username)
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  placeholder="driver@email.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Password *
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    placeholder="Minimum 6 characters"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      paddingRight: '2.5rem',
                      border: 'none',
                      borderRadius: '4px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#666',
                      fontSize: '1rem',
                      padding: '0.5rem',
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Phone Number (Optional - can be added later)
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleFormChange}
                placeholder="+265991234567"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                style={{ flex: 1 }}
              >
                {isSubmitting ? 'Creating...' : 'Create Driver Account'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '2rem',
          }}>
            {error}
          </div>
        )}

        {/* Drivers Table */}
        {drivers.length === 0 ? (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#666',
          }}>
            No drivers yet. Create your first driver!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: '#fff',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}>
              <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Name</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Phone</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Email</th>
                  <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '1rem' }}>{driver.name}</td>
                    <td style={{ padding: '1rem' }}>
                      {editingPhoneId === driver.id ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="tel"
                            value={editingPhoneValue}
                            onChange={(e) => setEditingPhoneValue(e.target.value)}
                            placeholder="Phone number"
                            style={{
                              flex: 1,
                              padding: '0.5rem',
                              border: 'none',
                              borderRadius: '4px',
                            }}
                          />
                          <button
                            onClick={() => handleSavePhone(driver.id)}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#28a745',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                            }}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{
                            flex: 1,
                            color: driver.phone ? '#000' : '#999',
                          }}>
                            {driver.phone || '(No phone number)'}
                          </span>
                          <button
                            onClick={() => handleEditPhoneClick(driver.id, driver.phone)}
                            style={{
                              padding: '0.25rem 0.75rem',
                              backgroundColor: '#007bff',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>{driver.email || 'N/A'}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDelete(driver.id)}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#dc3545',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        showCancelButton={modal.showCancelButton}
      />
    </div>
  );
};

export default AdminDrivers;
