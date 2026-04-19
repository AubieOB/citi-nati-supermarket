import React, { Suspense, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import AdminEmergencySales from '../../components/admin/AdminEmergencySales.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { normalizeOperationalScopeCode, resolveOperationalScope } from '../../utils/operationalScope.js';
import '../../styles/global.css';
import '../../styles/admin-dashboard.css';

/**
 * 🏪 CASHIER DASHBOARD
 *
 * Minimal full-screen POS panel for cashier role.
 * Re-uses AdminEmergencySales with the cashier API base path.
 * 
 * Flow:
 * 1. On first load, show location selection modal (Zomba or Blantyre)
 * 2. After selection, show confirmation warning with location details
 * 3. Once confirmed, lock to that location for the session
 */
const CashierDashboard = () => {
  const { user, logout } = useAuth();
  const { modal, showConfirm, closeModal } = useModal();
  
  const [selectedScopeCode, setSelectedScopeCode] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(true);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [pendingScopeCode, setPendingScopeCode] = useState(null);
  const selectedScope = selectedScopeCode ? resolveOperationalScope(selectedScopeCode) : null;
  const pendingScope = pendingScopeCode ? resolveOperationalScope(pendingScopeCode) : null;

  // Load location selection from session storage (persists during session)
  useEffect(() => {
    const storedLocation = sessionStorage.getItem('cashier-selected-location');
    if (storedLocation) {
      setSelectedScopeCode(normalizeOperationalScopeCode(storedLocation));
      setShowLocationModal(false);
    }
  }, []);

  const handleLocationSelect = (scopeCode) => {
    setPendingScopeCode(normalizeOperationalScopeCode(scopeCode));
    setShowLocationModal(false);
    setShowWarningModal(true);
  };

  const handleConfirmLocation = () => {
    setSelectedScopeCode(pendingScopeCode);
    sessionStorage.setItem('cashier-selected-location', pendingScopeCode);
    setShowWarningModal(false);
  };

  const handleCancelLocation = () => {
    setPendingScopeCode(null);
    setShowWarningModal(false);
    setShowLocationModal(true);
  };

  const handleLogoutClick = () => {
    showConfirm(
      'Confirm Logout',
      'Are you sure you want to logout from the cashier POS?',
      () => {
        sessionStorage.removeItem('cashier-selected-location');
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
          {selectedScope && (
            <span style={{ 
              marginLeft: '1rem', 
              fontSize: '0.85rem', 
              backgroundColor: 'rgba(255,255,255,0.2)', 
              padding: '0.25rem 0.6rem', 
              borderRadius: '4px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}>
              <i className="fas fa-location-dot" style={{ fontSize: '0.9rem' }}></i>
              {selectedScope.label}
            </span>
          )}
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

      {/* POS Panel - only show if location is selected */}
      {selectedScope ? (
        <div style={{ flex: 1, overflow: 'hidden', padding: '0.75rem' }}>
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading POS...</div>}>
            <AdminEmergencySales apiBase="cashier/emergency-sales" selectedLocationCode={selectedScope.locationCode} />
          </Suspense>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#999' }}>Please select a location to continue...</div>
        </div>
      )}

      {/* Location Selection Modal */}
      {showLocationModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '450px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }}>
            <h2 style={{ 
              marginTop: 0, 
              marginBottom: '1.5rem', 
              color: '#1a1a1a',
              fontSize: '1.5rem',
              textAlign: 'center',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.7rem'
            }}>
              <i className="fas fa-location-dot" style={{ fontSize: '1.3rem' }}></i>
              Select Your Location
            </h2>
            <p style={{ 
              color: '#666', 
              fontSize: '0.95rem', 
              marginBottom: '2rem',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              Please select which location you are working at today. You will only be able to sell products for the selected location.
            </p>
            
            <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button
                onClick={() => handleLocationSelect('ZOMBA_SH')}
                style={{
                  padding: '1rem',
                  backgroundColor: '#d4a574',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem'
                }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#c59563'; e.target.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#d4a574'; e.target.style.transform = 'translateY(0)'; }}
              >
                <i className="fas fa-location-dot" style={{ fontSize: '1.1rem' }}></i>
                Zomba SH
              </button>
              <button
                onClick={() => handleLocationSelect('ZOMBA_BAR')}
                style={{
                  padding: '1rem',
                  backgroundColor: '#c78f52',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem'
                }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#b87e40'; e.target.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#c78f52'; e.target.style.transform = 'translateY(0)'; }}
              >
                <i className="fas fa-location-dot" style={{ fontSize: '1.1rem' }}></i>
                Zomba BAR
              </button>
              <button
                onClick={() => handleLocationSelect('ZOMBA_RES')}
                style={{
                  padding: '1rem',
                  backgroundColor: '#b06f2e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem'
                }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#9c5f24'; e.target.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#b06f2e'; e.target.style.transform = 'translateY(0)'; }}
              >
                <i className="fas fa-location-dot" style={{ fontSize: '1.1rem' }}></i>
                Zomba RES
              </button>
              <button
                onClick={() => handleLocationSelect('BLANTYRE_SH')}
                style={{
                  padding: '1rem',
                  backgroundColor: '#4a90e2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem'
                }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#3a7bc8'; e.target.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#4a90e2'; e.target.style.transform = 'translateY(0)'; }}
              >
                <i className="fas fa-location-dot" style={{ fontSize: '1.1rem' }}></i>
                Blantyre SH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Confirmation Warning Modal */}
      {showWarningModal && pendingScope && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            borderLeft: '5px solid #f39c12',
          }}>
            <h2 style={{ 
              marginTop: 0, 
              marginBottom: '1rem', 
              color: '#f39c12',
              fontSize: '1.3rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <i className="fas fa-triangle-exclamation"></i>
              Location Confirmation
            </h2>
            
            <div style={{
              backgroundColor: '#fef5e7',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              border: '1px solid #f9e79f',
            }}>
              <p style={{ 
                color: '#333', 
                fontSize: '0.95rem', 
                margin: '0.5rem 0',
                lineHeight: '1.6'
              }}>
                <strong><i className="fas fa-circle-exclamation" style={{ marginRight: '0.4rem', color: '#f39c12' }}></i>Please verify your location:</strong>
              </p>
              <p style={{ 
                color: '#333', 
                fontSize: '1.1rem', 
                margin: '1rem 0 0.5rem 0',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <i className="fas fa-location-dot" style={{ fontSize: '1.2rem' }}></i>
                {pendingScope.label}
              </p>
              <p style={{ 
                color: '#666', 
                fontSize: '0.85rem', 
                margin: '0.5rem 0',
                fontStyle: 'italic'
              }}>
                You will only be able to sell products for this location. All transactions will be recorded under this location.
              </p>
            </div>

            <p style={{ 
              color: '#666', 
              fontSize: '0.95rem', 
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              Is this the correct location? Make sure you are in the right branch before proceeding.
            </p>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={handleCancelLocation}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#e8e8e8',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem'
                }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#d0d0d0'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#e8e8e8'; }}
              >
                <i className="fas fa-rotate-left" style={{ fontSize: '0.9rem' }}></i>
                Change Location
              </button>
              <button
                onClick={handleConfirmLocation}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#27ae60',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem'
                }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#229954'; e.target.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#27ae60'; e.target.style.transform = 'translateY(0)'; }}
              >
                <i className="fas fa-circle-check" style={{ fontSize: '0.9rem' }}></i>
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}

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
