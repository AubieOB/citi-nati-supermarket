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

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const restoreFromSession = async () => {
          const sessionResponse = await api.get('/auth/session');
          return {
            token: sessionResponse.data?.token || null,
            user: sessionResponse.data?.user || null,
          };
        };

        let session = null;

        try {
          session = await restoreFromSession();
        } catch (sessionErr) {
          if (sessionErr?.response?.status === 401) {
            const refreshResponse = await api.post('/auth/refresh');
            session = {
              token: refreshResponse.data?.token || null,
              user: refreshResponse.data?.user || null,
            };
          } else {
            throw sessionErr;
          }
        }

        if (session?.token && session?.user) {
          tokenStorage.setToken(session.token);
          tokenStorage.setUser(session.user);
          setAuthToken(session.token);
          setToken(session.token);
          setUser(session.user);
        } else {
          clearAuthToken();
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.warn('Auth initialization failed:', err?.response?.data?.error || err.message);
        clearAuthToken();
        setToken(null);
        setUser(null);
      } finally {
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
