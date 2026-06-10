import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Container from '../../components/ui/Container.jsx';
import api from '../../utils/api.js';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 * 💳 PAYMENT SUCCESS PAGE
 * 
 * Callback handler after Paychangu payment
 * 1. Verify payment reference from URL
 * 2. Poll for order payment confirmation
 * 3. Redirect to order tracking page
 */

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  const [status, setStatus] = useState('processing'); // processing, success, error, refund_required
  const [message, setMessage] = useState('Processing your payment...');
  const [orderId, setOrderId] = useState(null);
  const pollAttemptsRef = useRef(0);
  const MAX_POLL_ATTEMPTS = 30; // Poll for up to 30 seconds (1 second intervals)

  const reference = searchParams.get('reference');

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login');
      return;
    }

    if (!reference) {
      setStatus('error');
      setMessage('Invalid payment reference. Please contact support.');
      return;
    }

    // Start polling for payment confirmation
    const pollPaymentStatus = async () => {
      try {
        const currentAttempt = pollAttemptsRef.current + 1;
        pollAttemptsRef.current = currentAttempt;
        
        setMessage('Verifying payment with server...');

        // Call backend to check payment status (lightweight endpoint)
        const response = await api.get(`/orders/payment-check/${reference}`);
        
        if (response.data.order) {
          const order = response.data.order;
          setOrderId(order.id);

          if (order.paymentStatus === 'PAID') {
            setStatus('success');
            setMessage('✓ Payment confirmed! Redirecting to order tracking...');
            
            // Fetch full order details before redirecting
            try {
              const fullOrderResponse = await api.get(`/orders/by-reference/${reference}`);
              const fullOrder = fullOrderResponse.data.order;
              
              // Redirect after brief delay
              setTimeout(() => {
                navigate('/my-orders', {
                  state: {
                    orderId: fullOrder.id,
                    message: 'Payment successful! Your order has been confirmed.',
                  }
                });
              }, 1500);
            } catch (err) {
              console.warn('Could not fetch full order details:', err);
              // Still redirect even if full details fail
              setTimeout(() => {
                navigate('/my-orders', {
                  state: {
                    orderId: order.id,
                    message: 'Payment successful! Your order has been confirmed.',
                  }
                });
              }, 1500);
            }
          } else if (order.paymentStatus === 'REFUND_PENDING') {
            // Stock failed or order couldn't be completed after payment succeeded
            setStatus('refund_required');
            setMessage('');
            // STOP polling immediately - don't continue checking status
          } else if (order.paymentStatus === 'PENDING') {
            // Payment still processing, retry
            if (currentAttempt < MAX_POLL_ATTEMPTS) {
              setMessage(`Waiting for payment confirmation... (${currentAttempt}/${MAX_POLL_ATTEMPTS})`);
              
              // Retry after 1 second
              setTimeout(pollPaymentStatus, 1000);
            } else {
              setStatus('error');
              setMessage('Payment processing is taking longer than expected. Your order will be confirmed shortly. Check your email for updates.');
              
              // Still redirect to orders page so user can see the order
              setTimeout(() => {
                navigate('/my-orders', {
                  state: {
                    orderId: order.id,
                  }
                });
              }, 5000);
            }
          } else if (order.paymentStatus === 'FAILED') {
            setStatus('error');
            setMessage('❌ Payment failed. Please try again or contact support.');
            
            // Redirect to checkout to retry
            setTimeout(() => {
              navigate('/checkout');
            }, 3000);
          }
        } else {
          // Order not found
          if (currentAttempt < MAX_POLL_ATTEMPTS) {
            setMessage(`Syncing order data... (${currentAttempt}/${MAX_POLL_ATTEMPTS})`);
            setTimeout(pollPaymentStatus, 1000);
          } else {
            setStatus('error');
            setMessage('Order not found. Please contact support with reference: ' + reference);
          }
        }
      } catch (err) {
        console.error('Error checking payment status:', err);
        const currentAttempt = pollAttemptsRef.current;
        
        if (err.response?.status === 401) {
          navigate('/login');
        } else if (currentAttempt < MAX_POLL_ATTEMPTS) {
          // Retry on error
          const nextAttempt = currentAttempt + 1;
          pollAttemptsRef.current = nextAttempt;
          setMessage(`Retrying... (${nextAttempt}/${MAX_POLL_ATTEMPTS})`);
          setTimeout(pollPaymentStatus, 1000);
        } else {
          setStatus('error');
          setMessage('Unable to verify payment. Please check your email for confirmation or contact support.');
        }
      }
    };

    // Start the polling process
    pollPaymentStatus();

  }, [authLoading, user, navigate, reference]);

  return (
    <div className="page payment-status-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Container>
        <div style={{
          maxWidth: '500px',
          margin: '0 auto',
          padding: '3rem 2rem',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          {/* Processing State */}
          {status === 'processing' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <i className="fas fa-spinner fa-spin" style={{
                  fontSize: '4rem',
                  color: '#2D8659'
                }}></i>
              </div>
              <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#333' }}>
                Processing Payment
              </h2>
              <p style={{
                fontSize: '1.1rem',
                color: '#666',
                marginBottom: '1rem',
                lineHeight: '1.6'
              }}>
                {message}
              </p>
              <p style={{
                fontSize: '0.9rem',
                color: '#999',
                marginBottom: 0
              }}>
                Please do not refresh or close this page
              </p>
            </>
          )}

          {/* Success State */}
          {status === 'success' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <i className="fas fa-check-circle" style={{
                  fontSize: '4rem',
                  color: '#28a745'
                }}></i>
              </div>
              <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#28a745' }}>
                Payment Successful!
              </h2>
              <p style={{
                fontSize: '1.1rem',
                color: '#666',
                marginBottom: '1rem',
                lineHeight: '1.6'
              }}>
                {message}
              </p>
              {orderId && (
                <p style={{
                  fontSize: '0.9rem',
                  color: '#999',
                  marginBottom: 0
                }}>
                  Order ID: <strong>#{orderId}</strong>
                </p>
              )}
            </>
          )}

          {/* Error State */}
          {status === 'error' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <i className="fas fa-exclamation-circle" style={{
                  fontSize: '4rem',
                  color: '#dc3545'
                }}></i>
              </div>
              <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#dc3545' }}>
                Payment Status
              </h2>
              <p style={{
                fontSize: '1.1rem',
                color: '#666',
                marginBottom: '1rem',
                lineHeight: '1.6'
              }}>
                {message}
              </p>
              <p style={{
                fontSize: '0.9rem',
                color: '#999',
                marginBottom: '1rem'
              }}>
                Reference: <code style={{ backgroundColor: '#e9ecef', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{reference}</code>
              </p>
              <button
                onClick={() => navigate('/my-orders')}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#2D8659',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  marginTop: '1rem'
                }}
              >
                View Orders
              </button>
            </>
          )}

          {/* Refund Required State */}
          {status === 'refund_required' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <i className="fas fa-warning" style={{
                  fontSize: '4rem',
                  color: '#ff9800'
                }}></i>
              </div>
              <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#ff9800' }}>
                ⚠️ Order Could Not Be Completed
              </h2>
              <div style={{
                backgroundColor: '#fff8e1',
                border: '1px solid #ffecb3',
                borderRadius: '4px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                textAlign: 'left'
              }}>
                <p style={{
                  fontSize: '1rem',
                  color: '#333',
                  marginBottom: '1rem',
                  lineHeight: '1.6'
                }}>
                  Your payment has been successfully received.
                  <br />
                  However, we regret to inform you that your order could not be completed.
                </p>

                <p style={{
                  fontSize: '0.95rem',
                  color: '#555',
                  fontWeight: '600',
                  marginBottom: '0.5rem'
                }}>
                  This may happen when:
                </p>
                <ul style={{
                  fontSize: '0.9rem',
                  color: '#666',
                  marginBottom: '1rem',
                  paddingLeft: '1.5rem'
                }}>
                  <li>Another customer completed the purchase at the same time</li>
                  <li>The item went out of stock during checkout</li>
                  <li>The available quantity was no longer sufficient</li>
                </ul>

                <p style={{
                  fontSize: '0.95rem',
                  color: '#333',
                  marginBottom: '0.5rem',
                  fontWeight: '600'
                }}>
                  💰 Refund Notice:
                </p>
                <p style={{
                  fontSize: '0.9rem',
                  color: '#666',
                  marginBottom: 0,
                  lineHeight: '1.6'
                }}>
                  A refund has been initiated and will be processed shortly.
                  Our team has been notified and is reviewing your order.
                </p>
              </div>

              <p style={{
                fontSize: '0.85rem',
                color: '#999',
                marginBottom: '1.5rem'
              }}>
                Order ID: <strong>#{orderId || 'N/A'}</strong>
              </p>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                onClick={() => navigate('/products')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#2D8659',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '600'
                  }}
                >
                  <i className="fas fa-shopping-bag" style={{ marginRight: '0.5rem' }}></i>
                  Return to Shop
                </button>
                <button
                  onClick={() => navigate('/my-orders')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'transparent',
                    color: '#2D8659',
                    border: '2px solid #2D8659',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = '#2D8659';
                    e.target.style.color = 'white';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = 'transparent';
                    e.target.style.color = '#2D8659';
                  }}
                >
                  <i className="fas fa-info-circle" style={{ marginRight: '0.5rem' }}></i>
                  View My Orders
                </button>
              </div>
            </>
          )}
        </div>
      </Container>
    </div>
  );
};

export default PaymentSuccess;
