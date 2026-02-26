import React, { useState, useEffect } from 'react';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/**
 * 👥 ADMIN USERS MANAGEMENT
 * 
 * View all users, manage roles (user/admin), delete users
 * Strictly according to User Contract
 */

const AdminUsers = () => {
  const { user: loggedInUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const { modal, closeModal, showConfirm, showError } = useModal();

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

  const fetchUsers = async () => {
    try {
      setLoading(true);
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

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading users...</div>;
  }

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

  if (users.length === 0) {
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
            {users.map((u) => (
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
                      backgroundColor: u.role === 'admin' ? '#e8f4f8' : u.role === 'driver' ? '#f0f8ff' : '#fff',
                      fontWeight: u.role === 'admin' || u.role === 'driver' ? '600' : '400',
                    }}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="driver">Driver</option>
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
                      padding: '0.5rem 1rem',
                      backgroundColor: canDeleteUser(u.id) ? '#dc3545' : '#ccc',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: canDeleteUser(u.id) ? 'pointer' : 'not-allowed',
                      fontSize: '0.9rem',
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
