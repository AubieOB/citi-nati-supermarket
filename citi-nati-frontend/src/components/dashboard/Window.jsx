import React, { useRef, useState } from 'react';
import { useWindowManager } from '../../hooks/useWindowManager';

/**
 * 🪟 WINDOW COMPONENT
 * Individual draggable, resizable window with title bar, controls
 */
const Window = ({ id, title, component: Component, x, y, width, height, minimized, maximized, zIndex }) => {
  const { updateWindowPosition, updateWindowSize, minimizeWindow, toggleMaximize, closeWindow, focusWindow } = useWindowManager();
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState(null);
  const dragStartRef = useRef({ x: 0, y: 0, windowX: 0, windowY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const windowRef = useRef(null);

  // ===== DRAGGING LOGIC =====
  const handleTitleMouseDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return; // Left click only, not on buttons
    
    setIsDragging(true);
    focusWindow(id);
    
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      windowX: x,
      windowY: y,
    };
  };

  const handleMouseMove = (e) => {
    if (isDragging && !maximized) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      
      const newX = Math.max(0, dragStartRef.current.windowX + deltaX);
      const newY = Math.max(0, dragStartRef.current.windowY + deltaY);
      
      updateWindowPosition(id, newX, newY);
    }

    if (isResizing && !maximized && resizeDirection) {
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;
      
      let newWidth = resizeStartRef.current.width;
      let newHeight = resizeStartRef.current.height;

      // Handle resize directions
      if (resizeDirection.includes('e')) newWidth += deltaX; // East (right)
      if (resizeDirection.includes('s')) newHeight += deltaY; // South (bottom)
      if (resizeDirection.includes('w')) newWidth -= deltaX; // West (left)
      if (resizeDirection.includes('n')) newHeight -= deltaY; // North (top)

      // Minimum size constraints
      newWidth = Math.max(300, newWidth);
      newHeight = Math.max(200, newHeight);

      updateWindowSize(id, newWidth, newHeight);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeDirection(null);
  };

  React.useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, maximized, x, y, width, height, resizeDirection, id, updateWindowPosition, updateWindowSize]);

  // ===== RESIZE HANDLE LOGIC =====
  const startResize = (direction) => (e) => {
    if (e.button !== 0 || maximized) return;
    
    e.preventDefault();
    setIsResizing(true);
    setResizeDirection(direction);
    focusWindow(id);
    
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: width,
      height: height,
    };
  };

  // ===== DOUBLE-CLICK TITLE BAR =====
  const handleTitleDoubleClick = () => {
    if (!maximized) {
      focusWindow(id);
    }
    toggleMaximize(id);
  };

  // ===== GET CURSOR FOR RESIZE HANDLES =====
  const getCursorForDirection = (direction) => {
    const cursorMap = {
      'n': 'row-resize',
      's': 'row-resize',
      'e': 'col-resize',
      'w': 'col-resize',
      'ne': 'nesw-resize',
      'nw': 'nwse-resize',
      'se': 'nwse-resize',
      'sw': 'nesw-resize',
    };
    return cursorMap[direction] || 'default';
  };

  // Calculate display dimensions
  let displayWidth = width;
  let displayHeight = height;
  let displayX = x;
  let displayY = y;

  if (maximized) {
    displayX = 0;
    displayY = 60; // Leave space for top (taskbar will be at bottom)
    displayWidth = window.innerWidth;
    displayHeight = window.innerHeight - 60 - 50; // Subtract bottom taskbar height
  }

  if (minimized) {
    return null; // Minimized windows don't render, only shown in taskbar
  }

  return (
    <div
      ref={windowRef}
      onClick={() => focusWindow(id)}
      style={{
        position: 'fixed',
        left: `${displayX}px`,
        top: `${displayY}px`,
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
        zIndex: zIndex,
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        userSelect: isDragging ? 'none' : 'auto',
        transition: isDragging ? 'none' : 'box-shadow 0.2s',
      }}
    >
      {/* Title Bar */}
      <div
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={handleTitleDoubleClick}
        style={{
          padding: '0.75rem 1rem',
          backgroundColor: '#5B4B8A',
          color: '#fff',
          fontWeight: '600',
          borderRadius: '8px 8px 0 0',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
          borderBottom: '1px solid #4a3a78',
        }}
      >
        <span>{title}</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => minimizeWindow(id)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.9rem',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
            onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
            title="Minimize"
          >
            <i className="fas fa-minus"></i>
          </button>
          <button
            onClick={() => toggleMaximize(id)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.9rem',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
            onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
            title={maximized ? 'Restore' : 'Maximize'}
          >
            <i className={`fas fa-${maximized ? 'compress' : 'square'}`}></i>
          </button>
          <button
            onClick={() => closeWindow(id)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.9rem',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.target.style.background = 'rgba(255, 107, 107, 0.6)'}
            onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
            title="Close"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '1rem',
        }}
      >
        <Component />
      </div>

      {/* Resize Handles - Only show when not maximized */}
      {!maximized && (
        <>
          {/* Corner handles */}
          <div
            onMouseDown={startResize('se')}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: '20px',
              height: '20px',
              cursor: getCursorForDirection('se'),
              backgroundColor: 'transparent',
            }}
          />
          <div
            onMouseDown={startResize('sw')}
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '20px',
              height: '20px',
              cursor: getCursorForDirection('sw'),
              backgroundColor: 'transparent',
            }}
          />
          <div
            onMouseDown={startResize('ne')}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '20px',
              height: '20px',
              cursor: getCursorForDirection('ne'),
              backgroundColor: 'transparent',
            }}
          />
          <div
            onMouseDown={startResize('nw')}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '20px',
              height: '20px',
              cursor: getCursorForDirection('nw'),
              backgroundColor: 'transparent',
            }}
          />
          {/* Edge handles */}
          <div
            onMouseDown={startResize('e')}
            style={{
              position: 'absolute',
              right: 0,
              top: '20px',
              bottom: '20px',
              width: '5px',
              cursor: getCursorForDirection('e'),
              backgroundColor: 'transparent',
            }}
          />
          <div
            onMouseDown={startResize('w')}
            style={{
              position: 'absolute',
              left: 0,
              top: '20px',
              bottom: '20px',
              width: '5px',
              cursor: getCursorForDirection('w'),
              backgroundColor: 'transparent',
            }}
          />
          <div
            onMouseDown={startResize('s')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: '20px',
              right: '20px',
              height: '5px',
              cursor: getCursorForDirection('s'),
              backgroundColor: 'transparent',
            }}
          />
          <div
            onMouseDown={startResize('n')}
            style={{
              position: 'absolute',
              top: 0,
              left: '20px',
              right: '20px',
              height: '5px',
              cursor: getCursorForDirection('n'),
              backgroundColor: 'transparent',
            }}
          />
        </>
      )}
    </div>
  );
};

export default Window;
