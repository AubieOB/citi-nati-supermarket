import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import logo from '../../assets/citi-nati-logo.png.png';

const DesktopNavbar = ({ onCartClick, onAccountClick, navigate }) => {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { cartCount } = useCart();

  const isActive = (path) => {
    return location.pathname === path;
  };

  const getDashboardPath = () => {
    if (!user) return null;
    if (user.role === 'admin') return '/admin';
    if (user.role === 'driver') return '/driver';
    return null;
  };

  const dashboardPath = getDashboardPath();

  const handleLogoClick = () => {
    navigate('/');
  };

  return (
    <nav className="desktop-navbar">
      {/* Logo */}
      <img 
        src={logo} 
        alt="Citi-Nati Logo" 
        className="desktop-navbar__logo"
        onClick={handleLogoClick}
        title="Go to Home"
        role="button"
        tabIndex="0"
      />

      {/* Navigation Items */}
      <div className="desktop-navbar__items">
        {/* Home */}
        <Link 
          to="/" 
          className={`desktop-navbar__item ${isActive('/') ? 'desktop-navbar__item--active' : ''}`}
          aria-label="Home"
          title="Go to Home"
        >
          <span>Home</span>
        </Link>

        {/* Products */}
        <Link 
          to="/products" 
          className={`desktop-navbar__item ${isActive('/products') ? 'desktop-navbar__item--active' : ''}`}
          aria-label="Products"
          title="Browse Products"
        >
          <span>Products</span>
        </Link>

        {/* Cart */}
        <button 
          className={`desktop-navbar__item desktop-navbar__item--icon ${isActive('/cart') ? 'desktop-navbar__item--active' : ''}`}
          onClick={onCartClick}
          aria-label={`Cart with ${cartCount} items`}
          title="View Cart"
        >
          <i className="fas fa-shopping-cart"></i>
          {cartCount > 0 && (
            <span className="desktop-navbar__badge">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>

        {/* My Orders or Dashboard */}
        {isAuthenticated ? (
          <>
            {user?.role === 'user' ? (
              <Link 
                to="/my-orders" 
                className={`desktop-navbar__item desktop-navbar__item--icon ${isActive('/my-orders') ? 'desktop-navbar__item--active' : ''}`}
                aria-label="My Orders"
                title="View My Orders"
              >
                <i className="fas fa-receipt"></i>
              </Link>
            ) : dashboardPath ? (
              <Link 
                to={dashboardPath} 
                className={`desktop-navbar__item desktop-navbar__item--icon ${isActive(dashboardPath) ? 'desktop-navbar__item--active' : ''}`}
                aria-label={user?.role === 'admin' ? 'Admin Dashboard' : 'Driver Dashboard'}
                title={user?.role === 'admin' ? 'Admin Dashboard' : 'Driver Dashboard'}
              >
                <i className="fas fa-tachometer-alt"></i>
              </Link>
            ) : null}
          </>
        ) : null}

        {/* Account / Auth */}
        <button 
          className="desktop-navbar__item desktop-navbar__item--icon"
          onClick={onAccountClick}
          aria-label={isAuthenticated ? 'Account' : 'Login'}
          title={isAuthenticated ? 'Account' : 'Login'}
        >
          <i className={`fas ${isAuthenticated ? 'fa-user-circle' : 'fa-sign-in-alt'}`}></i>
        </button>
      </div>
    </nav>
  );
};

export default DesktopNavbar;
