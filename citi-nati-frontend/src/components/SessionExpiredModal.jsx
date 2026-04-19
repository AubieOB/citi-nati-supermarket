import React, { useCallback, useEffect, useState } from 'react';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.55)',
  zIndex: 5000,
  display: 'grid',
  placeItems: 'center',
  padding: '1rem',
};

const panelStyle = {
  width: 'min(460px, 94vw)',
  border: '1px solid #cbd5e1',
  borderRadius: '14px',
  backgroundColor: '#ffffff',
  boxShadow: '0 20px 48px rgba(15, 23, 42, 0.32)',
  overflow: 'hidden',
};

const buttonBaseStyle = {
  borderRadius: '9px',
  padding: '0.58rem 0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const defaultRedirect = '/login?reason=session-expired';

const SessionExpiredModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('Session expired. Please login again.');
  const [redirectTo, setRedirectTo] = useState(defaultRedirect);

  useEffect(() => {
    const handleSessionExpired = (event) => {
      const detail = event?.detail || {};
      setMessage(String(detail.message || 'Session expired. Please login again.'));
      setRedirectTo(String(detail.redirectTo || defaultRedirect));
      setIsOpen(true);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('app:session-expired', handleSessionExpired);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('app:session-expired', handleSessionExpired);
      }
    };
  }, []);

  const handleLoginRedirect = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.assign(redirectTo || defaultRedirect);
    }
  }, [redirectTo]);

  if (!isOpen) return null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Session expired">
      <div style={panelStyle}>
        <div style={{ padding: '1rem 1rem 0.85rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <i className="fas fa-clock-rotate-left" style={{ color: '#b91c1c' }}></i>
          <div style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 800 }}>Session Expired</div>
        </div>

        <div style={{ padding: '1rem', color: '#334155', lineHeight: 1.5, fontSize: '0.93rem' }}>
          {message}
        </div>

        <div style={{ padding: '0 1rem 1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.55rem' }}>
          <button
            type="button"
            onClick={handleLoginRedirect}
            style={{
              ...buttonBaseStyle,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
            }}
          >
            Okay
          </button>
          <button
            type="button"
            onClick={handleLoginRedirect}
            style={{
              ...buttonBaseStyle,
              border: '1px solid #2563eb',
              backgroundColor: '#2563eb',
              color: '#ffffff',
            }}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiredModal;
