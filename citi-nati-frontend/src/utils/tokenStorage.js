/**
 * In-memory auth token cache.
 * 
 * Sensitive auth material is intentionally not persisted in localStorage.
 * Session continuity comes from HTTP-only cookies managed by the backend.
 */

let currentToken = null;
let currentUser = null;

export const tokenStorage = {
  setToken: (token) => {
    currentToken = token || null;
  },

  getToken: () => currentToken,

  setUser: (user) => {
    currentUser = user || null;
  },

  getUser: () => currentUser,

  isLoggedIn: () => Boolean(currentToken),

  clear: () => {
    currentToken = null;
    currentUser = null;
  },
};

export default tokenStorage;
