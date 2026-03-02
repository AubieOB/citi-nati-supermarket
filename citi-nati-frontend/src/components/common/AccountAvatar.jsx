import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useModal } from '../../hooks/useModal.js';

const AccountAvatar = ({ bgColor = '#ff3860', size = '40px', fontSize = '18px' }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const popupRef = useRef(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showConfirm } = useModal();

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowPopup(false);
      }
    };

    if (showPopup) {
      const timerId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      
      return () => {
        clearTimeout(timerId);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showPopup]);

  const handleLogout = () => {
    showConfirm(
      'Confirm Logout',
      'Are you sure you want to log out?',
      () => {
        logout();
        setShowPopup(false);
        navigate('/login');
      }
    );
  };

  // Get initials from user name
  const getInitials = () => {
    if (!user || !user.name) return '?';
    const parts = user.name.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  if (!user) return null;

  return (
    <div
      ref={popupRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowLabel(true)}
      onMouseLeave={() => setShowLabel(false)}
    >
      {/* Avatar Circle */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setShowPopup(!showPopup);
        }}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: bgColor,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: fontSize,
          fontWeight: 'bold',
          position: 'relative',
          transition: 'transform 0.2s ease',
          pointerEvents: 'auto',
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
        }}
      >
        {getInitials()[0]}
      </div>

      {/* Account Label - Shows on hover */}
      {showLabel && !showPopup && (
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            right: '0',
            backgroundColor: '#333',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 9999,
          }}
        >
          Account
        </div>
      )}

      {/* Account Popup - Shows on click */}
      {showPopup && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '60px',
            right: '0',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 10000,
            minWidth: '220px',
            pointerEvents: 'auto',
          }}
        >
          {/* User Name */}
          <div
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#333',
              marginBottom: '6px',
            }}
          >
            {user.name}
          </div>

          {/* Email */}
          <div
            style={{
              fontSize: '13px',
              color: '#666',
              marginBottom: '10px',
              wordBreak: 'break-word',
            }}
          >
            {user.email}
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#ff3860',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background-color 0.2s ease',
              pointerEvents: 'auto',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#e82860';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#ff3860';
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountAvatar;
