import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import logo from '../../assets/citi-nati-logo.png.png';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [showAccountLabel, setShowAccountLabel] = useState(false);
  const popupRef = useRef(null);
  const menuRef = useRef(null);
  const { user, isAuthenticated, logout, isLoading: authLoading } = useAuth();
  const { cartCount, fetchCartCount } = useCart();
  const navigate = useNavigate();
  const { modal, closeModal, showConfirm } = useModal();

  // Fetch cart count when user logs in
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchCartCount();
    }
  }, [isAuthenticated, authLoading, fetchCartCount]);

  // Close account popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close if clicking the logout button
      if (event.target.getAttribute?.('data-logout') === 'true' || event.target.closest('[data-logout="true"]')) {
        return;
      }

      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowEmailPopup(false);
      }
    };

    if (showEmailPopup) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showEmailPopup]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        // Don't close if clicking the hamburger button itself
        const hamburger = document.querySelector('.header__hamburger');
        if (hamburger && !hamburger.contains(event.target)) {
          setMenuOpen(false);
        }
      }
    };

    if (menuOpen) {
      // Add menu-open class to body to prevent scrolling
      document.body.classList.add('menu-open');
      
      // Use both touchstart and click to handle mobile and desktop
      document.addEventListener('touchstart', handleClickOutside, true);
      document.addEventListener('click', handleClickOutside, true);
      return () => {
        document.body.classList.remove('menu-open');
        document.removeEventListener('touchstart', handleClickOutside, true);
        document.removeEventListener('click', handleClickOutside, true);
      };
    } else {
      // Ensure menu-open class is removed when menu closes
      document.body.classList.remove('menu-open');
    }
  }, [menuOpen]);

  const toggleMenu = (e) => {
    // Prevent event bubbling when opening menu
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setMenuOpen(!menuOpen);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const handleLogout = () => {
    showConfirm(
      'Confirm Logout',
      'Are you sure you want to log out?',
      () => {
        logout();
        closeMenu();
        setShowEmailPopup(false);
        navigate('/login');
      }
    );
  };

  /**
   * Get dashboard link based on user role
   * Roles: admin, driver, user
   */
  const getDashboardLink = () => {
    if (!user) return null;

    // Debug: Log auth state
    console.log("Auth state:", { isAuthenticated, role: user?.role });

    if (user.role === 'admin') {
      return { path: '/admin', label: 'Admin Dashboard' };
    }

    if (user.role === 'driver') {
      return { path: '/driver', label: 'Driver Dashboard' };
    }

    // USER role doesn't have dashboard
    return null;
  };

  // Get initials from user name (first letter of first name + first letter of last name)
  const getInitials = () => {
    if (!user || !user.name) return '?';
    const parts = user.name.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  const dashboardLink = getDashboardLink();

  return (
    <header className="header">
      <Link to="/" className="header__logo" onClick={closeMenu} style={{ marginLeft: '-2rem', paddingLeft: '2rem' }}>
        <img 
          src={logo} 
          alt="Citi-Nati Logo" 
          style={{ height: 'clamp(40px, 8vw, 60px)', marginLeft: '0', marginRight: '0.1rem', verticalAlign: 'middle' }}
        />
        <span style={{ display: 'flex', alignItems: 'center', gap: '0', fontSize: 'clamp(14px, 3vw, 20px)', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#5B4B8A', fontWeight: '700' }}>Citi</span>
          <span style={{ color: '#2D8659', fontWeight: '700' }}>-Nati Supermarket</span>
        </span>
      </Link>

      {/* Desktop Navigation */}
      <nav className="header__nav">
        <Link to="/" className="header__link">
          Home
        </Link>
        <Link to="/products" className="header__link">
          Products
        </Link>
        <Link to="/cart" className="header__link">
          <i className="fas fa-shopping-cart" style={{ marginRight: '0.5rem' }}></i>
          Cart
          {cartCount > 0 && (
            <span
              style={{
                marginLeft: '0.5rem',
                backgroundColor: '#ff3860',
                color: 'white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                minWidth: '20px',
              }}
            >
              {cartCount}
            </span>
          )}
        </Link>

        {isAuthenticated ? (
          <>
            {/* Show role-based dashboard link */}
            {dashboardLink && (
              <Link to={dashboardLink.path} className="header__link">
                {dashboardLink.label}
              </Link>
            )}

            {/* Show My Orders link for users */}
            {user?.role === 'user' && (
              <Link to="/my-orders" className="header__link">
                <i className="fas fa-box" style={{ marginRight: '0.5rem' }}></i>
                My Orders
              </Link>
            )}

            {/* Avatar Circle with Email and Logout Popup */}
            <div
              ref={popupRef}
              style={{ position: 'relative', display: 'inline-block' }}
              onMouseEnter={() => setShowAccountLabel(true)}
              onMouseLeave={() => setShowAccountLabel(false)}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmailPopup(!showEmailPopup);
                }}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#ff3860',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '18px',
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
                {/* Initial Letter Only */}
                {getInitials()[0]}
              </div>

              {/* Account Label - Shows on hover */}
              {showAccountLabel && !showEmailPopup && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50px',
                    right: '0',
                    backgroundColor: '#333',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    zIndex: 999,
                  }}
                >
                  Account
                </div>
              )}

              {/* Email Popup with Logout - Shows on click only */}
              {showEmailPopup && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '50px',
                    right: '0',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 1000,
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

                  {/* Logout Button in Popup */}
                  <button
                    data-logout="true"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                      handleLogout();
                    }}
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
          </>
        ) : (
          <>
            <Link to="/login" className="header__link">
              Login
            </Link>
            <Link to="/register" className="header__link">
              Register
            </Link>
          </>
        )}
      </nav>

      {/* Mobile Hamburger */}
      <div 
        className={`header__hamburger ${menuOpen ? 'header__hamburger--open' : ''}`} 
        onClick={toggleMenu}
        role="button"
        tabIndex="0"
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleMenu(e);
          }
        }}
      >
        <span></span>
        <span></span>
        <span></span>
      </div>

      {/* Mobile Menu */}
      <nav ref={menuRef} className={`header__mobile-menu ${menuOpen ? 'header__mobile-menu--open' : ''}`}>
        <Link to="/" className="header__link" onClick={closeMenu}>
          Home
        </Link>
        <Link to="/products" className="header__link" onClick={closeMenu}>
          Products
        </Link>
        <Link to="/cart" className="header__link" onClick={closeMenu}>
          <i className="fas fa-shopping-cart" style={{ marginRight: '0.5rem' }}></i>
          Cart
          {cartCount > 0 && (
            <span
              style={{
                marginLeft: '0.5rem',
                backgroundColor: '#ff3860',
                color: 'white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                minWidth: '20px',
              }}
            >
              {cartCount}
            </span>
          )}
        </Link>

        {isAuthenticated ? (
          <>
            {/* Show role-based dashboard link */}
            {dashboardLink && (
              <Link to={dashboardLink.path} className="header__link" onClick={closeMenu}>
                {dashboardLink.label}
              </Link>
            )}

            {/* Show My Orders link for users */}
            {user?.role === 'user' && (
              <Link to="/my-orders" className="header__link" onClick={closeMenu}>
                <i className="fas fa-box" style={{ marginRight: '0.5rem' }}></i>
                My Orders
              </Link>
            )}

            {/* Avatar + Email Popup for mobile */}
            <div ref={popupRef} style={{ padding: '1rem', position: 'relative' }}>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmailPopup(!showEmailPopup);
                }}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#ff3860',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  margin: '0 auto',
                  transition: 'transform 0.2s ease',
                }}
              >
                {getInitials()[0]}
              </div>

              {/* Email and Logout in Popup for mobile */}
              {showEmailPopup && (
                <div
                  style={{
                    backgroundColor: '#f5f5f5',
                    padding: '12px',
                    borderRadius: '4px',
                    marginTop: '10px',
                    textAlign: 'center',
                    zIndex: 1001,
                    position: 'relative',
                  }}
                >
                  {/* User Name */}
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#333',
                      marginBottom: '6px',
                      wordBreak: 'break-word',
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
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleLogout();
                    }}
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
                      pointerEvents: 'auto',
                      WebkitTouchCallout: 'auto',
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <Link to="/login" className="header__link" onClick={closeMenu}>
              Login
            </Link>
            <Link to="/register" className="header__link" onClick={closeMenu}>
              Register
            </Link>
          </>
        )}
      </nav>
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        showCancelButton={modal.showCancelButton}
      />
    </header>
  );
};

export default Header;
