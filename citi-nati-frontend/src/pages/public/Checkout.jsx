import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import { validateOrderCreate, sanitizeOrderData } from '../../utils/orderValidation.js';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 * 🛒 CHECKOUT PAGE
 * 
 * Contract-compliant checkout flow:
 * 1. Verify user is authenticated
 * 2. Fetch cart from backend (trust backend, not local state)
 * 3. Collect only allowed fields: deliveryAddress, houseNumber, latitude (optional), longitude (optional)
 * 4. Validate using orderValidation.validateCreate()
 * 5. Submit to POST /api/orders
 * 6. Show confirmation with order ID and total
 * 7. Clear cart and redirect
 */

const CheckoutContent = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    deliveryAddress: '',
    houseNumber: '',
    phone: '',
    latitude: '',
    longitude: '',
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Cart state
  const [cart, setCart] = useState(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState(null);

  // Success state
  const [orderCreated, setOrderCreated] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const { modal, closeModal, showWarning, showError } = useModal();

  // Fetch cart from backend on mount
  useEffect(() => {
    const fetchCart = async () => {
      try {
        setCartLoading(true);
        setCartError(null);
        const response = await api.get('/cart');
        setCart(response.data);
      } catch (err) {
        console.error('Error fetching cart:', err);
        setCartError(err.response?.data?.error || 'Failed to load cart');
        setCart({ items: [], total: 0, cartId: null });
      } finally {
        setCartLoading(false);
      }
    };

    fetchCart();
  }, []);

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  // Auto-fill geolocation
  const handleAutoFillLocation = () => {
    if ('geolocation' in navigator) {
      setIsGettingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            latitude: position.coords.latitude.toString(),
            longitude: position.coords.longitude.toString(),
          }));
          setIsGettingLocation(false);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          showWarning('Location Error', 'Unable to get your location. Please enter manually.');
          setIsGettingLocation(false);
        }
      );
    } else {
      showError('Browser Support', 'Geolocation is not supported by your browser');
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form data
    const validation = validateOrderCreate(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Check cart is not empty
    if (!cart || cart.items.length === 0) {
      setCartError('Your cart is empty. Add items before checkout.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});

      // Sanitize data (remove disallowed fields)
      const sanitizedData = sanitizeOrderData(formData);

      // Step 1: Create order (status will be PENDING_PAYMENT)
      const orderResponse = await api.post('/orders', sanitizedData);
      const order = orderResponse.data.order;

      setOrderCreated(order);
      setSuccessMessage(`Order #${order.id} created! Redirecting to payment...`);

      // Step 2: Initialize payment
      const paymentResponse = await api.post('/payments/initialize', {
        orderId: order.id
      });

      // Step 3: Redirect to Paychangu checkout
      if (paymentResponse.data.checkoutUrl) {
        // Give user brief moment to see success message before redirecting
        setTimeout(() => {
          window.location.href = paymentResponse.data.checkoutUrl;
        }, 1500);
      } else {
        throw new Error('No checkout URL received from payment gateway');
      }

    } catch (err) {
      console.error('Error during checkout:', err);
      const errorMessage = err.response?.data?.error || 'Failed to process order';
      
      if (err.response?.status === 401) {
        navigate('/login');
      } else {
        setErrors({ form: errorMessage || 'An error occurred during checkout' });
      }
      
      setIsSubmitting(false);
    }
  };

  // Check if Place Order button should be disabled
  const isPlaceOrderDisabled = 
    isSubmitting || 
    cartLoading || 
    !cart || 
    cart.items.length === 0 ||
    orderCreated !== null;

  return (
    <div className="page checkout-page">
      <Container>
        <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>Checkout</h1>

        {/* Auth Initialization Loading */}
        {authLoading && (
          <div style={{
            backgroundColor: '#e7f3ff',
            color: '#0c3a7a',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            borderLeft: '4px solid #2196F3',
            textAlign: 'center',
          }}>
            Verifying your session...
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div style={{
            backgroundColor: '#d4edda',
            color: '#155724',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            borderLeft: '4px solid #28a745',
          }}>
            ✓ {successMessage}
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', margin: '0.5rem 0 0 0' }}>
              Redirecting to confirmation...
            </p>
          </div>
        )}

        {/* Error Messages */}
        {cartError && !successMessage && (
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            borderLeft: '4px solid #f5c6cb',
          }}>
            <i className="fas fa-exclamation-circle" style={{marginRight: '0.5rem'}}></i>{cartError}
          </div>
        )}

        {errors.form && (
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            borderLeft: '4px solid #f5c6cb',
          }}>
            <i className="fas fa-exclamation-circle" style={{marginRight: '0.5rem'}}></i>{errors.form}
          </div>
        )}

        <div className="checkout-grid" style={{
          opacity: authLoading ? 0.5 : 1,
          pointerEvents: authLoading ? 'none' : 'auto',
        }}>
          {/* Checkout Form */}
          <div>
            <h2 style={{ marginBottom: '1.5rem', color: '#2D8659' }}>Delivery Information</h2>
            
            <form className="form" onSubmit={handleSubmit} style={{ maxWidth: '100%' }}>
              {/* Delivery Address */}
              <div className="form__group">
                <label className="form__label">
                  Delivery Address <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form__input"
                  name="deliveryAddress"
                  placeholder="e.g., PO Box 32334, Chichiri, Blantyre"
                  value={formData.deliveryAddress}
                  onChange={handleChange}
                  disabled={isSubmitting || orderCreated !== null}
                  style={{
                    borderColor: errors.deliveryAddress ? '#dc3545' : undefined,
                  }}
                />
                {errors.deliveryAddress && (
                  <span style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                    {errors.deliveryAddress}
                  </span>
                )}
              </div>

              {/* House Number */}
              <div className="form__group">
                <label className="form__label">
                  House Number / Apartment <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form__input"
                  name="houseNumber"
                  placeholder="e.g., House #42"
                  value={formData.houseNumber}
                  onChange={handleChange}
                  disabled={isSubmitting || orderCreated !== null}
                  style={{
                    borderColor: errors.houseNumber ? '#dc3545' : undefined,
                  }}
                />
                {errors.houseNumber && (
                  <span style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                    {errors.houseNumber}
                  </span>
                )}
              </div>

              {/* Phone Number */}
              <div className="form__group">
                <label className="form__label">
                  Phone Number <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <input
                  type="tel"
                  className="form__input"
                  name="phone"
                  placeholder="e.g., +265991234567 or 0991234567"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={isSubmitting || orderCreated !== null}
                  style={{
                    borderColor: errors.phone ? '#dc3545' : undefined,
                  }}
                />
                {errors.phone && (
                  <span style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                    {errors.phone}
                  </span>
                )}
                <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.3rem', margin: '0.3rem 0 0 0' }}>
                  <i className="fas fa-phone" style={{ marginRight: '0.3rem' }}></i>
                  Drivers will call this number if they need directions
                </p>
              </div>

              {/* Geolocation Section */}
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #eee' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: '#666' }}>
                  Location <span style={{ color: '#dc3545' }}>*</span>
                </h3>
                
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={handleAutoFillLocation}
                  disabled={isSubmitting || orderCreated !== null || isGettingLocation}
                  style={{ marginBottom: '1rem', width: '100%', opacity: isGettingLocation ? 0.7 : 1 }}
                >
                  {isGettingLocation ? (
                    <>
                      <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.5rem' }}></i>
                      Getting Location...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-map-marker-alt" style={{ marginRight: '0.5rem' }}></i>
                      Use My Current Location
                    </>
                  )}
                </Button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Latitude */}
                  <div className="form__group">
                    <label className="form__label">Latitude <span style={{ color: '#dc3545' }}>*</span></label>
                    <input
                      type="number"
                      className="form__input"
                      name="latitude"
                      placeholder="-18.9626"
                      value={formData.latitude}
                      onChange={handleChange}
                      disabled={isSubmitting || orderCreated !== null}
                      step="0.0001"
                      style={{
                        borderColor: errors.latitude ? '#dc3545' : undefined,
                      }}
                    />
                    {errors.latitude && (
                      <span style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                        {errors.latitude}
                      </span>
                    )}
                  </div>

                  {/* Longitude */}
                  <div className="form__group">
                    <label className="form__label">Longitude <span style={{ color: '#dc3545' }}>*</span></label>
                    <input
                      type="number"
                      className="form__input"
                      name="longitude"
                      placeholder="22.7741"
                      value={formData.longitude}
                      onChange={handleChange}
                      disabled={isSubmitting || orderCreated !== null}
                      step="0.0001"
                      style={{
                        borderColor: errors.longitude ? '#dc3545' : undefined,
                      }}
                    />
                    {errors.longitude && (
                      <span style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                        {errors.longitude}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                size="large"
                disabled={isPlaceOrderDisabled}
                style={{
                  width: '100%',
                  opacity: isPlaceOrderDisabled ? 0.6 : 1,
                  cursor: isPlaceOrderDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? <><i className="fas fa-cube" style={{marginRight: '0.5rem'}}></i>Processing...</> : <><i className="fas fa-check-circle" style={{marginRight: '0.5rem'}}></i>Place Order</>}
              </Button>

              <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '1rem', textAlign: 'center' }}>
                * Required fields
              </p>
            </form>
          </div>

          {/* Order Summary */}
          <div>
            <h2 style={{ marginBottom: '1.5rem', color: '#2D8659' }}>Order Summary</h2>

            {cartLoading ? (
              <div style={{
                backgroundColor: '#fff',
                padding: '2rem',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                Loading cart...
              </div>
            ) : cart && cart.items.length > 0 ? (
              <div style={{
                backgroundColor: '#fff',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}>
                {/* Cart Items */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: '#333' }}>Items</h3>
                  {cart.items.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.75rem',
                        paddingBottom: '0.75rem',
                        borderBottom: index < cart.items.length - 1 ? '1px solid #eee' : 'none',
                      }}
                    >
                      <div>
                        <p style={{ margin: '0', fontWeight: '500', color: '#333' }}>
                          {item.name}
                        </p>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                          Qty: {item.quantity} × {formatMWK(item.price)}
                        </p>
                      </div>
                      <span style={{ fontWeight: '600', color: '#2D8659' }}>
                        {formatMWK(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  color: '#2D8659',
                }}>
                  <span>Total:</span>
                  <span>{formatMWK(cart.total)}</span>
                </div>

                <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '1rem', textAlign: 'center' }}>
                  Prices are locked from your cart
                </p>
              </div>
            ) : (
              <div style={{
                backgroundColor: '#fff',
                padding: '2rem',
                borderRadius: '8px',
                textAlign: 'center',
                color: '#dc3545',
              }}>
                <p style={{ margin: '0', marginBottom: '1rem' }}>Your cart is empty</p>
                <p style={{ margin: '0', fontSize: '0.9rem', color: '#666' }}>
                  Add items to your cart before checking out
                </p>
              </div>
            )}

            {/* Note about backend authority */}
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              backgroundColor: '#e7f3ff',
              borderRadius: '4px',
              borderLeft: '4px solid #2196F3',
              fontSize: '0.85rem',
              color: '#0c3a7a',
            }}>
              <i className="fas fa-info-circle" style={{marginRight: '0.5rem'}}></i>Your order will be reviewed by our team. You'll receive a confirmation email shortly.
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

/**
 * Protected Checkout Route
 * Only authenticated users (user or admin role) can access
 */
const Checkout = () => {
  return (
    <ProtectedRoute allowedRoles={['user', 'admin']}>
      <CheckoutContent />
    </ProtectedRoute>
  );
};

export default Checkout;
