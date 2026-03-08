import React, { useState, useEffect } from 'react';
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
  const [updating, setUpdating] = useState(false);
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
   * Update item quantity
   * Contract: PUT /api/cart/update with { productId, quantity }
   * Rules:
   * - quantity = 0 → delete item
   * - Don't calculate totals
   * - Trust backend response
   * - IMPORTANT: Maintain item order (no sorting)
   */
  const handleQuantityChange = async (productId, newQuantity) => {
    if (newQuantity === undefined || newQuantity === null) return;

    try {
      setUpdating(true);

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

      // 6️⃣ SUBMIT: Send only what contract requires
      // Contract: { productId, quantity }
      // Don't send: id, name, price, subtotal, total
      // api module automatically includes Authorization header
      const response = await api.put('/cart/update', {
        productId,
        quantity
      });

      // 7️⃣ REFRESH: Fetch updated cart from backend AND MAINTAIN ORDER
      // Never update local state manually
      const cartResponse = await api.get('/cart');
      const backendCart = cartResponse.data;

      // Map backend items to maintain original order
      // This ensures items stay in their original position
      const orderedItems = cart.items
        .map(oldItem => {
          // Find this item in the backend response
          const backendItem = backendCart.items.find(bi => bi.productId === oldItem.productId);
          // If found, use backend values; if not found, item was deleted
          return backendItem || null;
        })
        .filter(item => item !== null); // Remove deleted items

      // Update cart with reordered items but backend totals
      setCart({
        ...backendCart,
        items: orderedItems
      });

      // Update cart count in header
      await updateCartCount();
    } catch (err) {
      // ❌ ERROR: Handle auth errors
      if (err.response?.status === 401) {
        setError('Session expired. Please login again.');
        logout();
        return;
      }

      console.error('❌ Error updating cart item:', err.message);
      showError('Error', `Error: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  /**
   * Remove item from cart (set quantity to 0)
   */
  const handleRemove = (productId) => {
    handleQuantityChange(productId, 0);
  };

  // 8️⃣ AUTH INITIALIZATION STATE
  if (authLoading) {
    return (
      <div className="page cart-page">
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>Shopping Cart</h1>
          <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
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
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>Shopping Cart</h1>
          <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
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
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>Shopping Cart</h1>
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '1.5rem',
            borderRadius: '4px',
            marginBottom: '2rem'
          }}>
            <h3>Error</h3>
            <p>{error}</p>
          </div>
          <Link to="/products">
            <Button variant="primary" size="large">
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
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>Shopping Cart</h1>
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <h2>Your cart is empty</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              Start shopping to add items to your cart
            </p>
            <Link to="/products">
              <Button variant="primary" size="large">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  // 1️⃣1️⃣ RENDER: Cart with items (backend-authoritative)
  return (
    <div className="page cart-page">
      <Container>
        <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>Shopping Cart</h1>

        <div className="cart-layout">
          {/* CART TABLE: Display items with backend prices */}
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
                  <td>{item.name}</td>

                  {/* FIELD: price (LOCKED at time of add - never manipulate) */}
                  {/* ✅ Trust backend price, not product price from Products page */}
                  <td>{formatMWK(item.price)}</td>

                  {/* FIELD: quantity (editable via handleQuantityChange) */}
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(item.productId, e.target.value)}
                      disabled={updating}
                      className="cart-quantity-input"
                      style={{
                        width: '70px',
                        padding: '0.5rem 0.25rem',
                        border: '2px solid #e0e0e0',
                        borderRadius: '4px',
                        opacity: updating ? 0.6 : 1,
                        backgroundColor: '#f5f5f5',
                        transition: 'box-shadow 0.3s ease, background-color 0.3s ease, border-color 0.3s ease',
                        cursor: updating ? 'not-allowed' : 'text',
                        fontSize: '1rem',
                        textAlign: 'center'
                      }}
                      onFocus={(e) => {
                        if (!updating) {
                          e.target.style.backgroundColor = '#fff';
                          e.target.style.borderColor = '#5b4b8a';
                          e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.2)';
                        }
                      }}
                      onBlur={(e) => {
                        e.target.style.backgroundColor = '#f5f5f5';
                        e.target.style.borderColor = '#e0e0e0';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </td>

                  {/* FIELD: subtotal (from backend - NEVER calculate on frontend) */}
                  {/* ✅ This is item.quantity * item.price, calculated by backend */}
                  <td>{formatMWK(item.subtotal)}</td>

                  {/* ACTION: Remove button */}
                  <td>
                    <Button
                      size="small"
                      variant="outline"
                      onClick={() => handleRemove(item.productId)}
                      disabled={updating}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ORDER SUMMARY: Backend totals (NOT calculated) */}
          <div className="cart-summary-grid" style={{
            marginTop: '2rem'
          }}>
            <div></div>
            <div style={{
              backgroundColor: '#fff',
              padding: '1.5rem',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ marginBottom: '1rem' }}>Order Summary</h3>

              {/* FIELD: total (from backend - source of truth) */}
              {/* ✅ This comes from cart.total, calculated entirely by backend */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '1.25rem',
                fontWeight: '700',
                marginBottom: '1.5rem',
                paddingBottom: '1.5rem',
                borderBottom: '2px solid #eee',
                color: '#007bff'
              }}>
                <span>Total:</span>
                <span>{formatMWK(cart.total)}</span>
              </div>

              {/* CHECKOUT BUTTON: Disabled if cart empty */}
              {/* ✅ Technically impossible here since we check length above, but being safe */}
              <Link to="/checkout">
                <Button
                  variant="primary"
                  size="large"
                  style={{ width: '100%' }}
                  disabled={cart.items.length === 0 || updating}
                >
                  {updating ? 'Updating...' : 'Proceed to Checkout'}
                </Button>
              </Link>
            </div>
          </div>
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
