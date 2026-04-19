import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { getDashboardPathForUser } from '../../utils/permissions.js';

const MobileBottomNav = ({ onCartClick, onAccountClick }) => {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { cartCount } = useCart();

  const isActive = (path) => {
    return location.pathname === path;
  };

  const dashboardPath = getDashboardPathForUser(user);

  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Mobile bottom navigation">
      {/* Home */}
      <Link 
        to="/" 
        className={`mobile-bottom-nav__item ${isActive('/') ? 'mobile-bottom-nav__item--active' : ''}`}
        aria-label="Home"
        title="Home"
      >
        <i className="fas fa-home"></i>
        <span className="mobile-bottom-nav__label">Home</span>
      </Link>

      {/* Products */}
      <Link 
        to="/products" 
        className={`mobile-bottom-nav__item ${isActive('/products') ? 'mobile-bottom-nav__item--active' : ''}`}
        aria-label="Products"
        title="Products"
      >
        <i className="fas fa-box"></i>
        <span className="mobile-bottom-nav__label">Products</span>
      </Link>

      {/* Cart */}
      <button 
        className={`mobile-bottom-nav__item ${isActive('/cart') ? 'mobile-bottom-nav__item--active' : ''}`}
        onClick={onCartClick}
        aria-label={`Cart with ${cartCount} items`}
        title="Cart"
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <i className="fas fa-shopping-cart"></i>
          {cartCount > 0 && (
            <span className="mobile-bottom-nav__badge">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </div>
        <span className="mobile-bottom-nav__label">Cart</span>
      </button>

      {/* My Orders or Dashboard */}
      {isAuthenticated ? (
        <>
          {!dashboardPath ? (
            <Link 
              to="/my-orders" 
              className={`mobile-bottom-nav__item ${isActive('/my-orders') ? 'mobile-bottom-nav__item--active' : ''}`}
              aria-label="My Orders"
              title="My Orders"
            >
              <i className="fas fa-receipt"></i>
              <span className="mobile-bottom-nav__label">Orders</span>
            </Link>
          ) : dashboardPath ? (
            <Link 
              to={dashboardPath} 
              className={`mobile-bottom-nav__item ${isActive(dashboardPath) ? 'mobile-bottom-nav__item--active' : ''}`}
              aria-label={
                dashboardPath === '/admin'
                  ? 'Admin Dashboard'
                  : dashboardPath === '/driver'
                    ? 'Driver Dashboard'
                    : 'Cashier Dashboard'
              }
              title={
                dashboardPath === '/admin'
                  ? 'Admin Dashboard'
                  : dashboardPath === '/driver'
                    ? 'Driver Dashboard'
                    : 'Cashier Dashboard'
              }
            >
              <i className="fas fa-tachometer-alt"></i>
              <span className="mobile-bottom-nav__label">Dashboard</span>
            </Link>
          ) : null}
        </>
      ) : null}

      {/* Account / Auth */}
      <button 
        className="mobile-bottom-nav__item mobile-bottom-nav__item--account"
        onClick={onAccountClick}
        aria-label={isAuthenticated ? 'Account' : 'Login'}
        title={isAuthenticated ? 'Account' : 'Login'}
      >
        <i className={`fas ${isAuthenticated ? 'fa-user-circle' : 'fa-sign-in-alt'}`}></i>
        <span className="mobile-bottom-nav__label">
          {isAuthenticated ? 'Account' : 'Login'}
        </span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
