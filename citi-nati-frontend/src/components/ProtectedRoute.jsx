import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import { PERMISSION_KEYS, hasPermission } from '../utils/permissions.js';

/**
 * 🔐 Protected Route Component
 * 
 * Protects routes that require authentication, roles, and optional permissions.
 * 
 * Usage:
 *   <ProtectedRoute>
 *     <Dashboard />
 *   </ProtectedRoute>
 *   
 *   <ProtectedRoute allowedRoles={["admin", "driver"]}>
 *     <ManagementPanel />
 *   </ProtectedRoute>
 */

const ProtectedRoute = ({ children, allowedRoles, requiredPermission }) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  const [checkingSecurityKey, setCheckingSecurityKey] = useState(false);
  const [securityStatusLoaded, setSecurityStatusLoaded] = useState(false);
  const [hasSecurityKey, setHasSecurityKey] = useState(false);
  const [securityVerified, setSecurityVerified] = useState(false);
  const [securityKeyInput, setSecurityKeyInput] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [verifyingKey, setVerifyingKey] = useState(false);

  const requiresAdminSecurityGate = useMemo(() => {
    const requiresAdminRole = Boolean(allowedRoles?.includes('admin'));
    const requiresAdminPermissionGate = requiredPermission === PERMISSION_KEYS.ADMIN_DASHBOARD_ACCESS;
    return Boolean((requiresAdminRole || requiresAdminPermissionGate) && user?.role === 'admin');
  }, [allowedRoles, requiredPermission, user?.role]);

  const requiresDriverSecurityGate = useMemo(() => {
    return Boolean(allowedRoles?.includes('driver') && user?.role === 'driver');
  }, [allowedRoles, user?.role]);

  const requiresCashierSecurityGate = useMemo(() => {
    return Boolean(allowedRoles?.includes('cashier') && user?.role === 'cashier');
  }, [allowedRoles, user?.role]);

  const securityGateConfig = useMemo(() => {
    if (requiresAdminSecurityGate) {
      return {
        statusEndpoint: '/admin/security-key/status',
        verifyEndpoint: '/admin/security-key/verify',
        roleLabel: 'admin',
      };
    }

    if (requiresDriverSecurityGate) {
      return {
        statusEndpoint: '/drivers/security-key/status',
        verifyEndpoint: '/drivers/security-key/verify',
        roleLabel: 'driver',
      };
    }

    if (requiresCashierSecurityGate) {
      return {
        statusEndpoint: '/cashier/security-key/status',
        verifyEndpoint: '/cashier/security-key/verify',
        roleLabel: 'cashier',
      };
    }

    return null;
  }, [requiresAdminSecurityGate, requiresDriverSecurityGate, requiresCashierSecurityGate]);

  useEffect(() => {
    const loadSecurityStatus = async () => {
      if (!isAuthenticated || !securityGateConfig) {
        setSecurityVerified(false);
        setHasSecurityKey(false);
        setSecurityError('');
        setSecurityStatusLoaded(true);
        return;
      }

      try {
        setCheckingSecurityKey(true);
        setSecurityStatusLoaded(false);
        setSecurityError('');
        const response = await api.get(securityGateConfig.statusEndpoint);
        const keyExists = Boolean(response.data?.hasSecurityKey);
        setHasSecurityKey(keyExists);

        // First login path: allow role in when key has not been set yet
        setSecurityVerified(!keyExists);
      } catch (err) {
        setSecurityError(err.response?.data?.error || `Failed to check ${securityGateConfig.roleLabel} security key status`);
      } finally {
        setCheckingSecurityKey(false);
        setSecurityStatusLoaded(true);
      }
    };

    loadSecurityStatus();
  }, [isAuthenticated, securityGateConfig]);

  const handleVerifySecurityKey = async () => {
    try {
      setVerifyingKey(true);
      setSecurityError('');

      const keyValue = securityKeyInput.trim();
      if (!keyValue) {
        setSecurityError('Please enter your security key');
        return;
      }

      await api.post(securityGateConfig.verifyEndpoint, { securityKey: keyValue });
      setSecurityVerified(true);
      setSecurityKeyInput('');
    } catch (err) {
      setSecurityError(err.response?.data?.error || 'Invalid security key');
    } finally {
      setVerifyingKey(false);
    }
  };

  // Show nothing while auth is initializing
  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Not authenticated: redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but role not allowed: redirect to home
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  const mustShowSecurityGate = Boolean(securityGateConfig) && (
    checkingSecurityKey ||
    !securityStatusLoaded ||
    Boolean(securityError) ||
    (hasSecurityKey && !securityVerified)
  );

  if (mustShowSecurityGate) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        padding: '1rem',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '450px',
          backgroundColor: '#fff',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          padding: '1.5rem',
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '0.6rem', color: '#333' }}>
            {securityGateConfig.roleLabel === 'admin' ? 'Admin Security Key' : securityGateConfig.roleLabel === 'cashier' ? 'Cashier Security PIN' : 'Driver Security Key'}
          </h2>
          <p style={{ marginTop: 0, marginBottom: '1rem', color: '#666' }}>
            {`Enter your ${securityGateConfig.roleLabel} security key to continue.`}
          </p>

          {checkingSecurityKey && <p style={{ color: '#666' }}>Checking security status...</p>}

          {!checkingSecurityKey && securityStatusLoaded && (
            <>
              <input
                type="password"
                value={securityKeyInput}
                onChange={(e) => setSecurityKeyInput(e.target.value)}
                placeholder="Enter security key"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  marginBottom: '0.8rem',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleVerifySecurityKey();
                  }
                }}
              />

              {securityError && (
                <div style={{
                  backgroundColor: '#fdecea',
                  color: '#b71c1c',
                  borderRadius: '6px',
                  padding: '0.6rem 0.75rem',
                  marginBottom: '0.8rem',
                  fontSize: '0.9rem',
                }}>
                  {securityError}
                </div>
              )}

              <button
                onClick={handleVerifySecurityKey}
                disabled={verifyingKey}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  backgroundColor: verifyingKey ? '#9aa3b2' : '#5B4B8A',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: verifyingKey ? 'not-allowed' : 'pointer',
                }}
              >
                {verifyingKey ? 'Verifying...' : 'Verify and Continue'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Authenticated and allowed: render children
  return children;
};

export default ProtectedRoute;
