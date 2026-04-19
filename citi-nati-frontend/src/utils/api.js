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

const SESSION_EXPIRY_PATTERNS = [
  /invalid\s+or\s+expired\s+token/i,
  /token\s+expired/i,
  /jwt\s+expired/i,
  /no\s+token\s+provided/i,
  /session\s+expired/i,
  /invalid\s+token/i,
  /not\s+authenticated/i,
  /unauthorized\.\s*user\s+not\s+found/i,
];

const extractApiErrorText = (error) => {
  const payload = error?.response?.data;
  if (!payload) return '';
  return String(payload.error || payload.message || payload.detail || '').trim();
};

const isSessionExpiryError = (error) => {
  const status = error?.response?.status;
  if (status !== 401) return false;

  const payloadCode = String(error?.response?.data?.code || '').trim().toUpperCase();
  if (payloadCode === 'TOKEN_EXPIRED' || payloadCode === 'SESSION_EXPIRED' || payloadCode === 'INVALID_TOKEN') {
    return true;
  }

  const message = extractApiErrorText(error);
  if (!message) return false;
  return SESSION_EXPIRY_PATTERNS.some((pattern) => pattern.test(message));
};

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
    const sessionExpired = isSessionExpiryError(error);

    if (status === 401 && hasToken && !isAuthRequest && sessionExpired && !isHandlingSessionExpiry) {
      isHandlingSessionExpiry = true;

      // Clear local auth immediately so app state stops sending stale token.
      delete api.defaults.headers.common.Authorization;
      tokenStorage.clear();

      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('app:session-expired', {
            detail: {
              message: 'Session expired. Please login again.',
              redirectTo: '/login?reason=session-expired',
            },
          }));
        } catch (dispatchError) {
          console.warn('[API] Failed to dispatch session-expired event:', dispatchError);
        }
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
