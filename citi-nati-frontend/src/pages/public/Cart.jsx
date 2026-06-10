import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { formatMWK } from '../../utils/currency.js';
import { cartValidation } from '../../utils/backendAlignment.js';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import '../../styles/global.css';

/**
 * Cart Page - Backend-Authoritative Cart System
 *
 * Contract Reference: src/contracts/backendContract.md → CART ENTITY
 *
 * 🧠 CORE PRINCIPLE: Backend is the single source of truth
 * - Prices are LOCKED when added (backend snapshots them)
 * - Totals are CALCULATED by backend (never frontend)
 * - Cart state updated via API calls (not local state)
 *
 * Frontend Responsibility: Display only
 * - Never calculate subtotals (query item.subtotal)
 * - Never calculate totals (use cart.total)
 * - Never modify locked prices
 * - Always trust backend values
 *
 * Endpoints Used:
 * - GET /api/cart (fetch cart with items and total)
 * - PUT /api/cart/update (update item quantity)
 */

const Cart = () => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summaryOffset, setSummaryOffset] = useState(0);
  const cartGuideRef = useRef(null);
  const summaryRef = useRef(null);
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { updateCartCount } = useCart();
  const { modal, closeModal, showError } = useModal();

  /**
   * Fetch cart on component mount
   * Contract: GET /api/cart (requires authentication)
   */
  useEffect(() => {
    const fetchCart = async () => {
      // 🔄 Wait for auth to finish initializing from localStorage
      if (authLoading) {
        return;
      }

      if (!isAuthenticated) {
        setError('You must be logged in to view your cart');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 1️⃣ FETCH: Use exact endpoint from API_QUICK_REFERENCE.md
        // api module automatically includes Authorization header
        const response = await api.get('/cart');
        const data = response.data;

        // 2️⃣ VALIDATE: Response structure per contract
        // Expected: { cartId, items: [...], total }
        if (!('cartId' in data) || !('items' in data) || !('total' in data)) {
          throw new Error('Invalid cart response structure');
        }

        // 3️⃣ VALIDATE: Items structure
        if (!Array.isArray(data.items)) {
          throw new Error('Cart items must be an array');
        }

        // 4️⃣ SET STATE: Exact backend response (no transformations)
        setCart(data);
      } catch (err) {
        // ❌ ERROR: Handle auth errors
        if (err.response?.status === 401) {
          setError('Session expired. Please login again.');
          logout();
          setCart(null);
          return;
        }

        console.error('❌ Error fetching cart:', err.message);
        setError(err.message);
        setCart(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCart();
  }, [authLoading, isAuthenticated, logout]);

  /**
   * Update item quantity (with optimistic UI)
   * Contract: PUT /api/cart/update with { productId, quantity }
   * Rules:
   * - quantity = 0 → delete item
   * - Don't calculate totals
   * - Trust backend response
   * - IMPORTANT: Maintain item order (no sorting)
   * - OPTIMISTIC: Update UI immediately, verify with backend
   */
  const handleQuantityChange = async (productId, newQuantity) => {
    if (newQuantity === undefined || newQuantity === null) return;

    try {
      // Convert to integer
      const quantity = parseInt(newQuantity);

      // Handle invalid input (empty field, NaN, etc)
      if (isNaN(quantity)) {
        showError('Invalid Input', 'Please enter a valid number');
        return;
      }

      // 5️⃣ VALIDATE: Check if quantity is negative
      if (quantity < 0) {
        showError('Invalid Quantity', 'Quantity cannot be negative');
        return;
      }

      // OPTIMISTIC UPDATE: Update UI immediately for instant feedback
      // Create optimistically updated cart
      const optimisticItems = cart.items.map(item => {
        if (item.productId === productId) {
          if (quantity === 0) {
            // Return null for deleted items
            return null;
          }
          // Update quantity and recalculate subtotal (item.price * quantity)
          return {
            ...item,
            quantity,
            subtotal: item.price * quantity
          };
        }
        return item;
      }).filter(item => item !== null); // Remove deleted items

      // Calculate optimistic total
      const optimisticSubtotal = optimisticItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
      const configuredVatRatePercent = Number(cart?.configuredVatRatePercent ?? cart?.vatRatePercent ?? 0);
      const vatEnabled = cart?.vatEnabled !== false;
      const appliedVatRatePercent = vatEnabled ? configuredVatRatePercent : 0;
      const optimisticVat = appliedVatRatePercent > 0
        ? Number(((optimisticSubtotal * appliedVatRatePercent) / (100 + appliedVatRatePercent)).toFixed(2))
        : 0;
      const optimisticTotal = Number(optimisticSubtotal.toFixed(2));

      // Update UI immediately (optimistic)
      setCart({
        ...cart,
        items: optimisticItems,
        subtotal: optimisticSubtotal,
        vat: optimisticVat,
        vatEnabled,
        configuredVatRatePercent,
        total: optimisticTotal
      });

      // BACKGROUND UPDATE: Send to backend without blocking UI
      // Send the update to backend in the background
      const updatePromise = api.put('/cart/update', {
        productId,
        quantity
      });

      // Don't await the update - let it happen in background
      // But handle errors if they occur
      updatePromise.catch(err => {
        // If backend update fails, revert to previous state
        console.error('❌ Error updating cart item:', err.message);
        
        // Revert optimistic update by refetching
        api.get('/cart')
          .then(response => {
            const backendCart = response.data;
            const orderedItems = cart.items
              .map(oldItem => {
                const backendItem = backendCart.items.find(bi => bi.productId === oldItem.productId);
                return backendItem || null;
              })
              .filter(item => item !== null);
            
            setCart({
              ...backendCart,
              items: orderedItems
            });
          })
          .catch(refetchErr => {
            console.error('❌ Error refetching cart after update failure:', refetchErr.message);
            showError('Error', 'Failed to update cart. Please refresh the page.');
          });
      }).finally(() => {
        // Update cart count in header (after update attempt)
        updateCartCount();
      });

      // Handle auth errors
      if (!(await updatePromise).ok && (await updatePromise).status === 401) {
        setError('Session expired. Please login again.');
        logout();
        return;
      }
    } catch (err) {
      console.error('❌ Error updating cart item:', err.message);
      showError('Error', `Error: ${err.message}`);
    }
  };

  /**
   * Remove item from cart (set quantity to 0)
   */
  const handleRemove = (productId) => {
    handleQuantityChange(productId, 0);
  };

  useEffect(() => {
    const updateSummaryPosition = () => {
      if (!cartGuideRef.current || !summaryRef.current || window.innerWidth <= 1020) {
        setSummaryOffset(0);
        return;
      }

      const guideRect = cartGuideRef.current.getBoundingClientRect();
      const summaryHeight = summaryRef.current.offsetHeight;
      const guideHeight = cartGuideRef.current.offsetHeight;
      const headerOffset = 122;
      const maxOffset = Math.max(0, guideHeight - summaryHeight - 8);
      const nextOffset = Math.round(Math.min(maxOffset, Math.max(0, headerOffset - guideRect.top)));

      setSummaryOffset(nextOffset);
    };

    let frameId = null;
    const handleScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        updateSummaryPosition();
        frameId = null;
      });
    };

    updateSummaryPosition();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [cart?.items?.length]);

  // 8️⃣ AUTH INITIALIZATION STATE
  if (authLoading) {
    return (
      <div className="page cart-page">
        <Container className="cart-shell">
          <div className="cart-guide-header">
            <h1>Your cart</h1>
          </div>
          <p className="storefront-loading-state cart-state">
            Verifying your session...
          </p>
        </Container>
      </div>
    );
  }

  // 9️⃣ LOADING STATE
  if (loading) {
    return (
      <div className="page cart-page">
        <Container className="cart-shell">
          <div className="cart-guide-header">
            <h1>Your cart</h1>
          </div>
          <p className="storefront-loading-state cart-state">
            Loading your cart...
          </p>
        </Container>
      </div>
    );
  }

  // 🔟 ERROR STATE
  if (error) {
    return (
      <div className="page cart-page">
        <Container className="cart-shell">
          <div className="cart-guide-header">
            <h1>Your cart</h1>
          </div>
          <div className="cart-message cart-message--error">
            <h3>Error</h3>
            <p>{error}</p>
          </div>
          <Link to="/products">
            <Button variant="primary" size="small">
              Continue Shopping
            </Button>
          </Link>
        </Container>
      </div>
    );
  }

  // 1️⃣1️⃣ EMPTY CART STATE
  if (!cart || cart.items.length === 0) {
    return (
      <div className="page cart-page">
        <Container className="cart-shell">
          <div className="cart-guide-header">
            <h1>Your cart</h1>
          </div>
          <div className="cart-message cart-message--empty">
            <h2>Your cart is empty</h2>
            <p>
              Start shopping to add items to your cart
            </p>
            <Link to="/products">
              <Button variant="primary" size="small">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  // 1️⃣1️⃣ RENDER: Cart with items (backend-authoritative)
  const vatLabel = cart?.vatEnabled === false
    ? 'VAT (disabled):'
    : `VAT (${Number(cart?.configuredVatRatePercent ?? cart?.vatRatePercent ?? 0).toFixed(1)}%):`;

  // MINIMUM ORDER VALIDATION
  const cartItemsSubtotal = Array.isArray(cart?.items)
    ? Number(cart.items.reduce((sum, item) => sum + Number(item?.subtotal ?? 0), 0).toFixed(2))
    : Number(cart?.itemsSubtotal ?? cart?.total ?? 0);
  const minimumOrderValue = Number(cart?.minimumOrderValue ?? 10000);
  const isBelowMinimumOrderValue = cartItemsSubtotal < minimumOrderValue;
  const amountNeededForMinimum = Number(Math.max(0, minimumOrderValue - cartItemsSubtotal).toFixed(2));

  return (
    <div className="page cart-page">
      <Container className="cart-shell">
        <div className="cart-guide-header">
          <div>
            <h1>Your cart</h1>
          </div>
          <Link to="/products" className="cart-continue-link">
            <i className="fas fa-arrow-left"></i>
            Continue shopping
          </Link>
        </div>

        <div className="cart-layout cart-guide-layout" ref={cartGuideRef}>
          {/* CART TABLE: Display items with backend prices */}
          <div className="cart-items-panel">
          <table className="cart-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit Price</th>
                <th>Quantity</th>
                <th>Subtotal</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {cart.items.map((item) => (
                <tr key={item.productId}>
                  {/* FIELD: name (from backend cart response) */}
                  <td data-label="Product">{item.name}</td>

                  {/* FIELD: price (LOCKED at time of add - never manipulate) */}
                  {/* ✅ Trust backend price, not product price from Products page */}
                  <td data-label="Unit Price">{formatMWK(item.price)}</td>

                  {/* FIELD: quantity (editable via handleQuantityChange) */}
                  <td data-label="Quantity">
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(item.productId, e.target.value)}
                      className="cart-quantity-input"
                      style={{
                        width: '58px',
                        padding: '0.32rem 0.2rem',
                        border: '1px solid #d6dee9',
                        borderRadius: '6px',
                        backgroundColor: '#fff',
                        transition: 'box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease',
                        cursor: 'text',
                        fontSize: '0.88rem',
                        textAlign: 'center'
                      }}
                      onFocus={(e) => {
                        e.target.style.backgroundColor = '#fff';
                        e.target.style.borderColor = '#5b4b8a';
                        e.target.style.boxShadow = '0 0 0 3px rgba(91, 75, 138, 0.12)';
                      }}
                      onBlur={(e) => {
                        e.target.style.backgroundColor = '#fff';
                        e.target.style.borderColor = '#d6dee9';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </td>

                  {/* FIELD: subtotal (from backend - NEVER calculate on frontend) */}
                  {/* ✅ This is item.quantity * item.price, calculated by backend */}
                  <td data-label="Subtotal">{formatMWK(item.subtotal)}</td>

                  {/* ACTION: Remove button */}
                  <td data-label="Action">
                    <Button
                      size="small"
                      variant="outline"
                      onClick={() => handleRemove(item.productId)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* ORDER SUMMARY: Backend totals (NOT calculated) */}
          <aside className="cart-summary-card" ref={summaryRef} style={{
              backgroundColor: '#fff',
              padding: '1.5rem',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              '--cart-summary-offset': `${summaryOffset}px`
            }}>
              <h3 style={{ marginBottom: '1rem' }}>Order Summary</h3>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.55rem', color: '#475569', fontSize: '0.95rem', border: 'none', borderBottom: 'none', borderTop: 'none', boxShadow: 'none', backgroundColor: 'transparent', outline: 'none' }}>
                <span>Subtotal:</span>
                <span>{formatMWK(cart.subtotal ?? cart.total ?? 0)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.55rem', color: '#475569', fontSize: '0.95rem', border: 'none', borderBottom: 'none', borderTop: 'none', boxShadow: 'none', backgroundColor: 'transparent', outline: 'none' }}>
                <span>{vatLabel}</span>
                <span>{formatMWK(cart.vat ?? 0)}</span>
              </div>

              {/* FIELD: total (from backend - source of truth) */}
              {/* ✅ This comes from cart.total, calculated entirely by backend */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '1.25rem',
                fontWeight: '700',
                marginBottom: '1.5rem',
                paddingBottom: '1.5rem',
                borderBottom: 'none',
                color: '#007bff',
                boxShadow: 'none',
                border: 'none',
                backgroundColor: 'transparent'
              }}>
                <span>Total:</span>
                <span>{formatMWK(cart.total)}</span>
              </div>

              {/* MINIMUM ORDER VALUE WARNING */}
              {isBelowMinimumOrderValue && (
                <div style={{
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  backgroundColor: '#fef2f2',
                  color: '#b91c1c',
                  fontSize: '0.9rem',
                  lineHeight: 1.5
                }}>
                  <strong>Minimum Order Required:</strong> Your subtotal ({formatMWK(cartItemsSubtotal)}) must be at least {formatMWK(minimumOrderValue)}. Add {formatMWK(amountNeededForMinimum)} more to proceed.
                </div>
              )}

              {/* CHECKOUT BUTTON: Disabled if cart empty or below minimum */}
              <Link className="cart-checkout-cta" to={isBelowMinimumOrderValue ? '#' : '/checkout'}>
                <Button
                  variant="primary"
                  size="large"
                  style={{ width: '100%' }}
                  disabled={cart.items.length === 0 || isBelowMinimumOrderValue}
                >
                  {isBelowMinimumOrderValue ? 'Add Items to Meet Minimum' : 'Proceed to Checkout'}
                </Button>
              </Link>
          </aside>
        </div>
      </Container>
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
    </div>
  );
};

export default Cart;



