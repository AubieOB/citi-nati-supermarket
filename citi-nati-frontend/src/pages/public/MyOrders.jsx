import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { formatMWK } from '../../utils/currency.js';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import toast from 'react-hot-toast';
import { generateOrderReceiptPDF } from '../../utils/pdfReports.js';
import { exportOrderReceiptImage } from '../../utils/orderReceiptImageExport.js';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../../styles/global.css';

/**
 * 📦 MY ORDERS PAGE
 * 
 * Contract-compliant orders display:
 * 1. Fetches current user's orders from GET /api/orders
 * 2. Displays each order with: id, total, status, paymentStatus, createdAt, deliveryAddress
 * 3. No editing or status manipulation
 * 4. Trust backend values (don't calculate totals)
 * 5. Loading state and empty state
 */

const MyOrdersContent = () => {
  const { isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const { updateCartCount } = useCart();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryingOrderId, setRetryingOrderId] = useState(null);

  // Reusable fetch function
  const fetchOrders = useCallback(async () => {
    // Wait for auth to finish initializing
    if (authLoading) {
      return;
    }

    try {
      setError(null);

      // Fetch orders from backend (api module auto-includes Authorization header)
      const response = await api.get('/orders');
      setOrders(response.data.orders || []);
    } catch (err) {
      console.error('[MYORDERS] Error fetching orders:', err);
      
      if (err.response?.status === 401) {
        setError('Session expired. Please login again.');
      } else {
        setError(err.response?.data?.error || 'Failed to load your orders');
      }
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading]);

  // Fetch user's orders on mount
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  /**
   * Retry payment for unpaid order
   * Adds items to cart and navigates to checkout
   */
  const handleRetryPayment = async (order) => {
    if (!order.items || order.items.length === 0) {
      toast.error('No items in this order to retry', { position: 'top-right' });
      return;
    }

    try {
      setRetryingOrderId(order.id);

      // Add each item to cart
      let addedCount = 0;
      const failedItems = [];

      for (const item of order.items) {
        try {
          await api.post('/cart', {
            productId: item.productId,
            quantity: item.quantity
          });
          addedCount++;
        } catch (err) {
          const itemName = item.product?.name || `Product #${item.productId}`;
          failedItems.push({
            name: itemName,
            reason: err.response?.data?.error || 'Failed to add to cart'
          });
        }
      }

      if (addedCount > 0) {
        // Update cart count
        await updateCartCount();

        // Show success message
        const message = failedItems.length === 0 
          ? `Added ${addedCount} item${addedCount !== 1 ? 's' : ''} to cart`
          : `Added ${addedCount} item${addedCount !== 1 ? 's' : ''} to cart. Failed: ${failedItems.map(f => f.name).join(', ')}`;
        
        toast.success(message, { position: 'top-right' });

        // Navigate to checkout
        setTimeout(() => {
          navigate('/checkout');
        }, 800);
      } else {
        // All items failed
        const errorMsg = failedItems.length > 0
          ? `Could not add items: ${failedItems.map(f => f.name).join(', ')}`
          : 'Failed to add items to cart. Please try again.';
        toast.error(errorMsg, { position: 'top-right' });
      }
    } catch (err) {
      console.error('Error retrying payment:', err);
      toast.error('Failed to retry payment. Please try again.', { position: 'top-right' });
    } finally {
      setRetryingOrderId(null);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING':
        return '#ff9800';
      case 'CONFIRMED':
        return '#2196f3';
      case 'DELIVERED':
        return '#4caf50';
      case 'CANCELLED':
        return '#f44336';
      default:
        return '#999';
    }
  };

  // Get payment status badge color
  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'PAID':
        return '#4caf50';
      case 'UNPAID':
        return '#f44336';
      case 'PENDING':
        return '#ff9800';
      default:
        return '#999';
    }
  };

  // Separate orders into new (today) and old (previous days)
  const getGroupedOrders = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newOrders = [];
    const oldOrders = [];

    orders.forEach((order) => {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);

      if (orderDate.getTime() === today.getTime()) {
        newOrders.push(order);
      } else {
        oldOrders.push(order);
      }
    });

    // Sort each group by createdAt descending (most recent first)
    newOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    oldOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return { newOrders, oldOrders };
  };

  // Individual Order Card Component
  const OrderCard = ({ order }) => (
    <div
      style={{
        backgroundColor: '#fff',
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        borderLeft: `4px solid ${getStatusColor(order.status)}`,
      }}
    >
      {/* Order Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: '1rem',
        marginBottom: '1.5rem',
        paddingBottom: '1.5rem',
        borderBottom: '1px solid #eee',
      }}>
        {/* Order ID */}
        <div>
          <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>
            Order ID
          </p>
          <p style={{
            margin: '0.5rem 0 0 0',
            fontSize: '1.1rem',
            fontWeight: '600',
            color: '#333',
          }}>
            #{order.id}
          </p>
        </div>

        {/* Order Date */}
        <div>
          <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>
            Order Date
          </p>
          <p style={{
            margin: '0.5rem 0 0 0',
            fontSize: '0.95rem',
            color: '#333',
          }}>
            {formatDate(order.createdAt)}
          </p>
        </div>

        {/* Total */}
        <div>
          <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>
            Total
          </p>
          <p style={{
            margin: '0.5rem 0 0 0',
            fontSize: '1.1rem',
            fontWeight: '600',
            color: '#2D8659',
          }}>
            {formatMWK(order.finalTotalAmount ?? order.total)}
          </p>
          {(order.subtotalAmount != null || order.deliveryFeeAmount != null) && (
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.35 }}>
              Subtotal: {formatMWK(order.subtotalAmount ?? order.total)} | Delivery Fee: {formatMWK(order.deliveryFeeAmount ?? 0)}
            </p>
          )}
        </div>

        {/* Status Badge */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>
            Status
          </p>
          <div style={{
            display: 'inline-block',
            marginTop: '0.5rem',
            backgroundColor: getStatusColor(order.status),
            color: '#fff',
            padding: '0.5rem 1rem',
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: '600',
          }}>
            {order.status}
          </div>
        </div>
      </div>

      {/* Order Details */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginBottom: '1.5rem',
      }}>
        {/* Delivery Address */}
        <div>
          <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>
            Delivery Address
          </p>
          <p style={{
            margin: '0.5rem 0 0 0',
            fontSize: '0.95rem',
            color: '#333',
            lineHeight: '1.5',
          }}>
            {order.deliveryAddress}
            {order.houseNumber && (
              <>
                <br />
                {order.houseNumber}
              </>
            )}
          </p>
        </div>

        {/* Payment Status */}
        <div>
          <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>
            Payment Status
          </p>
          <div style={{
            marginTop: '0.5rem',
            display: 'inline-block',
            backgroundColor: getPaymentStatusColor(order.paymentStatus),
            color: '#fff',
            padding: '0.5rem 1rem',
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: '600',
          }}>
            {order.paymentStatus}
          </div>
        </div>
      </div>

      {/* Order Items Preview */}
      {order.items && order.items.length > 0 && (
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #eee',
        }}>
          <p style={{
            margin: '0 0 0.75rem 0',
            fontSize: '0.85rem',
            fontWeight: '600',
            color: '#666',
            textTransform: 'uppercase',
          }}>
            Items ({order.items.length})
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}>
            {order.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.75rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              >
                <p style={{ margin: '0', fontWeight: '600', color: '#333' }}>
                  {item.product?.name || 'Product'}
                </p>
                <p style={{
                  margin: '0.25rem 0 0 0',
                  color: '#666',
                }}>
                  Qty: {item.quantity} × {formatMWK(item.price)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receipt Download Button - Only for Delivered Orders */}
      {order.status === 'DELIVERED' && (
        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid #eee',
          display: 'flex',
          gap: '0.75rem',
        }}>
          <Button
            variant="secondary"
            size="medium"
            onClick={() => {
              generateOrderReceiptPDF(order);
              toast.success('Receipt PDF downloaded successfully!');
            }}
            style={{
              backgroundColor: '#2D8659',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              flex: 1,
            }}
          >
            <i className="fas fa-receipt" style={{ marginRight: '0.5rem' }}></i>
            Download PDF Receipt
          </Button>

          <Button
            variant="secondary"
            size="medium"
            onClick={async () => {
              try {
                await exportOrderReceiptImage({ order, format: 'png' });
                toast.success('Receipt image downloaded successfully!');
              } catch (err) {
                console.error('Failed to download receipt image:', err);
                toast.error('Failed to download receipt image. Please try again.');
              }
            }}
            style={{
              backgroundColor: '#1d4ed8',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              flex: 1,
            }}
          >
            <i className="fas fa-image" style={{ marginRight: '0.5rem' }}></i>
            Download Receipt Image
          </Button>
        </div>
      )}

      {/* Retry Payment Button - Only for Unpaid Orders */}
      {order.paymentStatus === 'PENDING' && (
        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid #eee',
          display: 'flex',
          gap: '0.75rem',
        }}>
          <Button
            variant="secondary"
            size="medium"
            onClick={() => handleRetryPayment(order)}
            disabled={retryingOrderId === order.id}
            style={{
              backgroundColor: retryingOrderId === order.id ? '#ccc' : '#ff9800',
              color: '#fff',
              border: 'none',
              cursor: retryingOrderId === order.id ? 'not-allowed' : 'pointer',
              flex: 1,
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => {
              if (retryingOrderId !== order.id) {
                e.target.style.backgroundColor = '#e68900';
              }
            }}
            onMouseOut={(e) => {
              if (retryingOrderId !== order.id) {
                e.target.style.backgroundColor = '#ff9800';
              }
            }}
          >
            <i className="fas fa-sync" style={{ marginRight: '0.5rem' }}></i>
            {retryingOrderId === order.id ? 'Processing...' : 'Retry Payment'}
          </Button>
        </div>
      )}
    </div>
  );

  // Auth initialization loading
  if (authLoading) {
    return (
      <div className="page">
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>My Orders</h1>
          <div style={{
            backgroundColor: '#e7f3ff',
            color: '#0c3a7a',
            padding: '1rem',
            borderRadius: '4px',
            textAlign: 'center',
          }}>
            Verifying your session...
          </div>
        </Container>
      </div>
    );
  }

  // Orders loading
  if (loading) {
    return (
      <div className="page">
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>My Orders</h1>
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#666',
          }}>
            <p style={{ marginBottom: '1rem' }}>Loading your orders...</p>
            <div style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #e0e0e0',
              borderTop: '4px solid #2D8659',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}></div>
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </Container>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="page">
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>My Orders</h1>
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '1.5rem',
            borderRadius: '4px',
            marginBottom: '2rem',
            borderLeft: '4px solid #f5c6cb',
          }}>
            <h3>Error</h3>
            <p>{error}</p>
          </div>
        </Container>
      </div>
    );
  }

  // Empty state
  if (orders.length === 0) {
    return (
      <div className="page">
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>My Orders</h1>
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            marginBottom: '2rem',
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem',
            }}>
              <i className="fas fa-box" style={{ color: '#5B4B8A' }}></i>
            </div>
            <h2>No orders yet</h2>
            <p style={{ color: '#666', marginBottom: '2rem' }}>
              Start shopping to place your first order!
            </p>
            <a href="/products" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="large">
                Continue Shopping
              </Button>
            </a>
          </div>
        </Container>
      </div>
    );
  }

  // Orders list
  return (
    <div className="page">
      <Container>
        <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>My Orders</h1>

        {(() => {
          const { newOrders, oldOrders } = getGroupedOrders();

          return (
            <>
              {/* New Orders Section */}
              {newOrders.length > 0 && (
                <div style={{ marginBottom: '3rem' }}>
                  <h2 style={{ color: '#FF6B6B', marginBottom: '1.5rem', display: 'flex', alignItems: 'center' }}>
                    <i className="fas fa-star" style={{ marginRight: '0.75rem' }}></i>
                    New Orders Today ({newOrders.length})
                  </h2>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '1.5rem',
                  }}>
                    {newOrders.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                </div>
              )}

              {/* Old Orders Section */}
              {oldOrders.length > 0 && (
                <div style={{ marginBottom: '3rem' }}>
                  <h2 style={{ color: '#999', marginBottom: '1.5rem', display: 'flex', alignItems: 'center' }}>
                    <i className="fas fa-history" style={{ marginRight: '0.75rem' }}></i>
                    Previous Orders ({oldOrders.length})
                  </h2>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '1.5rem',
                  }}>
                    {oldOrders.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </Container>
    </div>
  );
};

/**
 * Protected My Orders Route
 * Only authenticated users with 'user' role can access
 */
const MyOrders = () => {
  return (
    <ProtectedRoute allowedRoles={['user']}>
      <MyOrdersContent />
    </ProtectedRoute>
  );
};

export default MyOrders;
