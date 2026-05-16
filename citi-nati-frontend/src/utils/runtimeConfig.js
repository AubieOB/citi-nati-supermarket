/**
 * Runtime environment helpers for frontend URL resolution.
 *
 * Electron desktop renderers should resolve to production backend URLs by default,
 * while browser development mode continues to use localhost unless explicitly overridden.
 */

const isElectronRuntime = () => {
  return typeof window !== 'undefined' && window.__SECURITY__?.isElectron === true;
};

export const getApiBaseUrl = () => {
  const electronDefault = 'https://www.citinati.com/api';
  const browserDefault = 'http://localhost:5000/api';

  if (isElectronRuntime()) {
    return import.meta.env.VITE_ELECTRON_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || electronDefault;
  }

  return import.meta.env.VITE_API_BASE_URL || browserDefault;
};

export const getBackendUrl = () => {
  const electronDefault = 'https://www.citinati.com';
  const browserDefault = 'http://localhost:5000';

  if (isElectronRuntime()) {
    return import.meta.env.VITE_ELECTRON_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || electronDefault;
  }

  return import.meta.env.VITE_BACKEND_URL || browserDefault;
};
