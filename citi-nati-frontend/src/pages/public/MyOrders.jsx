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
import { getSocket } from '../../utils/socket.js';
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
  const [previewReceiptOrder, setPreviewReceiptOrder] = useState(null);
  const [previewLoadingOrderId, setPreviewLoadingOrderId] = useState(null);
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );
  // Tracks order IDs that just received a live status patch (for subtle flash indicator)
  const [updatedOrderIds, setUpdatedOrderIds] = useState(new Set());

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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const updateMobileState = (event) => setIsMobileView(event.matches);

    setIsMobileView(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateMobileState);
      return () => mediaQuery.removeEventListener('change', updateMobileState);
    }

    mediaQuery.addListener(updateMobileState);
    return () => mediaQuery.removeListener(updateMobileState);
  }, []);

  // Live silent auto-refresh: patch a single order in-state when the backend emits orderUpdated
  useEffect(() => {
    if (authLoading || !user) return;

    const socket = getSocket();
    if (!socket) return;

    const handleOrderUpdated = (updatedOrder) => {
      if (!updatedOrder || !updatedOrder.id) return;

      setOrders((prevOrders) => {
        const idx = prevOrders.findIndex((o) => o.id === updatedOrder.id);
        if (idx === -1) return prevOrders;

        const merged = {
          ...prevOrders[idx],
          // Only overwrite fields the server actually sent – preserve local items array
          status: updatedOrder.status ?? prevOrders[idx].status,
          paymentStatus: updatedOrder.paymentStatus ?? prevOrders[idx].paymentStatus,
          driverId: updatedOrder.driverId ?? prevOrders[idx].driverId,
          driver: updatedOrder.driver ?? prevOrders[idx].driver,
          finalTotalAmount: updatedOrder.finalTotalAmount ?? updatedOrder.total ?? prevOrders[idx].finalTotalAmount,
          total: updatedOrder.total ?? prevOrders[idx].total,
          updatedAt: updatedOrder.updatedAt ?? prevOrders[idx].updatedAt,
          // Prefer richer items array (keep existing if the live payload has no items)
          items: (Array.isArray(updatedOrder.items) && updatedOrder.items.length > 0)
            ? updatedOrder.items
            : prevOrders[idx].items,
        };

        const next = [...prevOrders];
        next[idx] = merged;
        return next;
      });

      // Also patch open preview if it matches
      setPreviewReceiptOrder((prev) => {
        if (!prev || prev.id !== updatedOrder.id) return prev;
        return {
          ...prev,
          status: updatedOrder.status ?? prev.status,
          paymentStatus: updatedOrder.paymentStatus ?? prev.paymentStatus,
        };
      });

      // Brief highlight flash (cleared after 2.5 s)
      setUpdatedOrderIds((prev) => new Set([...prev, updatedOrder.id]));
      setTimeout(() => {
        setUpdatedOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(updatedOrder.id);
          return next;
        });
      }, 2500);
    };

    socket.on('orderUpdated', handleOrderUpdated);
    return () => socket.off('orderUpdated', handleOrderUpdated);
  }, [authLoading, user]);

  // Lock background scroll while quick preview modal is open
  useEffect(() => {
    if (!previewReceiptOrder || typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setPreviewReceiptOrder(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [previewReceiptOrder]);

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

  const getOrderItems = useCallback((orderData) => {
    if (!orderData || typeof orderData !== 'object') return [];

    const sourceItems = Array.isArray(orderData.items) && orderData.items.length > 0
      ? orderData.items
      : Array.isArray(orderData.orderItems)
        ? orderData.orderItems
        : [];

    return sourceItems.map((item) => ({
      ...item,
      quantity: Number(item?.quantity ?? item?.qty ?? 0),
      price: Number(item?.price ?? item?.unitPrice ?? item?.amount ?? 0),
      product: item?.product || (item?.productName ? { name: item.productName } : null),
    }));
  }, []);

  const getOrderWithItems = useCallback(async (orderData) => {
    const normalizedItems = getOrderItems(orderData);
    if (normalizedItems.length > 0) {
      return {
        ...orderData,
        items: normalizedItems,
      };
    }

    try {
      const response = await api.get(`/orders/${orderData.id}`);
      const detailedOrder = response?.data?.order;
      const detailedItems = getOrderItems(detailedOrder);

      return {
        ...orderData,
        ...(detailedOrder || {}),
        items: detailedItems,
      };
    } catch (err) {
      console.error(`Failed to fetch detailed order items for order ${orderData?.id}:`, err);
      return {
        ...orderData,
        items: normalizedItems,
      };
    }
  }, [getOrderItems]);

  const openReceiptPreview = useCallback(async (orderData) => {
    try {
      setPreviewLoadingOrderId(orderData.id);
      const enrichedOrder = await getOrderWithItems(orderData);
      setPreviewReceiptOrder(enrichedOrder);

      if (!enrichedOrder.items || enrichedOrder.items.length === 0) {
        toast.error('No order items were found for this receipt.');
      }
    } catch (err) {
      console.error('Failed to open receipt preview:', err);
      toast.error('Failed to open receipt preview. Please try again.');
    } finally {
      setPreviewLoadingOrderId(null);
    }
  }, [getOrderWithItems]);

  // Individual Order Card Component
  const OrderCard = ({ order }) => {
    const orderItems = getOrderItems(order);
    const isRecentlyUpdated = updatedOrderIds.has(order.id);

    return (
    <div
      style={{
        backgroundColor: '#fff',
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: isRecentlyUpdated
          ? '0 2px 12px rgba(45, 134, 89, 0.35)'
          : '0 2px 8px rgba(0, 0, 0, 0.1)',
        borderLeft: `4px solid ${getStatusColor(order.status)}`,
        transition: 'box-shadow 0.5s ease',
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
      {orderItems.length > 0 && (
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
            Items ({orderItems.length})
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}>
            {orderItems.map((item, idx) => (
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
                  {item.product?.name || item.productName || 'Product'}
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
          <button
            type="button"
            aria-label={`Quick open receipt image for order ${order.id}`}
            title="Quick open receipt image"
            onClick={() => openReceiptPreview(order)}
            disabled={previewLoadingOrderId === order.id}
            style={{
              minWidth: '52px',
              width: '52px',
              borderRadius: '8px',
              border: 'none',
              cursor: previewLoadingOrderId === order.id ? 'not-allowed' : 'pointer',
              backgroundColor: '#0f172a',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              opacity: previewLoadingOrderId === order.id ? 0.65 : 1,
            }}
          >
            <i className={`fas ${previewLoadingOrderId === order.id ? 'fa-spinner fa-spin' : 'fa-eye'}`}></i>
          </button>

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
            {isMobileView ? 'PDF' : 'PDF Receipt'}
          </Button>

          <Button
            variant="secondary"
            size="medium"
            onClick={async () => {
              try {
                const enrichedOrder = await getOrderWithItems(order);
                await exportOrderReceiptImage({ order: enrichedOrder, format: 'png' });
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
            {isMobileView ? 'Image' : 'Image Receipt'}
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
  };

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

      {previewReceiptOrder && (
        <div
          role="presentation"
          onClick={() => setPreviewReceiptOrder(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.62)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Receipt quick preview for order ${previewReceiptOrder.id}`}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(960px, 100%)',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: '14px',
              backgroundColor: '#fff',
              boxShadow: '0 20px 44px rgba(15, 23, 42, 0.28)',
            }}
          >
            <div style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.9rem 1rem',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
            }}>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>
                Receipt Quick Preview
              </h3>
              <button
                type="button"
                onClick={() => setPreviewReceiptOrder(null)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#fff',
                  color: '#334155',
                  cursor: 'pointer',
                  fontSize: '1.15rem',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '1.25rem' }}>
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '1rem 1rem 0.8rem',
                marginBottom: '1rem',
                backgroundColor: '#ffffff',
              }}>
                <h2 style={{ margin: '0 0 0.35rem 0', color: '#0f172a', fontSize: '1.35rem' }}>
                  Citi-Nati Supermarket Receipt
                </h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>
                  Order #{previewReceiptOrder.id} • {formatDate(previewReceiptOrder.createdAt)}
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.8rem', backgroundColor: '#f8fafc' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Order Status</p>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>{previewReceiptOrder.status}</p>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.8rem', backgroundColor: '#f8fafc' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment Status</p>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>{previewReceiptOrder.paymentStatus}</p>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.8rem', backgroundColor: '#f8fafc' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</p>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '1rem', color: '#166534', fontWeight: 700 }}>{formatMWK(previewReceiptOrder.finalTotalAmount ?? previewReceiptOrder.total)}</p>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem' }}>
                <div style={{ backgroundColor: '#2D8659', color: '#fff', fontWeight: 700, padding: '0.75rem 1rem', fontSize: '0.95rem' }}>
                  Items
                </div>
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '0.7rem 0.85rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>Product</th>
                        <th style={{ textAlign: 'center', padding: '0.7rem 0.85rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '0.7rem 0.85rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>Unit Price</th>
                        <th style={{ textAlign: 'right', padding: '0.7rem 0.85rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getOrderItems(previewReceiptOrder).map((item, idx) => (
                        <tr key={`${previewReceiptOrder.id}-preview-${idx}`} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td style={{ padding: '0.68rem 0.85rem', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.92rem', color: '#0f172a' }}>
                            {item.product?.name || item.productName || 'Product'}
                          </td>
                          <td style={{ padding: '0.68rem 0.85rem', textAlign: 'center', borderBottom: '1px solid #e2e8f0', fontSize: '0.92rem', color: '#334155' }}>
                            {item.quantity}
                          </td>
                          <td style={{ padding: '0.68rem 0.85rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', fontSize: '0.92rem', color: '#334155' }}>
                            {formatMWK(item.price)}
                          </td>
                          <td style={{ padding: '0.68rem 0.85rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.92rem', color: '#166534' }}>
                            {formatMWK(Number(item.price || 0) * Number(item.quantity || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                rowGap: '0.45rem',
                columnGap: '0.8rem',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '0.85rem 1rem',
                backgroundColor: '#f8fafc',
              }}>
                <span style={{ color: '#475569' }}>Subtotal</span>
                <strong style={{ color: '#0f172a' }}>{formatMWK(previewReceiptOrder.subtotalAmount ?? previewReceiptOrder.total)}</strong>
                <span style={{ color: '#475569' }}>Delivery Fee</span>
                <strong style={{ color: '#0f172a' }}>{formatMWK(previewReceiptOrder.deliveryFeeAmount ?? 0)}</strong>
                <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '1rem', paddingTop: '0.3rem' }}>Grand Total</span>
                <strong style={{ color: '#166534', fontSize: '1rem', paddingTop: '0.3rem' }}>{formatMWK(previewReceiptOrder.finalTotalAmount ?? previewReceiptOrder.total)}</strong>
              </div>

              <div style={{
                marginTop: '1rem',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '0.9rem 1rem',
                backgroundColor: '#fffef6',
              }}>
                <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Delivery Address
                </p>
                <p style={{ margin: 0, lineHeight: 1.55, color: '#334155', fontSize: '0.95rem' }}>
                  {previewReceiptOrder.deliveryAddress}
                  {previewReceiptOrder.houseNumber ? <><br />{previewReceiptOrder.houseNumber}</> : null}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
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
