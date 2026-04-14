/**
 * 🔐 API CONFIGURATION
 * 
 * This module sets up axios with automatic token injection.
 * On app startup, if token exists in localStorage, 
 * it's automatically set as the Authorization header.
 * 
 * Usage:
 *   import api from '../utils/api';
 *   api.post('/auth/login', { email, password })
 */

import axios from 'axios';
import { tokenStorage } from './tokenStorage.js';

let isHandlingSessionExpiry = false;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to ensure token is always included
 */
api.interceptors.request.use(
  (config) => {
    const token = tokenStorage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor to handle expired/invalid sessions once globally.
 * Prevents repeated 401 storms in admin dashboards when token has expired.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || '');
    const hasToken = Boolean(tokenStorage.getToken());
    const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

    if (status === 401 && hasToken && !isAuthRequest && !isHandlingSessionExpiry) {
      isHandlingSessionExpiry = true;

      // Clear local auth immediately so app state stops sending stale token.
      delete api.defaults.headers.common.Authorization;
      tokenStorage.clear();

      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('app:session-expired'));
        } catch (dispatchError) {
          console.warn('[API] Failed to dispatch session-expired event:', dispatchError);
        }

        // Force a clean route transition to login to recover quickly.
        window.location.assign('/login?reason=session-expired');
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Initialize API with token from localStorage
 * Called on app startup (in App.jsx or main.jsx)
 */
export const initializeAuth = () => {
  const token = tokenStorage.getToken();
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    console.log('[API] Authorization header set from localStorage');
  } else {
    console.log('[API] No token found in localStorage');
  }
};

/**
 * Set Authorization header when token obtained
 * Called after successful login
 */
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    tokenStorage.setToken(token);
    console.log('[API] Authorization header updated with new token');
  }
};

/**
 * Remove Authorization header on logout
 * Called on logout
 */
export const clearAuthToken = () => {
  delete api.defaults.headers.common['Authorization'];
  tokenStorage.clear();
  console.log('[API] Authorization header cleared');
};

export default api;
