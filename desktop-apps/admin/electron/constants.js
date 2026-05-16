/**
 * Shared Electron application constants
 * Used by all desktop apps (Admin, Cashier, Driver)
 */

export const APP_TYPES = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
  DRIVER: 'driver',
};

export const WINDOW_SIZES = {
  MIN_WIDTH: 1024,
  MIN_HEIGHT: 768,
  DEFAULT_WIDTH: 1280,
  DEFAULT_HEIGHT: 1024,
};

// URL configuration based on environment
export const getApiUrl = () => {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    return process.env.ELECTRON_API_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000';
  }

  // Production: use environment variable or default to VPS
  return process.env.ELECTRON_API_URL || process.env.REACT_APP_API_URL || 'https://www.citinati.com';
};

export const getWebUrl = () => {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    return 'http://localhost:3000';
  }

  return process.env.ELECTRON_WEB_URL || process.env.REACT_APP_WEB_URL || 'https://citi-nati.com';
};

// IPC channels for main <-> renderer communication
export const IPC_CHANNELS = {
  // Window management
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_FOCUS: 'window:focus',
  WINDOW_OPEN_DEV_TOOLS: 'window:openDevTools',
  
  // Authentication
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_TOKEN: 'auth:getToken',
  AUTH_REFRESH_TOKEN: 'auth:refreshToken',
  
  // App state
  APP_GET_INFO: 'app:getInfo',
  APP_READY: 'app:ready',
  
  // Sync operations
  SYNC_START: 'sync:start',
  SYNC_STATUS: 'sync:status',
  SYNC_COMPLETE: 'sync:complete',
  
  // Notifications
  NOTIFICATION_SEND: 'notification:send',
};

// Secure storage keys
export const SECURE_STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_EMAIL: 'user_email',
  APP_ENCRYPTION_KEY: 'app_encryption_key',
};
