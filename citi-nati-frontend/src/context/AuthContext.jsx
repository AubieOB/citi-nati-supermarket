import React, { createContext, useState, useEffect } from 'react';
import api, { setAuthToken, clearAuthToken } from '../utils/api.js';
import tokenStorage from '../utils/tokenStorage.js';

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
    const initializeAuth = () => {
      try {
        const storedToken = tokenStorage.getToken();
        const storedUser = tokenStorage.getUser();

        if (storedToken && storedUser) {
          // ✅ Token exists: Restore auth state
          setToken(storedToken);
          setUser(storedUser);

          // ✅ Set axios default header
          setAuthToken(storedToken);

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
