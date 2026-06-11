import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import { cartValidation } from '../../utils/backendAlignment.js';
import { resolveEffectiveStock } from '../../utils/stockResolver.js';
import logo from '../../assets/citi-nati-full-logo.png';
import { getDashboardPathForUser } from '../../utils/permissions.js';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const STOREFRONT_LOCATION_CODE = String(import.meta.env.VITE_STOREFRONT_LOCATION_CODE || 'SH').trim().toUpperCase();
const STOREFRONT_BRANCH_CODE = String(import.meta.env.VITE_STOREFRONT_BRANCH_CODE || 'BLANTYRE').trim().toUpperCase();
const SEARCH_SUGGESTION_LIMIT = 6;

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTouched, setSearchTouched] = useState(false);
  const [addingProductId, setAddingProductId] = useState(null);
  const [addedProductId, setAddedProductId] = useState(null);
  const popupRef = useRef(null);
  const menuRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const searchAbortRef = useRef(null);
  const searchRequestIdRef = useRef(0);
  const addedFeedbackTimerRef = useRef(null);
  const { user, isAuthenticated, logout, isLoading: authLoading } = useAuth();
  const { cartCount, fetchCartCount, updateCartCount, resetCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const { modal, closeModal, showConfirm, showError } = useModal();
  const isOrderFlowHeader = location.pathname === '/cart' || location.pathname === '/checkout';

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchCartCount();
    }
  }, [authLoading, isAuthenticated, fetchCartCount]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowEmailPopup(false);
      }

      if (!event.target.closest('.header__search-area')) {
        setSearchTouched(false);
      }
    };

    if (showEmailPopup || searchTouched) {
      const timerId = setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
      return () => {
        clearTimeout(timerId);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showEmailPopup, searchTouched]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const hamburger = document.querySelector('.header__hamburger');
      if (menuRef.current && !menuRef.current.contains(event.target) && !hamburger?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.body.classList.add('menu-open');
      document.addEventListener('touchstart', handleClickOutside, true);
      document.addEventListener('click', handleClickOutside, true);
      return () => {
        document.body.classList.remove('menu-open');
        document.removeEventListener('touchstart', handleClickOutside, true);
        document.removeEventListener('click', handleClickOutside, true);
      };
    }

    document.body.classList.remove('menu-open');
  }, [menuOpen]);

  useEffect(() => {
    const query = searchTerm.trim();

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!searchOpen || query.length < 2) {
      setSearchSuggestions([]);
      setSearchLoading(false);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }

      const requestId = ++searchRequestIdRef.current;
      searchAbortRef.current = new AbortController();

      const params = new URLSearchParams();
      params.append('page', '1');
      params.append('pageSize', SEARCH_SUGGESTION_LIMIT);
      params.append('search', query);
      params.append('branchCode', STOREFRONT_BRANCH_CODE);
      params.append('locationCode', STOREFRONT_LOCATION_CODE);

      api.get(`/products?${params.toString()}`, { signal: searchAbortRef.current.signal })
        .then((response) => {
          if (requestId !== searchRequestIdRef.current) return;
          const products = Array.isArray(response.data?.products) ? response.data.products : [];
          setSearchSuggestions(products.filter((product) => !product.hideFromProductsPage).slice(0, SEARCH_SUGGESTION_LIMIT));
        })
        .catch((err) => {
          if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
            console.warn('[HEADER SEARCH] Product suggestions failed:', err.message);
          }
          if (requestId === searchRequestIdRef.current) {
            setSearchSuggestions([]);
          }
        })
        .finally(() => {
          if (requestId === searchRequestIdRef.current) {
            setSearchLoading(false);
          }
        });
    }, 220);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchTerm, searchOpen]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      if (addedFeedbackTimerRef.current) {
        clearTimeout(addedFeedbackTimerRef.current);
      }
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const trackProductInteraction = (product, action, query = '') => {
    if (!product?.id) return;
    api.post('/products/interactions', {
      productId: product.id,
      action,
      query,
      branchCode: STOREFRONT_BRANCH_CODE,
      locationCode: STOREFRONT_LOCATION_CODE,
    }).catch(() => {});
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const query = searchTerm.trim();
    navigate(query ? `/products?search=${encodeURIComponent(query)}` : '/products');
    setSearchOpen(false);
    setSearchTouched(false);
    closeMenu();
  };

  const handleQuickAddToCart = async (product) => {
    if (!isAuthenticated) {
      showError('Authentication Required', 'Please log in to add items to your cart');
      return;
    }

    const availableStock = resolveEffectiveStock(product);
    if (availableStock <= 0) {
      showError('Out of Stock', `${product.name} is out of stock`);
      return;
    }

    const validation = cartValidation.validateAddToCart({
      productId: product.id,
      quantity: 1,
    });

    if (!validation.isValid) {
      showError('Invalid Request', 'Invalid cart request:\n' + validation.errors.join('\n'));
      return;
    }

    try {
      setAddingProductId(product.id);
      await api.post('/cart', {
        productId: product.id,
        quantity: 1,
      });
      trackProductInteraction(product, 'add_to_cart', searchTerm.trim());
      setAddedProductId(product.id);
      if (addedFeedbackTimerRef.current) {
        clearTimeout(addedFeedbackTimerRef.current);
      }
      addedFeedbackTimerRef.current = setTimeout(() => setAddedProductId(null), 1600);
      await updateCartCount();
    } catch (err) {
      if (err.response?.status === 401) {
        showError('Session Expired', 'Session expired. Please log in again.');
        logout();
        resetCart();
        navigate('/login');
        return;
      }

      const errorMsg = err.response?.data?.error;
      showError('Error', `Error adding to cart: ${errorMsg || 'Unknown error'}`);
    } finally {
      setAddingProductId(null);
    }
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

  const getDashboardLink = () => {
    if (!user) return null;

    const dashboardPath = getDashboardPathForUser(user);
    if (!dashboardPath) return null;

    if (dashboardPath === '/admin') return { path: '/admin', label: 'Admin Dashboard' };
    if (dashboardPath === '/driver') return { path: '/driver', label: 'Driver Dashboard' };
    return { path: '/cashier', label: 'Cashier Dashboard' };
  };

  const getInitial = () => {
    const name = user?.name?.trim();
    return name ? name[0].toUpperCase() : '?';
  };

  const dashboardLink = getDashboardLink();
  const showSearchPanel = searchOpen && searchTouched && searchTerm.trim().length > 0;

  const renderSearchSuggestions = () => {
    if (!showSearchPanel) return null;

    const query = searchTerm.trim();

    return (
      <div className="header__search-results" role="listbox" aria-label="Product search suggestions">
        {query.length < 2 && (
          <div className="header__search-state">Type at least 2 characters to search products.</div>
        )}

        {query.length >= 2 && !searchLoading && searchSuggestions.length === 0 && (
          <div className="header__search-state">No products found for "{query}".</div>
        )}

        {query.length >= 2 && searchSuggestions.map((product) => {
          const availableStock = resolveEffectiveStock(product);
          const price = Number(product.finalPrice || product.price || 0);
          const isAdding = addingProductId === product.id;
          const wasAdded = addedProductId === product.id;

          return (
            <div className="header__search-product" key={product.id} role="option" aria-selected="false">
              <Link
                to={`/products?search=${encodeURIComponent(query)}`}
                className="header__search-product-link"
                onClick={() => {
                  trackProductInteraction(product, 'view', query);
                  setSearchTouched(false);
                  setSearchOpen(false);
                  closeMenu();
                }}
              >
                <span className="header__search-product-image">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" crossOrigin="anonymous" />
                  ) : (
                    <i className="fas fa-basket-shopping" aria-hidden="true"></i>
                  )}
                </span>
                <span className="header__search-product-copy">
                  <strong>{product.name}</strong>
                  <small className={availableStock > 0 ? '' : 'is-out-of-stock'}>
                    {product.category || 'Product'} · {availableStock > 0 ? `In stock (${availableStock})` : 'Out of stock'}
                  </small>
                  <em>{formatMWK(price)}</em>
                </span>
              </Link>

              <button
                type="button"
                className={`header__search-cart-button${wasAdded ? ' is-added' : ''}`}
                onClick={() => handleQuickAddToCart(product)}
                disabled={availableStock <= 0 || isAdding}
                aria-label={`Add ${product.name} to cart`}
                title={availableStock > 0 ? 'Add to cart' : 'Out of stock'}
              >
                <i className={`fas ${isAdding ? 'fa-spinner fa-spin' : wasAdded ? 'fa-check' : 'fa-cart-plus'}`} aria-hidden="true"></i>
              </button>
            </div>
          );
        })}

        {query.length >= 2 && (
          <button type="submit" className="header__search-view-all">
            View all results for "{query}"
          </button>
        )}
      </div>
    );
  };

  const navLinks = (
    <>
      <NavLink to="/" end className={({ isActive }) => `header__link ${isActive ? 'header__link--active' : ''}`} onClick={closeMenu}>
        Home
      </NavLink>
      <NavLink to="/products" className={({ isActive }) => `header__link ${isActive ? 'header__link--active' : ''}`} onClick={closeMenu}>
        Products
      </NavLink>
      <NavLink to="/about" className={({ isActive }) => `header__link ${isActive ? 'header__link--active' : ''}`} onClick={closeMenu}>
        About
      </NavLink>
      {isAuthenticated && user?.role === 'user' && (
        <NavLink to="/my-orders" className={({ isActive }) => `header__link ${isActive ? 'header__link--active' : ''}`} onClick={closeMenu}>
          Orders
        </NavLink>
      )}
      {dashboardLink && (
        <Link to={dashboardLink.path} className="header__link" onClick={closeMenu}>
          {dashboardLink.label}
        </Link>
      )}
    </>
  );

  return (
    <header className={`header${isScrolled ? ' header--scrolled' : ''}${isOrderFlowHeader ? ' header--order-flow' : ''}`}>
      <div className="header__top">
        <div className="header__top-inner">
          <Link to="/" className="header__logo" onClick={closeMenu} aria-label="Citi-Nati Supermarket home">
            <img src={logo} alt="Citi-Nati Logo" />
          </Link>

          {!isOrderFlowHeader && (
            <div className="header__top-nav" aria-label="Scrolled navigation">
              {navLinks}
            </div>
          )}

          <div className="header__info" aria-label="Store information">
            <div className="header__info-item">
              <i className="fas fa-location-dot" aria-hidden="true"></i>
              <span>
                <strong>Address</strong>
                Chinyonga, Blantyre
              </span>
            </div>
            <div className="header__info-item">
              <i className="fas fa-envelope" aria-hidden="true"></i>
              <span>
                <strong>Email</strong>
                info@citinati.com
              </span>
            </div>
            <div className="header__info-item">
              <i className="fas fa-phone" aria-hidden="true"></i>
              <span>
                <strong>Phone</strong>
                (+265) 888857188
              </span>
            </div>
          </div>
        </div>
      </div>

      {!isOrderFlowHeader && (
      <div className={`header__market-bar${isScrolled ? ' header__market-bar--hidden' : ''}`}>
        <div className="header__market-inner">
          <nav className="header__nav" aria-label="Primary navigation">
            {navLinks}
          </nav>

          <div className={`header__actions${searchOpen ? ' header__actions--search-open' : ''}`}>
            <div className="header__search-area">
              <form className={`header__search-drawer${searchOpen ? ' header__search-drawer--open' : ''}`} onSubmit={handleSearchSubmit} role="search">
                <button
                  type="button"
                  className="header__icon-button"
                  onClick={() => {
                    setSearchOpen((value) => !value);
                    setSearchTouched(true);
                  }}
                  aria-label={searchOpen ? 'Close search' : 'Open search'}
                  aria-expanded={searchOpen}
                >
                  <i className={`fas ${searchOpen ? 'fa-times' : 'fa-search'}`} aria-hidden="true"></i>
                </button>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSearchTouched(true);
                  }}
                  onFocus={() => setSearchTouched(true)}
                  placeholder="Search groceries..."
                  aria-label="Search products"
                />
                <button type="submit" className="header__search-submit">
                  Search
                </button>
                {renderSearchSuggestions()}
              </form>
            </div>

            <Link to="/cart" className="header__cart" onClick={closeMenu} aria-label={`Cart with ${cartCount} items`}>
              <i className="fas fa-shopping-cart" aria-hidden="true"></i>
              <span>Cart</span>
              {cartCount > 0 && <span className="header__badge">{cartCount > 99 ? '99+' : cartCount}</span>}
            </Link>

            {isAuthenticated ? (
              <div className="header__account" ref={popupRef}>
                <button
                  type="button"
                  className="header__avatar"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowEmailPopup((value) => !value);
                  }}
                  aria-label="Open account menu"
                  aria-expanded={showEmailPopup}
                >
                  {getInitial()}
                </button>

                {showEmailPopup && (
                  <div className="header__account-menu" onClick={(event) => event.stopPropagation()}>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                    <button type="button" onClick={handleLogout}>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="header__auth">
                <NavLink to="/login" className="header__login">
                  Login
                </NavLink>
                <NavLink to="/register" className="header__register">
                  Register
                </NavLink>
              </div>
            )}

            <button
              type="button"
              className={`header__hamburger ${menuOpen ? ' header__hamburger--open' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((value) => !value);
              }}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>
      </div>
      )}

      <nav ref={menuRef} className={`header__mobile-menu ${menuOpen ? 'header__mobile-menu--open' : ''}`} aria-label="Mobile navigation">
        {navLinks}
        {!isAuthenticated && (
          <div className="header__mobile-auth">
            <NavLink to="/login" className="header__login" onClick={closeMenu}>
              Login
            </NavLink>
            <NavLink to="/register" className="header__register" onClick={closeMenu}>
              Register
            </NavLink>
          </div>
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
