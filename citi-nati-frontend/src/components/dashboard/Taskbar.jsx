import React from 'react';
import { useWindowManager } from '../../hooks/useWindowManager';

/**
 * 📋 TASKBAR COMPONENT
 * Shows all open windows (and minimized ones), allows focusing and restoring
 */
const Taskbar = () => {
  const { windows, minimizeWindow, focusWindow } = useWindowManager();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '50px',
        backgroundColor: '#2a2a3e',
        borderTop: '1px solid #444',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '10px',
        paddingRight: '10px',
        gap: '8px',
        zIndex: 9000,
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Citi-Nati Logo/Home */}
      <button
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: '8px 12px',
          borderRadius: '4px',
          transition: 'background 0.2s',
          fontSize: '1.2rem',
        }}
        onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(91, 75, 138, 0.5)'}
        onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
        title="Home"
      >
        <i className="fas fa-home"></i>
      </button>

      {/* Divider */}
      <div
        style={{
          width: '1px',
          height: '30px',
          backgroundColor: '#555',
          margin: '0 5px',
        }}
      />

      {/* Window Buttons */}
      <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
        {Object.values(windows).length === 0 ? (
          <span style={{ color: '#888', fontSize: '0.9rem', padding: '8px 12px' }}>
            No windows open
          </span>
        ) : (
          Object.values(windows).map((window) => (
            <button
              key={window.id}
              onClick={() => {
                if (window.minimized) {
                  minimizeWindow(window.id); // Restore
                } else {
                  focusWindow(window.id); // Focus
                }
              }}
              style={{
                backgroundColor: window.minimized ? 'rgba(91, 75, 138, 0.3)' : 'rgba(91, 75, 138, 0.8)',
                border: '1px solid rgba(91, 75, 138, 1)',
                color: '#fff',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.85rem',
                transition: 'all 0.2s',
                maxWidth: '150px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                opacity: window.minimized ? 0.6 : 1,
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = 'rgba(91, 75, 138, 1)';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = window.minimized ? 'rgba(91, 75, 138, 0.3)' : 'rgba(91, 75, 138, 0.8)';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <i className="fas fa-window-restore" style={{ marginRight: '6px' }}></i>
              {window.title}
              {window.minimized && ' (minimized)'}
            </button>
          ))
        )}
      </div>

      {/* System Info (Right side) */}
      <div
        style={{
          color: '#888',
          fontSize: '0.85rem',
          padding: '8px 12px',
          borderLeft: '1px solid #555',
          paddingLeft: '12px',
        }}
      >
        {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
};

export default Taskbar;
