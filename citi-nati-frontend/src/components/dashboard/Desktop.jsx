import React, { useEffect } from 'react';
import { useWindowManager } from '../../hooks/useWindowManager';
import Window from './Window';
import Taskbar from './Taskbar';

/**
 * 🖥️ DESKTOP COMPONENT
 * Container for all draggable windows - modern Windows-style desktop
 */
const Desktop = () => {
  const { windows, loadLayout } = useWindowManager();

  // Load saved layout on mount
  useEffect(() => {
    loadLayout();
  }, [loadLayout]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#1a1a2e',
        overflow: 'hidden',
        backgroundImage: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      }}
    >
      {/* Render all windows */}
      <div style={{ position: 'relative', width: '100%', height: 'calc(100% - 50px)' }}>
        {Object.values(windows).map((window) => (
          <Window
            key={window.id}
            id={window.id}
            title={window.title}
            component={window.component}
            x={window.x}
            y={window.y}
            width={window.width}
            height={window.height}
            minimized={window.minimized}
            maximized={window.maximized}
            zIndex={window.zIndex}
          />
        ))}
      </div>

      {/* Taskbar at bottom */}
      <Taskbar />
    </div>
  );
};

export default Desktop;
