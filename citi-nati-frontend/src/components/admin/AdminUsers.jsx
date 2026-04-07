import React, { useState, useEffect, useRef } from 'react';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { generateAdminUsersTablePDF } from '../../utils/pdfReports.js';
import '../../css/admin-responsive-filters.css';

/**
 * 👥 ADMIN USERS MANAGEMENT
 * 
 * View all users, manage roles (user/admin/driver/cashier), delete users
 * Strictly according to User Contract
 */

const AdminUsers = () => {
  const { user: loggedInUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const { modal, closeModal, showConfirm, showError, showSuccess } = useModal();
  const filterBarRef = useRef(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  // Listen for user updates from other components (e.g., AdminDrivers)
  useEffect(() => {
    const handleUsersUpdated = () => {
      console.log('[AdminUsers] Users updated event received, refetching...');
      fetchUsers();
    };

    window.addEventListener('usersUpdated', handleUsersUpdated);
    return () => window.removeEventListener('usersUpdated', handleUsersUpdated);
  }, []);

  // 30-second polling for real-time user list updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsers();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUsers = async () => {
    try {
      setError(null);
      const response = await api.get('/admin/users');
      setUsers(response.data.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId, newRole) => {
    try {
      setUpdatingUserId(userId);
      
      // Find the user to get their current role before update
      const userToUpdate = users.find(u => u.id === userId);
      const oldRole = userToUpdate?.role;
      
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      await fetchUsers();
      
      console.log('[AdminUsers] Role updated:', { userId, oldRole, newRole });
      
      // Dispatch event if role changed to/from driver
      if (newRole === 'driver' || oldRole === 'driver') {
        console.log('[AdminUsers] Dispatching driversUpdated event');
        window.dispatchEvent(new CustomEvent('driversUpdated'));
      }
    } catch (err) {
      showError('Error', err.response?.data?.error || 'Failed to update user role');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const deleteUserConfirm = async (userId) => {
    showConfirm(
      'Delete User?',
      'Are you sure you want to delete this user? This action cannot be undone.',
      async () => {
        try {
          // Get user data to check if they're a driver
          const deletedUser = users.find(u => u.id === userId);
          
          await api.delete(`/admin/users/${userId}`);
          await fetchUsers();
          
          // If deleted user was a driver, notify AdminDrivers to refresh
          if (deletedUser && deletedUser.role === 'driver') {
            console.log('[AdminUsers] Deleted driver user, dispatching driversUpdated event');
            window.dispatchEvent(new CustomEvent('driversUpdated'));
          }
        } catch (err) {
          showError('Error', err.response?.data?.error || 'Failed to delete user');
        }
      }
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const canDeleteUser = (userId) => {
    // Prevent deleting current admin user
    return userId !== loggedInUser?.id;
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const handleDownloadUsersPdf = async () => {
    if (filteredUsers.length === 0) {
      showError('No users to export', 'There are no users matching the current filters.');
      return;
    }

    try {
      setIsExportingPdf(true);
      await generateAdminUsersTablePDF(filteredUsers, {
        roleFilter,
        verificationFilter,
      });
      showSuccess('Success', `PDF downloaded with ${filteredUsers.length} user(s).`);
    } catch (err) {
      console.error('[ADMIN USERS] PDF export failed:', err);
      showError('PDF export failed', 'Unable to generate users PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  useEffect(() => {
    const handleLeftCtrlClear = (event) => {
      if (event.repeat) return;

      const isLeftCtrl = event.code === 'ControlLeft' || (event.key === 'Control' && event.location === 1);
      if (!isLeftCtrl) return;
      if (!searchTerm) return;

      event.preventDefault();
      clearSearch();
    };

    window.addEventListener('keydown', handleLeftCtrlClear);

    return () => {
      window.removeEventListener('keydown', handleLeftCtrlClear);
    };
  }, [searchTerm]);

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

  const filteredUsers = users.filter((u) => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query
      || String(u.name || '').toLowerCase().includes(query)
      || String(u.email || '').toLowerCase().includes(query)
      || String(u.role || '').toLowerCase().includes(query);

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;

    const matchesVerification = verificationFilter === 'all'
      || (verificationFilter === 'verified' && u.emailVerified)
      || (verificationFilter === 'unverified' && !u.emailVerified);

    return matchesSearch && matchesRole && matchesVerification;
  });

  // Guard against occasional oversized measurements from the fixed filter bar.
  const usersFilterSpacerHeight = Math.max(Math.min(filterBarHeight, 72) - 8, 0);

  if (error) {
    return (
      <div style={{
        backgroundColor: '#f8d7da',
        color: '#721c24',
        padding: '1rem',
        borderRadius: '4px',
      }}>
        {error}
      </div>
    );
  }

  // Show empty state if no users loaded
  if (!loading && users.length === 0) {
    return (
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '2rem',
        borderRadius: '8px',
        textAlign: 'center',
        color: '#666',
      }}>
        No users found
      </div>
    );
  }

  return (
    <div>
      {/* Loading Indicator */}
      {loading && (
        <div style={{
          backgroundColor: '#e7f3ff',
          border: '1px solid #b3d9ff',
          color: '#004085',
          padding: '0.75rem',
          borderRadius: '4px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <i className="fas fa-spinner fa-spin"></i>
          <span>Loading users...</span>
        </div>
      )}

      <div
        ref={filterBarRef}
        style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        marginBottom: 0,
        flexWrap: 'wrap',
        position: 'fixed',
        top: `${filterBarLayout.top}px`,
        left: `${filterBarLayout.left}px`,
        width: `${filterBarLayout.width}px`,
        zIndex: 80,
        backgroundColor: '#fff',
        border: '1px solid #eee',
        borderRadius: '8px',
        padding: '0.75rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        boxSizing: 'border-box',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Search users by name, email or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="admin-filter-input"
            style={{
              width: '100%',
              padding: '0.55rem 2.25rem 0.55rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #ddd',
              backgroundColor: '#fff',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={clearSearch}
              title="Clear search (Left Ctrl)"
              aria-label="Clear search"
              style={{
                position: 'absolute',
                right: '0.45rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: '#e9ecef',
                color: '#555',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                padding: 0,
              }}
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="admin-filter-select"
          style={{
            padding: '0.55rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid #ddd',
            fontSize: '0.85rem',
            minWidth: '160px',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          <option value="all">All Roles</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
          <option value="driver">Drivers</option>
          <option value="cashier">Cashiers</option>
        </select>

        <select
          value={verificationFilter}
          onChange={(e) => setVerificationFilter(e.target.value)}
          className="admin-filter-select"
          style={{
            padding: '0.55rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid #ddd',
            fontSize: '0.85rem',
            minWidth: '160px',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          <option value="all">All Verification</option>
          <option value="verified">Verified Email</option>
          <option value="unverified">Unverified Email</option>
        </select>

        {(searchTerm || roleFilter !== 'all' || verificationFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setRoleFilter('all');
              setVerificationFilter('all');
            }}
            style={{
              padding: '0.55rem 0.9rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#dc3545',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
            }}
          >
            Clear Filters
          </button>
        )}

        <button
          type="button"
          onClick={handleDownloadUsersPdf}
          disabled={isExportingPdf}
          style={{
            padding: '0.55rem 0.9rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: isExportingPdf ? '#6c757d' : '#5B4B8A',
            color: '#fff',
            cursor: isExportingPdf ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            fontSize: '0.85rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap',
          }}
          title="Download filtered users PDF"
        >
          <i className={`fas ${isExportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
          {isExportingPdf ? 'Generating PDF...' : 'Download PDF'}
        </button>

        <span style={{ color: '#666', fontSize: '0.9rem', marginLeft: 'auto' }}>
          {filteredUsers.length} / {users.length} users
        </span>
      </div>

      <div style={{ height: `${usersFilterSpacerHeight}px` }}></div>

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
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Role</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Joined</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '1rem' }}>
                  {u.name}
                  {u.id === loggedInUser?.id && (
                    <span style={{
                      marginLeft: '0.5rem',
                      backgroundColor: '#5B4B8A',
                      color: '#fff',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}>
                      You
                    </span>
                  )}
                </td>
                <td style={{ padding: '1rem' }}>{u.email}</td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <select
                    value={u.role}
                    onChange={(e) => updateUserRole(u.id, e.target.value)}
                    disabled={updatingUserId === u.id}
                    style={{
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: u.role === 'admin' ? '#e8f4f8' : u.role === 'driver' ? '#f0f8ff' : u.role === 'cashier' ? '#fff7e8' : '#fff',
                      fontWeight: u.role === 'admin' || u.role === 'driver' || u.role === 'cashier' ? '600' : '400',
                    }}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="driver">Driver</option>
                    <option value="cashier">Cashier</option>
                  </select>
                </td>
                <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
                  {formatDate(u.createdAt)}
                </td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <button
                    onClick={() => deleteUserConfirm(u.id)}
                    disabled={!canDeleteUser(u.id)}
                    style={{
                      padding: '0.35rem 0.6rem',
                      backgroundColor: canDeleteUser(u.id) ? '#dc3545' : '#ccc',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: canDeleteUser(u.id) ? 'pointer' : 'not-allowed',
                      fontSize: '0.82rem',
                      whiteSpace: 'nowrap',
                    }}
                    title={!canDeleteUser(u.id) ? 'Cannot delete your own account' : ''}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && users.length > 0 && filteredUsers.length === 0 && (
        <div style={{
          marginTop: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          padding: '1rem',
          textAlign: 'center',
          color: '#666',
        }}>
          No users match your current search/filter.
        </div>
      )}
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

export default AdminUsers;
