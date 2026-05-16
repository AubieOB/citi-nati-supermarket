/**
 * Preload script for secure IPC communication
 * Exposes safe APIs to React frontend while blocking direct node.js access
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  focusWindow: () => ipcRenderer.send('window:focus'),
  openDevTools: () => ipcRenderer.send('window:openDevTools'),
  
  // Get app info
  getAppInfo: async () => {
    try {
      return await ipcRenderer.invoke('app:getInfo');
    } catch (error) {
      console.error('Failed to get app info:', error);
      return null;
    }
  },
  
  // Secure token storage (request from main process)
  getAuthToken: async () => {
    try {
      return await ipcRenderer.invoke('auth:getToken');
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  },
  
  // Secure token storage (request from main process)
  saveAuthToken: async (token) => {
    try {
      return await ipcRenderer.invoke('auth:saveToken', token);
    } catch (error) {
      console.error('Failed to save auth token:', error);
      return false;
    }
  },
  
  // Sync operations
  startSync: async (syncType) => {
    try {
      return await ipcRenderer.invoke('sync:start', syncType);
    } catch (error) {
      console.error('Failed to start sync:', error);
      return false;
    }
  },
  
  // Listen for sync status updates
  onSyncStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('sync:status', listener);
    
    // Return unsubscribe function
    return () => ipcRenderer.removeListener('sync:status', listener);
  },
  
  // Send notifications to main process
  sendNotification: (title, options) => {
    ipcRenderer.send('notification:send', { title, options });
  },
  
  // App ready signal
  appReady: () => {
    ipcRenderer.send('app:ready');
  },
});

// Security: Block dangerous APIs
contextBridge.exposeInMainWorld('__SECURITY__', {
  // Indicates app is running in Electron (safe flag for feature detection)
  isElectron: true,
});

console.log('✓ Electron preload script loaded successfully');
