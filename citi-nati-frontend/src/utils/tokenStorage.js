/**
 * 💾 TOKEN STORAGE UTILITY
 * 
 * Manages localStorage for token and user data.
 * Single source of truth for auth-related localStorage operations.
 * 
 * Do NOT store password or sensitive data.
 * Do NOT decode token manually.
 * Backend is source of truth for user role and permissions.
 */

export const tokenStorage = {
  /**
   * Save token to localStorage
   */
  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
    }
  },

  /**
   * Get token from localStorage
   */
  getToken: () => {
    return localStorage.getItem('token');
  },

  /**
   * Save user object to localStorage
   * Shape: { id, email, name, role }
   */
  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
  },

  /**
   * Get user object from localStorage
   */
  getUser: () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch (err) {
      console.error('Failed to parse user from localStorage');
      return null;
    }
  },

  /**
   * Check if user is logged in (token exists)
   */
  isLoggedIn: () => {
    return !!localStorage.getItem('token');
  },

  /**
   * Clear all auth data (logout)
   */
  clear: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

export default tokenStorage;
