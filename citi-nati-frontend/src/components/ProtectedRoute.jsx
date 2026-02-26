import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * 🔐 Protected Route Component
 * 
 * Protects routes that require authentication and/or specific roles.
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

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

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

  // Authenticated and allowed: render children
  return children;
};

export default ProtectedRoute;
