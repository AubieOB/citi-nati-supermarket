import React, { useState, useEffect, useRef } from 'react';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/**
 * 🏪 ADMIN CASHIERS MANAGEMENT
 *
 * Create, view, edit, and delete cashier accounts.
 * Cashiers can log in and access the POS (Emergency Sales) panel.
 */
const AdminCashiers = () => {
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCashier, setEditingCashier] = useState(null); // { id, name, email }
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const { modal, closeModal, showError, showConfirm } = useModal();
  const filterBarRef = useRef(null);

  useEffect(() => {
    fetchCashiers();
  }, []);

  // 30-second polling for real-time cashier list updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCashiers();
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

  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  const fetchCashiers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/admin/cashiers');
      setCashiers(response.data.cashiers || []);
    } catch (err) {
      console.error('Error fetching cashiers:', err);
      setError(err.response?.data?.error || 'Failed to load cashiers');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError('');
  };

  const validateForm = () => {
    if (!formData.name?.trim()) return 'Cashier name is required';
    if (!formData.email?.trim()) return 'Email is required';
    if (!editingCashier) {
      if (!formData.password?.trim()) return 'Password is required';
      if (formData.password.length < 6) return 'Password must be at least 6 characters';
    } else if (formData.password && formData.password.length < 6) {
      return 'New password must be at least 6 characters';
    }
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

      if (editingCashier) {
        const payload = {
          name: formData.name.trim(),
          email: formData.email.trim(),
        };
        if (formData.password) payload.password = formData.password;

        await api.put(`/admin/cashiers/${editingCashier.id}`, payload);
      } else {
        await api.post('/admin/cashiers', {
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
        });
      }

      await fetchCashiers();
      resetForm();
    } catch (err) {
      console.error('Error saving cashier:', err);
      setFormError(err.response?.data?.error || 'Failed to save cashier account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (cashier) => {
    setEditingCashier(cashier);
    setFormData({ name: cashier.name, email: cashier.email, password: '' });
    setShowForm(true);
    setFormError('');
  };

  const handleDelete = (id, name) => {
    showConfirm(
      'Delete Cashier?',
      `Are you sure you want to delete cashier account "${name}"? This cannot be undone.`,
      async () => {
        try {
          await api.delete(`/admin/cashiers/${id}`);
          await fetchCashiers();
        } catch (err) {
          console.error('Error deleting cashier:', err);
          showError('Error', err.response?.data?.error || 'Failed to delete cashier');
        }
      }
    );
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', password: '' });
    setShowForm(false);
    setEditingCashier(null);
    setFormError('');
    setShowPassword(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}><p>Loading cashiers...</p></div>;
  }

  const spacerHeight = filterBarHeight > 0 ? filterBarHeight + 8 : 0;

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
            <i className="fas fa-user-tag" style={{ fontSize: '1.2rem', color: '#5B4B8A' }}></i>
            <h1 style={{ margin: 0, color: '#333', fontSize: '1.15rem' }}>Emergency Cashiers Management</h1>
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem', fontWeight: '600' }}>
            Total emergency cashiers: {cashiers.length}
          </div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <Button
            variant="primary"
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            style={{ fontSize: '0.85rem', padding: '0.55rem 0.9rem', whiteSpace: 'nowrap' }}
          >
            {showForm && !editingCashier ? '✕ Cancel' : '+ Create New Emergency Cashier'}
          </Button>
        </div>
      </div>

      <div style={{ height: `${spacerHeight}px` }}></div>

      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '1rem',
      }}>
        {/* Create / Edit Form */}
        {showForm && (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            borderLeft: '4px solid #5B4B8A',
          }}>
            <h3 style={{ marginBottom: '1rem', marginTop: 0, color: '#5B4B8A' }}>
              {editingCashier ? `Edit Cashier: ${editingCashier.name}` : 'Create New Cashier Account'}
            </h3>

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
                  Full Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="Cashier full name"
                  style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: '4px' }}
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
                    placeholder="cashier@email.com"
                    style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                    {editingCashier ? 'New Password (leave blank to keep)' : 'Password *'}
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleFormChange}
                      placeholder={editingCashier ? 'Leave blank to keep current' : 'Minimum 6 characters'}
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

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <Button type="submit" variant="primary" disabled={isSubmitting} style={{ flex: 1 }}>
                  {isSubmitting ? 'Saving...' : editingCashier ? 'Save Changes' : 'Create Cashier Account'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Error */}
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

        {/* Cashiers Table */}
        {cashiers.length === 0 ? (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#666',
          }}>
            No cashier accounts yet. Create your first cashier!
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
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Email</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Created</th>
                  <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cashiers.map((cashier) => (
                  <tr key={cashier.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '1rem', fontWeight: '500' }}>
                      <i className="fas fa-user-tag" style={{ marginRight: '0.5rem', color: '#5B4B8A', fontSize: '0.9rem' }}></i>
                      {cashier.name}
                    </td>
                    <td style={{ padding: '1rem', color: '#555' }}>{cashier.email}</td>
                    <td style={{ padding: '1rem', color: '#888', fontSize: '0.85rem' }}>
                      {cashier.createdAt ? new Date(cashier.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleEditClick(cashier)}
                          style={{
                            padding: '0.35rem 0.6rem',
                            backgroundColor: '#007bff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <i className="fas fa-edit" style={{ marginRight: '0.3rem' }}></i>
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(cashier.id, cashier.name)}
                          style={{
                            padding: '0.35rem 0.6rem',
                            backgroundColor: '#dc3545',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <i className="fas fa-trash" style={{ marginRight: '0.3rem' }}></i>
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

      {modal && (
        <Modal
          isOpen={modal.isOpen}
          title={modal.title}
          message={modal.message}
          type={modal.type}
          onConfirm={modal.onConfirm}
          onClose={closeModal}
        />
      )}
    </div>
  );
};

export default AdminCashiers;
