import React from 'react';


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
  children
}) => {
  if (!isOpen) return null;

  // Prevent body scroll when modal is open
  if (typeof document !== 'undefined') {
    document.body.style.overflow = 'hidden';
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = 'unset';
      }
    };
  }, []);

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <i className="fas fa-exclamation-circle" style={{ color: '#dc3545', fontSize: '2rem' }}></i>;
      case 'warning':
        return <i className="fas fa-exclamation-triangle" style={{ color: '#ffc107', fontSize: '2rem' }}></i>;
      case 'success':
        return <i className="fas fa-check-circle" style={{ color: '#2D8659', fontSize: '2rem' }}></i>;
      case 'confirm':
        return <i className="fas fa-question-circle" style={{ color: '#5B4B8A', fontSize: '2rem' }}></i>;
      default:
        return <i className="fas fa-info-circle" style={{ color: '#5B4B8A', fontSize: '2rem' }}></i>;
    }
  };

  const getConfirmButtonColor = () => {
    if (confirmButtonColor) return confirmButtonColor;
    switch (type) {
      case 'error':
        return '#dc3545';
      case 'warning':
        return '#ffc107';
      case 'success':
        return '#2D8659';
      default:
        return '#5B4B8A';
    }
  };

  return (
    <>
      {/* Overlay - Blocks interaction outside modal */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
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
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
          zIndex: 1000,
          maxWidth: '500px',
          width: '90%',
          maxHeight: '70vh',
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
            padding: '1rem',
            borderBottom: '1px solid #e9ecef',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px' }}>
              {getIcon()}
            </div>
            <h3 style={{ margin: 0, color: '#333', fontSize: '1.1rem', fontWeight: '600' }}>
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#999',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => (e.target.style.color = '#333')}
            onMouseLeave={(e) => (e.target.style.color = '#999')}
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '1rem',
            color: '#555',
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
            padding: '1rem',
            borderTop: '1px solid #e9ecef',
            backgroundColor: '#f8f9fa',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px',
          }}
        >
          {showCancelButton && (
            <button
              onClick={onCancel}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                backgroundColor: '#fff',
                color: '#555',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f5f5f5';
                e.target.style.borderColor = '#bbb';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#fff';
                e.target.style.borderColor = '#ddd';
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await onConfirm?.();
              } catch (err) {
                console.error('Error in onConfirm:', err);
              }
            }}
            style={{
              padding: '0.625rem 1.25rem',
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
              e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.2)';
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
};

export default Modal;
