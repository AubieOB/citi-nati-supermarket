import React, { createContext, useState, useEffect } from 'react';
import api, { setAuthToken, clearAuthToken } from '../utils/api.js';
import tokenStorage from '../utils/tokenStorage.js';
import { hasPermission as hasPermissionForUser } from '../utils/permissions.js';

/**
 * 🔐 GLOBAL AUTH CONTEXT
 * 
 * Provides centralized authentication state management across the entire app
 * 
 * State:
 * - user: { id, email, name, role }
 * - token: JWT token string
 * - isAuthenticated: boolean
 * - isLoading: boolean (for initialization)
 * 
 * Methods:
 * - login(user, token): Called after successful login
 * - logout(): Clear auth state and redirect
 */

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Initialize auth on app load
   * Check if token exists in localStorage
   * If yes, restore it and set axios header
   */
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedToken = tokenStorage.getToken();
        const storedUser = tokenStorage.getUser();

        if (storedToken && storedUser) {
          // ✅ Token exists: Restore auth state
          setToken(storedToken);
          setUser(storedUser);

          // ✅ Set axios default header
          setAuthToken(storedToken);

          // Refresh user snapshot from backend so permission changes are reflected.
          try {
            const sessionResponse = await api.get('/auth/session');
            const latestUser = sessionResponse.data?.user;
            if (latestUser) {
              tokenStorage.setUser(latestUser);
              setUser(latestUser);
            }
          } catch (sessionErr) {
            console.warn('Session refresh failed, using cached user:', sessionErr?.response?.data?.error || sessionErr.message);
          }

          console.log('✓ Auth restored from localStorage');
        } else {
          // ❌ No token: User not authenticated
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error('❌ Auth initialization error:', err);
        setToken(null);
        setUser(null);
      } finally {
        // ✅ Mark initialization complete
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      clearAuthToken();
      setToken(null);
      setUser(null);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('app:session-expired', handleSessionExpired);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('app:session-expired', handleSessionExpired);
      }
    };
  }, []);

  /**
   * Login: Called after successful API authentication
   * Stores token and user, sets axios header
   */
  const login = (userData, userToken) => {
    tokenStorage.setToken(userToken);
    tokenStorage.setUser(userData);
    setAuthToken(userToken);
    setToken(userToken);
    setUser(userData);

    console.log('✓ User logged in:', userData.email);
  };

  /**
   * Logout: Clear all auth state
   * - Remove from localStorage
   * - Clear axios header
   * - Reset state
   * - Redirect to home (will happen in calling component)
   */
  const logout = () => {
    api.post('/auth/logout').catch((err) => {
      console.warn('Logout cookie clear failed:', err?.response?.data?.error || err.message);
    });

    tokenStorage.clear();
    clearAuthToken();
    setToken(null);
    setUser(null);

    console.log('✓ User logged out');
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    hasPermission: (permissionKey) => hasPermissionForUser(user, permissionKey),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to use AuthContext
 * Usage: const { user, isAuthenticated, logout } = useAuth();
 */
export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;
