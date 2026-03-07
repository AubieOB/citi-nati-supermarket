import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import logo from '../../assets/citi-nati-logo.png.png';

const DesktopFilterNav = ({ onCartClick, onAccountClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
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
    <div className="desktop-filter-nav">
      {/* Logo */}
      <img 
        src={logo} 
        alt="Citi-Nati Logo" 
        className="filter-container__logo"
        onClick={handleLogoClick}
        title="Go to Home"
        style={{ display: 'block' }}
      />

      {/* Home */}
      <Link 
        to="/" 
        className={`desktop-filter-nav__item ${isActive('/') ? 'desktop-filter-nav__item--active' : ''}`}
        aria-label="Home"
        title="Go to Home"
      >
        <i className="fas fa-home"></i>
        <span className="desktop-filter-nav__label">Home</span>
      </Link>

      {/* Products */}
      <Link 
        to="/products" 
        className={`desktop-filter-nav__item ${isActive('/products') ? 'desktop-filter-nav__item--active' : ''}`}
        aria-label="Products"
        title="Browse Products"
      >
        <i className="fas fa-box"></i>
        <span className="desktop-filter-nav__label">Products</span>
      </Link>

      {/* Cart */}
      <button 
        className={`desktop-filter-nav__item ${isActive('/cart') ? 'desktop-filter-nav__item--active' : ''}`}
        onClick={onCartClick}
        aria-label={`Cart with ${cartCount} items`}
        title="View Cart"
      >
        <i className="fas fa-shopping-cart"></i>
        <span className="desktop-filter-nav__label">Cart</span>
        {cartCount > 0 && (
          <span className="desktop-filter-nav__badge">
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
              className={`desktop-filter-nav__item ${isActive('/my-orders') ? 'desktop-filter-nav__item--active' : ''}`}
              aria-label="My Orders"
              title="View My Orders"
            >
              <i className="fas fa-receipt"></i>
              <span className="desktop-filter-nav__label">Orders</span>
            </Link>
          ) : dashboardPath ? (
            <Link 
              to={dashboardPath} 
              className={`desktop-filter-nav__item ${isActive(dashboardPath) ? 'desktop-filter-nav__item--active' : ''}`}
              aria-label={user?.role === 'admin' ? 'Admin Dashboard' : 'Driver Dashboard'}
              title={user?.role === 'admin' ? 'Admin Dashboard' : 'Driver Dashboard'}
            >
              <i className="fas fa-tachometer-alt"></i>
              <span className="desktop-filter-nav__label">{user?.role === 'admin' ? 'Admin' : 'Driver'}</span>
            </Link>
          ) : null}
        </>
      ) : null}

      {/* Account / Auth */}
      <button 
        className="desktop-filter-nav__item"
        onClick={onAccountClick}
        aria-label={isAuthenticated ? 'Account' : 'Login'}
        title={isAuthenticated ? 'Account' : 'Login'}
      >
        <i className={`fas ${isAuthenticated ? 'fa-user-circle' : 'fa-sign-in-alt'}`}></i>
        <span className="desktop-filter-nav__label">{isAuthenticated ? 'Account' : 'Login'}</span>
      </button>
    </div>
  );
};

export default DesktopFilterNav;
