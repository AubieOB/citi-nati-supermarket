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

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Initialize API with token from localStorage
 * Called on app startup (in App.jsx or main.jsx)
 */
export const initializeAuth = () => {
  const token = localStorage.getItem('token');
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
};

/**
 * Set Authorization header when token obtained
 * Called after successful login
 */
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('token', token);
  }
};

/**
 * Remove Authorization header on logout
 * Called on logout
 */
export const clearAuthToken = () => {
  delete api.defaults.headers.common['Authorization'];
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export default api;
