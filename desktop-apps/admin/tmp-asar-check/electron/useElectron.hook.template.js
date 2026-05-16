/**
 * Electron App Feature Detection Hook
 * 
 * Use in React components to detect if running in Electron
 * and access Electron APIs safely.
 * 
 * TEMPLATE: Copy to citi-nati-frontend/src/hooks/useElectron.js
 */

import { useEffect, useState, useCallback } from 'react';

/**
 * Hook to detect and interact with Electron environment
 * 
 * Usage:
 *   const { isElectron, electronAPI } = useElectron();
 *   
 *   if (isElectron) {
 *     const appInfo = await electronAPI.getAppInfo();
 *   }
 */
export function useElectron() {
  const [isElectron, setIsElectron] = useState(false);
  const [electronAPI, setElectronAPI] = useState(null);

  useEffect(() => {
    // Check if electronAPI is available (set by preload script)
    if (window.electronAPI && window.__SECURITY__?.isElectron) {
      setIsElectron(true);
      setElectronAPI(window.electronAPI);
    }
  }, []);

  const getAppInfo = useCallback(async () => {
    if (!isElectron || !electronAPI) return null;
    try {
      return await electronAPI.getAppInfo();
    } catch (error) {
      console.error('Failed to get app info:', error);
      return null;
    }
  }, [isElectron, electronAPI]);

  const minimizeWindow = useCallback(() => {
    if (isElectron && electronAPI?.minimizeWindow) {
      electronAPI.minimizeWindow();
    }
  }, [isElectron, electronAPI]);

  const maximizeWindow = useCallback(() => {
    if (isElectron && electronAPI?.maximizeWindow) {
      electronAPI.maximizeWindow();
    }
  }, [isElectron, electronAPI]);

  const closeWindow = useCallback(() => {
    if (isElectron && electronAPI?.closeWindow) {
      electronAPI.closeWindow();
    }
  }, [isElectron, electronAPI]);

  const startSync = useCallback(async (syncType) => {
    if (!isElectron || !electronAPI?.startSync) return false;
    try {
      return await electronAPI.startSync(syncType);
    } catch (error) {
      console.error('Failed to start sync:', error);
      return false;
    }
  }, [isElectron, electronAPI]);

  const onSyncStatus = useCallback((callback) => {
    if (!isElectron || !electronAPI?.onSyncStatus) return () => {};
    return electronAPI.onSyncStatus(callback);
  }, [isElectron, electronAPI]);

  return {
    isElectron,
    electronAPI,
    getAppInfo,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    startSync,
    onSyncStatus,
  };
}
