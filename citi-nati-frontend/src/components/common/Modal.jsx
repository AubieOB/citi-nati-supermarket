import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';


const Modal = ({ 
  isOpen, 
  title, 
  message, 
  type = 'info', // 'info', 'warning', 'error', 'success', 'confirm'
  onConfirm, 
  onCancel, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  showCancelButton = true,
  confirmButtonColor = null,
  headerActions = null,
  children
}) => {
  const modalRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen && typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmBtnRef.current?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCancel?.();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (showCancelButton) {
          cancelBtnRef.current?.focus();
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmBtnRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    confirmBtnRef.current?.focus();
    modalRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel, showCancelButton]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <i className="fas fa-exclamation-circle" style={{ color: '#dc2626', fontSize: '1.55rem' }}></i>;
      case 'warning':
        return <i className="fas fa-exclamation-triangle" style={{ color: '#f59e0b', fontSize: '1.55rem' }}></i>;
      case 'success':
        return <i className="fas fa-check-circle" style={{ color: '#00b600', fontSize: '1.55rem' }}></i>;
      case 'confirm':
        return <i className="fas fa-question-circle" style={{ color: '#0057d9', fontSize: '1.55rem' }}></i>;
      default:
        return <i className="fas fa-info-circle" style={{ color: '#0057d9', fontSize: '1.55rem' }}></i>;
    }
  };

  const getConfirmButtonColor = () => {
    if (confirmButtonColor) return confirmButtonColor;
    switch (type) {
      case 'error':
        return '#dc2626';
      case 'warning':
        return '#f59e0b';
      case 'success':
        return '#00a820';
      default:
        return '#0057d9';
    }
  };

  const modalMarkup = (
    <>
      {/* Overlay - Blocks interaction outside modal */}
      <div
        className={`app-modal-overlay ${isAdminDarkTheme ? 'dark' : 'light'}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.52)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 11990,
          pointerEvents: 'auto',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onCancel) onCancel();
        }}
        role="presentation"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`app-modal-shell ${isAdminDarkTheme ? 'dark' : 'light'}`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: isAdminDarkTheme ? '#1e1e1e' : '#fff',
          borderRadius: '8px',
          border: `1px solid ${isAdminDarkTheme ? '#2f3a46' : '#e2e8f0'}`,
          boxShadow: isAdminDarkTheme ? '0 18px 45px rgba(0, 0, 0, 0.45)' : '0 20px 60px rgba(15, 23, 42, 0.22)',
          zIndex: 12000,
          maxWidth: '440px',
          width: 'min(92vw, 440px)',
          maxHeight: '82vh',
          overflow: 'auto',
          animation: 'modalSlideIn 0.3s ease',
          pointerEvents: 'auto',
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            confirmBtnRef.current?.click();
          }
        }}
      >
        <style>{`
          @keyframes modalSlideIn {
            from {
              opacity: 0;
              transform: translate(-50%, -48%);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%);
            }
          }
        `}</style>

        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.82rem 0.95rem',
            borderBottom: `1px solid ${isAdminDarkTheme ? '#333333' : '#e9ecef'}`,
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}>
              {getIcon()}
            </div>
            <h3 id="modal-title" style={{ margin: 0, color: isAdminDarkTheme ? '#dbe7f8' : '#142033', fontSize: '1rem', fontWeight: '800' }}>
              {title}
            </h3>
          </div>
          {headerActions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginRight: '0.5rem' }}>
              {headerActions}
            </div>
          )}
          <button
            className="app-modal-close"
            aria-label="Close dialog"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1rem',
              cursor: 'pointer',
              color: isAdminDarkTheme ? '#b0b0b0' : '#64748b',
              padding: '0',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => (e.target.style.color = isAdminDarkTheme ? '#f3f3f3' : '#333')}
            onMouseLeave={(e) => (e.target.style.color = isAdminDarkTheme ? '#b0b0b0' : '#999')}
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div
          id="modal-description"
          style={{
            padding: '0.9rem 1rem',
            color: isAdminDarkTheme ? '#cccccc' : '#555',
            lineHeight: '1.6',
            fontSize: '0.9rem',
          }}
        >
          {message && <p style={{ margin: '0 0 0.25rem 0' }}>{message}</p>}
          {children}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            padding: '0.78rem 1rem',
            borderTop: `1px solid ${isAdminDarkTheme ? '#333333' : '#e9ecef'}`,
            backgroundColor: isAdminDarkTheme ? '#181818' : '#f8fbff',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px',
          }}
        >
          {showCancelButton && (
            <button
              type="button"
              ref={cancelBtnRef}
              onClick={onCancel}
              style={{
                padding: '0.55rem 1.1rem',
                borderRadius: '6px',
                border: `1px solid ${isAdminDarkTheme ? '#3a3a3a' : '#ddd'}`,
                backgroundColor: isAdminDarkTheme ? '#222222' : '#fff',
                color: isAdminDarkTheme ? '#d4d4d4' : '#555',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = isAdminDarkTheme ? '#2a2a2a' : '#f5f5f5';
                e.target.style.borderColor = isAdminDarkTheme ? '#4a4a4a' : '#bbb';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = isAdminDarkTheme ? '#222222' : '#fff';
                e.target.style.borderColor = isAdminDarkTheme ? '#3a3a3a' : '#ddd';
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            ref={confirmBtnRef}
            onClick={async () => {
              try {
                await onConfirm?.();
              } catch (err) {
                console.error('Error in onConfirm:', err);
              }
            }}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: getConfirmButtonColor(),
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.target.style.opacity = '0.9';
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = isAdminDarkTheme
                ? '0 8px 20px rgba(15, 24, 35, 0.45)'
                : '0 4px 12px rgba(91, 75, 138, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.target.style.opacity = '1';
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') {
    return modalMarkup;
  }

  return createPortal(modalMarkup, document.body);
};

export default Modal;
