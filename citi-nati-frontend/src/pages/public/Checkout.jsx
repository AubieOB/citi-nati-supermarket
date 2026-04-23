import React, { useState, useEffect, useMemo } from 'react';
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
 * Contract-compliant checkout flow with stock validation:
 * 1. Verify user is authenticated
 * 2. Fetch cart from backend
 * 3. Validate stock for all products BEFORE submission
 * 4. Collect delivery information
 * 5. Validate all data
 * 6. Submit to POST /api/orders
 * 7. Redirect to payment gateway
 */

const CheckoutContent = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    deliveryAddress: '',
    houseNumber: '',
    phone: '',
    district: '',
    area: '',
    latitude: '',
    longitude: '',
  });

  const [deliveryZoneOptions, setDeliveryZoneOptions] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Cart state
  const [cart, setCart] = useState(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState(null);

  // Stock validation state
  const [backendProducts, setBackendProducts] = useState({});
  const [outOfStockItems, setOutOfStockItems] = useState([]);
  const [isValidatingStock, setIsValidatingStock] = useState(false);

  // Success state
  const [orderCreated, setOrderCreated] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const { modal, closeModal, showWarning, showError } = useModal();

  const districtLabel = (district) => String(district || '').replace(/\s+district$/i, '').trim();

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
        setCart({ items: [], subtotal: 0, vat: 0, vatRatePercent: 0, total: 0, cartId: null });
      } finally {
        setCartLoading(false);
      }
    };

    fetchCart();
  }, []);

  useEffect(() => {
    const fetchDeliveryZoneOptions = async () => {
      try {
        setZonesLoading(true);
        const response = await api.get('/delivery-zones/options');
        setDeliveryZoneOptions(Array.isArray(response.data?.zones) ? response.data.zones : []);
      } catch (err) {
        console.error('Error fetching delivery zones:', err);
        setErrors((prev) => ({
          ...prev,
          form: err.response?.data?.error || 'Unable to load delivery areas. Please try again.',
        }));
      } finally {
        setZonesLoading(false);
      }
    };

    fetchDeliveryZoneOptions();
  }, []);

  const districtOptions = useMemo(
    () => deliveryZoneOptions.map((entry) => entry.district).filter(Boolean),
    [deliveryZoneOptions]
  );

  const selectedDistrictAreas = useMemo(() => {
    if (!formData.district) return [];
    const districtEntry = deliveryZoneOptions.find((entry) => entry.district === formData.district);
    return Array.isArray(districtEntry?.areas) ? districtEntry.areas : [];
  }, [deliveryZoneOptions, formData.district]);

  const selectedAreaOption = useMemo(
    () => selectedDistrictAreas.find((entry) => entry.area === formData.area) || null,
    [selectedDistrictAreas, formData.area]
  );

  const cartItemsSubtotal = useMemo(
    () => Number(cart?.itemsSubtotal ?? cart?.total ?? 0),
    [cart]
  );

  const minimumOrderValue = useMemo(
    () => Number(cart?.minimumOrderValue ?? 10000),
    [cart]
  );

  const selectedDeliveryFee = useMemo(
    () => Number(selectedAreaOption?.deliveryFee ?? 0),
    [selectedAreaOption]
  );

  const checkoutFinalTotal = useMemo(
    () => Number((cartItemsSubtotal + selectedDeliveryFee).toFixed(2)),
    [cartItemsSubtotal, selectedDeliveryFee]
  );

  const isBelowMinimumOrderValue = useMemo(
    () => cartItemsSubtotal < minimumOrderValue,
    [cartItemsSubtotal, minimumOrderValue]
  );

  const amountNeededForMinimum = useMemo(
    () => Number(Math.max(0, minimumOrderValue - cartItemsSubtotal).toFixed(2)),
    [minimumOrderValue, cartItemsSubtotal]
  );

  // Validate stock availability
  const validateStockAvailability = async (cartItems) => {
    if (!cartItems || cartItems.length === 0) {
      setOutOfStockItems([]);
      return true;
    }

    try {
      setIsValidatingStock(true);
      const productsMap = {};

      // Fetch latest product data for each cart item
      for (const item of cartItems) {
        try {
          const response = await api.get(`/products/${item.productId}`);
          productsMap[item.productId] = response.data;
        } catch (err) {
          console.warn(`Failed to fetch product ${item.productId}:`, err);
          // Product fetch failed - will be marked as unavailable
        }
      }

      setBackendProducts(productsMap);

      // Validate stock for each cart item (use effectiveStock: override if active, else posStock)
      const unavailableItems = [];
      cartItems.forEach(item => {
        const product = productsMap[item.productId];
        if (!product) {
          unavailableItems.push({
            ...item,
            reason: 'Product not found in stock',
            availableStock: 0
          });
        } else {
          const availableStock = product.effectiveStock != null ? product.effectiveStock : product.stock;
          if (item.quantity > availableStock) {
            unavailableItems.push({
              ...item,
              reason: 'Insufficient stock',
              availableStock
            });
          }
        }
      });

      setOutOfStockItems(unavailableItems);
      return unavailableItems.length === 0;
    } catch (err) {
      console.error('Error validating stock:', err);
      showWarning('Stock Check', 'Unable to verify product availability. Please try again.');
      return false;
    } finally {
      setIsValidatingStock(false);
    }
  };

  // Validate stock on cart changes
  useEffect(() => {
    if (cart && cart.items.length > 0) {
      validateStockAvailability(cart.items);
    }
  }, [cart?.items.length]);

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'district' ? { area: '' } : {}),
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

    // 🔒 SECTION 4: Final stock check before submission
    const stockValid = await validateStockAvailability(cart?.items || []);
    if (!stockValid || outOfStockItems.length > 0) {
      showError('Stock Unavailable', 'One or more items are out of stock. Please adjust your cart.');
      return;
    }

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
      const backendCode = err.response?.data?.code;
      let errorMessage = err.response?.data?.error || 'Failed to process order';

      if (backendCode === 'UNSUPPORTED_AREA') {
        errorMessage = 'Sorry, we currently do not deliver to your selected area.';
      } else if (backendCode === 'OUTSIDE_COVERAGE_RADIUS') {
        errorMessage = 'Your location is outside our delivery coverage. Please choose a supported area.';
      } else if (backendCode === 'MINIMUM_ORDER_NOT_MET') {
        const remainingAmount = Number(err.response?.data?.remainingAmount ?? 0);
        const configuredMinimum = Number(err.response?.data?.minimumOrderValue ?? minimumOrderValue);
        errorMessage = `The minimum order value for delivery is ${formatMWK(configuredMinimum)}. Add ${formatMWK(remainingAmount)} more to continue.`;
      }
      
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
    zonesLoading ||
    isValidatingStock ||
    outOfStockItems.length > 0 ||
    !cart || 
    cart.items.length === 0 ||
    !String(formData.latitude || '').trim() ||
    !String(formData.longitude || '').trim() ||
    orderCreated !== null;
  const vatLabel = cart?.vatEnabled === false
    ? 'VAT (disabled):'
    : `VAT (${Number(cart?.configuredVatRatePercent ?? cart?.vatRatePercent ?? 0).toFixed(1)}%):`;

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

        {/* 🔒 Out-of-Stock Alert */}
        {outOfStockItems.length > 0 && (
          <div style={{
            backgroundColor: '#fff3cd',
            color: '#856404',
            padding: '1.5rem',
            borderRadius: '4px',
            marginBottom: '1.5rem',
            borderLeft: '4px solid #ffc107',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>
              <i className="fas fa-exclamation-triangle" style={{marginRight: '0.5rem', color: '#ff9800'}}></i>
              Stock Check Failed
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>
                The following items are not fully available:
              </p>
              {outOfStockItems.map((item, idx) => (
                <div key={idx} style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  padding: '0.75rem',
                  marginBottom: idx < outOfStockItems.length - 1 ? '0.5rem' : 0,
                  borderRadius: '4px',
                  borderLeft: '3px solid #ff6b6b',
                }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: '600' }}>
                    {item.name}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#333' }}>
                    {item.reason === 'Insufficient stock'
                      ? `You requested ${item.quantity}, but only ${item.availableStock} available`
                      : `Product not found in stock`
                    }
                  </p>
                </div>
              ))}
            </div>
            <p style={{ margin: '1rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
              <i className="fas fa-info-circle" style={{marginRight: '0.5rem'}}></i>
              Please update your cart and try again
            </p>
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

              <div className="form__group">
                <label className="form__label">
                  District <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <select
                  className="form__input"
                  name="district"
                  value={formData.district}
                  onChange={handleChange}
                  disabled={isSubmitting || orderCreated !== null || zonesLoading}
                  style={{ borderColor: errors.district ? '#dc3545' : undefined }}
                >
                  <option value="">Select district</option>
                  {districtOptions.map((district) => (
                    <option key={district} value={district}>{districtLabel(district)}</option>
                  ))}
                </select>
                {errors.district && (
                  <span style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                    {errors.district}
                  </span>
                )}
              </div>

              <div className="form__group">
                <label className="form__label">
                  Area <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <select
                  className="form__input"
                  name="area"
                  value={formData.area}
                  onChange={handleChange}
                  disabled={isSubmitting || orderCreated !== null || zonesLoading || !formData.district}
                  style={{ borderColor: errors.area ? '#dc3545' : undefined }}
                >
                  <option value="">Select area</option>
                  {selectedDistrictAreas.map((entry) => (
                    <option key={`${entry.district}-${entry.area}`} value={entry.area}>{entry.area}</option>
                  ))}
                </select>
                {errors.area && (
                  <span style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                    {errors.area}
                  </span>
                )}
                {!!formData.district && selectedDistrictAreas.length === 0 && (
                  <p style={{ fontSize: '0.82rem', color: '#b45309', margin: '0.35rem 0 0' }}>
                    No supported delivery areas are active for this district yet.
                  </p>
                )}
                {selectedAreaOption?.deliveryFee != null && (
                  <p style={{ fontSize: '0.8rem', color: '#2D8659', margin: '0.35rem 0 0' }}>
                    Estimated delivery fee for this area: {formatMWK(selectedAreaOption.deliveryFee)}
                  </p>
                )}
              </div>

              {/* Geolocation Section */}
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #eee' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: '#666' }}>
                  Location (Required)
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
                  {cart.items.map((item, index) => {
                    const itemOutOfStock = outOfStockItems.find(x => x.productId === item.productId);
                    const isUnavailable = !!itemOutOfStock;
                    
                    return (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '0.75rem',
                          paddingBottom: '0.75rem',
                          borderBottom: index < cart.items.length - 1 ? '1px solid #eee' : 'none',
                          opacity: isUnavailable ? 0.6 : 1,
                          backgroundColor: isUnavailable ? 'rgba(255, 107, 107, 0.05)' : 'transparent',
                          padding: isUnavailable ? '0.75rem' : 0,
                          borderRadius: isUnavailable ? '4px' : 0,
                          borderLeft: isUnavailable ? '3px solid #ff6b6b' : 'none',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <p style={{ 
                            margin: '0', 
                            fontWeight: '500', 
                            color: isUnavailable ? '#666' : '#333',
                            textDecoration: isUnavailable ? 'line-through' : 'none',
                          }}>
                            {item.name}
                          </p>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                            Qty: {item.quantity} × {formatMWK(item.price)}
                          </p>
                          {isUnavailable && (
                            <p style={{ 
                              margin: '0.5rem 0 0 0', 
                              fontSize: '0.8rem', 
                              color: '#ff6b6b',
                              fontWeight: '600',
                            }}>
                              <i className="fas fa-exclamation-circle" style={{marginRight: '0.3rem'}}></i>
                              Only {itemOutOfStock.availableStock} available (need {item.quantity})
                            </p>
                          )}
                        </div>
                        <span style={{ 
                          fontWeight: '600', 
                          color: isUnavailable ? '#999' : '#2D8659',
                          whiteSpace: 'nowrap',
                          marginLeft: '1rem',
                        }}>
                          {formatMWK(item.subtotal)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Total */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.55rem',
                  color: '#475569',
                  fontWeight: 600,
                  border: 'none',
                  borderBottom: 'none',
                  borderTop: 'none',
                  boxShadow: 'none',
                  backgroundColor: 'transparent',
                  outline: 'none',
                }}>
                  <span>Subtotal:</span>
                  <span>{formatMWK(cartItemsSubtotal)}</span>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.55rem',
                  color: '#475569',
                  fontWeight: 600,
                }}>
                  <span>Delivery Fee:</span>
                  <span>{formatMWK(selectedDeliveryFee)}</span>
                </div>

                {isBelowMinimumOrderValue && (
                  <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.7rem', borderRadius: '6px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.82rem', lineHeight: 1.45 }}>
                    Minimum order required: {formatMWK(minimumOrderValue)}. Add {formatMWK(amountNeededForMinimum)} more items.
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.8rem',
                  color: '#64748b',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  border: 'none',
                  borderBottom: 'none',
                  borderTop: 'none',
                  boxShadow: 'none',
                  backgroundColor: 'transparent',
                  outline: 'none',
                }}>
                  <span>{vatLabel}</span>
                  <span>{formatMWK(cart.vat ?? 0)}</span>
                </div>

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
                  <span>Final Total:</span>
                  <span>{formatMWK(checkoutFinalTotal)}</span>
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
