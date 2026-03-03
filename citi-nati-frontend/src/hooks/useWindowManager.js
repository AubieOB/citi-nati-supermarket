import { useContext } from 'react';
import { WindowManagerContext } from '../context/WindowManagerContext';

/**
 * 🪟 WINDOW MANAGER HOOK
 * Easy API to access and manipulate windows
 */
export const useWindowManager = () => {
  const context = useContext(WindowManagerContext);
  
  if (!context) {
    throw new Error('useWindowManager must be used within WindowManagerProvider');
  }

  return context;
};
