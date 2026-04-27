import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import logo from '../../assets/citi-nati-logo.png.png';
import { getDashboardPathForUser } from '../../utils/permissions.js';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [showAccountLabel, setShowAccountLabel] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const popupRef = useRef(null);
  const menuRef = useRef(null);
  const { user, isAuthenticated, logout, isLoading: authLoading } = useAuth();
  const { cartCount, fetchCartCount, resetCart } = useCart();
  const navigate = useNavigate();
  const { modal, closeModal, showConfirm } = useModal();

  // Scroll detection for header elevation
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch cart count on mount and when auth is ready (only if authenticated)
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchCartCount();
    }
  }, [authLoading, isAuthenticated, fetchCartCount]);

  // Close account popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is inside the popup
      const isInsidePopup = popupRef.current && popupRef.current.contains(event.target);
      
      // Only close if clicking outside the popup
      if (!isInsidePopup) {
        setShowEmailPopup(false);
      }
    };

    if (showEmailPopup) {
      // Add small delay to ensure popup is rendered before listener activates
      const timerId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      
      return () => {
        clearTimeout(timerId);
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
        resetCart();
        closeMenu();
        setShowEmailPopup(false);
        navigate('/login');
      }
    );
  };

  /**
   * Get dashboard link based on user role
   * Roles: admin, driver, cashier, user
   */
  const getDashboardLink = () => {
    if (!user) return null;

    // Debug: Log auth state
    console.log("Auth state:", { isAuthenticated, role: user?.role });

    const dashboardPath = getDashboardPathForUser(user);
    if (!dashboardPath) return null;

    if (dashboardPath === '/admin') {
      return { path: '/admin', label: 'Admin Dashboard' };
    }

    if (dashboardPath === '/driver') {
      return { path: '/driver', label: 'Driver Dashboard' };
    }

    return { path: '/cashier', label: 'Cashier Dashboard' };
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
    <header className={`header${isScrolled ? ' header--scrolled' : ''}`}>
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
       <NavLink 
          to="/" 
          end
          className={({ isActive }) => 
            `header__link ${isActive ? 'header__link--active' : ''}`
          }
        >
          Home
        </NavLink>
        <NavLink 
          to="/products"
          className={({ isActive }) => 
            `header__link ${isActive ? 'header__link--active' : ''}`
          }
        >
          Products
        </NavLink>
        <NavLink 
          to="/about" 
          className={({ isActive }) => 
            `header__link ${isActive ? 'header__link--active' : ''}`
          }
        >
          About Us
        </NavLink>
        <NavLink 
        to="/cart"
        className={({ isActive }) => 
          `header__link ${isActive ? 'header__link--active' : ''}`
        }
      >
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
        </NavLink>

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
              <Link to="/my-orders" className={({ isActive }) => 
                `header__link ${isActive ? 'header__link--active' : ''}`
              }>
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
          </>
        ) : (
          <>
            <NavLink 
            to="/login"
            className={({ isActive }) => 
              `header__link ${isActive ? 'header__link--active' : ''}`
            }
          >
            Login
          </NavLink>
            <NavLink 
              to="/register"
              className={({ isActive }) => 
                `header__link ${isActive ? 'header__link--active' : ''}`
              }
            >
              Register
            </NavLink>
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
        <NavLink to="/" 
         onClick={closeMenu}
         className={({ isActive }) => 
            `header__link ${isActive ? 'header__link--active' : ''}`
          }
        >
          Home
        </NavLink>
        <NavLink 
          to="/products"
          onClick={closeMenu}
          className={({ isActive }) => 
            `header__link ${isActive ? 'header__link--active' : ''}`
          }
        >
          Products
        </NavLink>
        <NavLink 
          to="/about" 
          onClick={closeMenu}
          className={({ isActive }) => 
            `header__link ${isActive ? 'header__link--active' : ''}`
          }
        >
          About Us
        </NavLink>
        <NavLink 
  to="/cart"
  onClick={closeMenu}
  className={({ isActive }) => 
    `header__link ${isActive ? 'header__link--active' : ''}`
  }
>
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
</NavLink>

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
              <NavLink to="/my-orders" className={({ isActive }) => 
                `header__link ${isActive ? 'header__link--active' : ''}`
              } onClick={closeMenu}>
                <i className="fas fa-box" style={{ marginRight: '0.5rem' }}></i>
                My Orders
              </NavLink>
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
            <NavLink to="/login" className={({ isActive }) => 
            `header__link ${isActive ? 'header__link--active' : ''}`
          }
           onClick={closeMenu}>
              Login
            </NavLink>
            <NavLink to="/register" className={({ isActive }) => 
            `header__link ${isActive ? 'header__link--active' : ''}`
          }
           onClick={closeMenu}>
              Register
            </NavLink>
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

