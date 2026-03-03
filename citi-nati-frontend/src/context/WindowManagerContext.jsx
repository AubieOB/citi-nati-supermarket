import React, { createContext, useState, useCallback, useRef } from 'react';

/**
 * 🪟 WINDOW MANAGER CONTEXT
 * Manages all draggable/resizable windows in the dashboard
 * Features: drag, resize, minimize, maximize, close, z-index management
 */

export const WindowManagerContext = createContext();

export const WindowManagerProvider = ({ children }) => {
  // State: { [windowId]: { id, title, component, x, y, width, height, minimized, maximized, zIndex } }
  const [windows, setWindows] = useState({});
  
  // Track max z-index to prevent overlap confusion
  const maxZIndexRef = useRef(100);

  /**
   * Create a new window
   */
  const createWindow = useCallback((id, { title, component, width = 600, height = 500, x = null, y = null }) => {
    setWindows(prev => {
      if (prev[id]) return prev; // Window already exists

      // Calculate center position if not provided
      const newX = x !== null ? x : (window.innerWidth - width) / 2;
      const newY = y !== null ? y : (window.innerHeight - height) / 2;

      return {
        ...prev,
        [id]: {
          id,
          title,
          component,
          x: newX,
          y: newY,
          width,
          height,
          minimized: false,
          maximized: false,
          zIndex: maxZIndexRef.current++,
        }
      };
    });
  }, []);

  /**
   * Close a window
   */
  const closeWindow = useCallback((id) => {
    setWindows(prev => {
      const newWindows = { ...prev };
      delete newWindows[id];
      return newWindows;
    });
  }, []);

  /**
   * Update window position (for dragging)
   */
  const updateWindowPosition = useCallback((id, x, y) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], x, y }
    }));
  }, []);

  /**
   * Update window size (for resizing)
   */
  const updateWindowSize = useCallback((id, width, height) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], width, height }
    }));
  }, []);

  /**
   * Minimize a window
   */
  const minimizeWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], minimized: !prev[id].minimized, maximized: false }
    }));
  }, []);

  /**
   * Maximize/restore window
   */
  const toggleMaximize = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        maximized: !prev[id].maximized,
        minimized: false
      }
    }));
  }, []);

  /**
   * Bring window to front (increase z-index)
   */
  const focusWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], zIndex: maxZIndexRef.current++ }
    }));
  }, []);

  /**
   * Save layout to localStorage
   */
  const saveLayout = useCallback(() => {
    const layout = {};
    Object.entries(windows).forEach(([id, window]) => {
      layout[id] = {
        x: window.x,
        y: window.y,
        width: window.width,
        height: window.height,
        minimized: window.minimized,
        maximized: window.maximized,
      };
    });
    localStorage.setItem('dashboardWindowLayout', JSON.stringify(layout));
  }, [windows]);

  /**
   * Load layout from localStorage
   */
  const loadLayout = useCallback((windowConfigs) => {
    try {
      const saved = localStorage.getItem('dashboardWindowLayout');
      if (!saved) return;

      const layout = JSON.parse(saved);
      setWindows(prev => {
        const updated = { ...prev };
        Object.entries(layout).forEach(([id, savedData]) => {
          if (updated[id]) {
            updated[id] = {
              ...updated[id],
              x: savedData.x,
              y: savedData.y,
              width: savedData.width,
              height: savedData.height,
              minimized: savedData.minimized,
              maximized: savedData.maximized,
            };
          }
        });
        return updated;
      });
    } catch (err) {
      console.error('[WindowManager] Error loading layout:', err);
    }
  }, []);

  const value = {
    windows,
    createWindow,
    closeWindow,
    updateWindowPosition,
    updateWindowSize,
    minimizeWindow,
    toggleMaximize,
    focusWindow,
    saveLayout,
    loadLayout,
  };

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
};
