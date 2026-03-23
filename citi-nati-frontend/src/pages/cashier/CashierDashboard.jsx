import React, { Suspense } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import AdminEmergencySales from '../../components/admin/AdminEmergencySales.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import '../../styles/global.css';
import '../../styles/admin-dashboard.css';

/**
 * 🏪 CASHIER DASHBOARD
 *
 * Minimal full-screen POS panel for cashier role.
 * Re-uses AdminEmergencySales with the cashier API base path.
 */
const CashierDashboard = () => {
  const { user, logout } = useAuth();
  const { modal, showConfirm, closeModal } = useModal();

  const handleLogoutClick = () => {
    showConfirm(
      'Confirm Logout',
      'Are you sure you want to logout from the cashier POS?',
      () => {
        logout();
      }
    );
  };

  return (
    <div style={{ height: '100vh', backgroundColor: '#f5f5f5', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        backgroundColor: '#5B4B8A',
        color: '#fff',
        padding: '0.6rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <i className="fas fa-cash-register" style={{ fontSize: '1.1rem' }}></i>
          <span style={{ fontWeight: '700', fontSize: '1rem' }}>Citi-Nati POS — Cashier</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', opacity: 0.85 }}>
            <i className="fas fa-user-circle" style={{ marginRight: '0.4rem' }}></i>
            {user?.name || user?.email || 'Cashier'}
          </span>
          <button
            onClick={handleLogoutClick}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '6px',
              color: '#fff',
              padding: '0.35rem 0.85rem',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <i className="fas fa-sign-out-alt"></i> Logout
          </button>
        </div>
      </div>

      {/* POS Panel */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '0.75rem' }}>
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading POS...</div>}>
          <AdminEmergencySales apiBase="cashier/emergency-sales" />
        </Suspense>
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

export default CashierDashboard;
