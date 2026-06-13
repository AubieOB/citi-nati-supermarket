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
let refreshPromise = null;

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

export const getFriendlyApiErrorMessage = (error) => {
  const status = error?.response?.status;
  const rawMessage = String(error?.response?.data?.error || error?.response?.data?.message || error?.message || '').trim();
  const lowerMessage = rawMessage.toLowerCase();

  if (!error?.response) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }
  if (status === 401) {
    return 'Incorrect email or password. Please try again.';
  }
  if (status === 403) {
    return 'Your account does not have permission to perform this action.';
  }
  if (status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (status >= 500) {
    return 'Something went wrong. Please try again later.';
  }
  if (lowerMessage.includes('network error') || lowerMessage.includes('timeout')) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }
  if (rawMessage && !/axioserror|status code|\b40[013]\b|\b429\b|\b500\b|stack/i.test(rawMessage)) {
    return rawMessage;
  }
  return 'An unexpected error occurred. Please try again.';
};

const applyFriendlyApiErrorMessage = (error) => {
  const friendlyMessage = getFriendlyApiErrorMessage(error);
  error.userMessage = friendlyMessage;
  error.message = friendlyMessage;
  return error;
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
    return Promise.reject(applyFriendlyApiErrorMessage(error));
  }
);

/**
 * Response interceptor to handle expired/invalid sessions once globally.
 * Prevents repeated 401 storms in admin dashboards when token has expired.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || '');
    const originalRequest = error?.config;
    const hasToken = Boolean(tokenStorage.getToken());
    const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register') || requestUrl.includes('/auth/refresh');
    const sessionExpired = isSessionExpiryError(error);

    if (status === 401 && sessionExpired && !isAuthRequest && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        refreshPromise = refreshPromise || api.post('/auth/refresh');
        const refreshResponse = await refreshPromise;
        const nextToken = refreshResponse.data?.token;
        const nextUser = refreshResponse.data?.user;

        if (nextToken) {
          setAuthToken(nextToken);
          if (nextUser) {
            tokenStorage.setUser(nextUser);
          }
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${nextToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        delete api.defaults.headers.common.Authorization;
        tokenStorage.clear();

        if (typeof window !== 'undefined' && !isHandlingSessionExpiry) {
          isHandlingSessionExpiry = true;
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

        return Promise.reject(applyFriendlyApiErrorMessage(refreshError));
      } finally {
        refreshPromise = null;
      }
    }

    if (status === 401 && hasToken && !isAuthRequest && sessionExpired && !isHandlingSessionExpiry) {
      isHandlingSessionExpiry = true;
      delete api.defaults.headers.common.Authorization;
      tokenStorage.clear();
    }

    return Promise.reject(applyFriendlyApiErrorMessage(error));
  }
);

/**
 * Initialize API with token from localStorage
 * Called on app startup (in App.jsx or main.jsx)
 */
export const initializeAuth = () => {
  const token = tokenStorage.getToken();
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  }
};

/**
 * Set Authorization header when token obtained
 * Called after successful login
 */
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    tokenStorage.setToken(token);
  }
};

/**
 * Remove Authorization header on logout
 * Called on logout
 */
export const clearAuthToken = () => {
  delete api.defaults.headers.common.Authorization;
  tokenStorage.clear();
  isHandlingSessionExpiry = false;
};

export default api;
