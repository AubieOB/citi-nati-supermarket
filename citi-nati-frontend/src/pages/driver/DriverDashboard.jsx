import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useOrderUpdates } from '../../hooks/useOrderUpdates.js';
import { formatMWK } from '../../utils/currency.js';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/**
 * DRIVER DASHBOARD
 * 
 * Strictly contract-driven:
 * - Assigned orders (ASSIGNED status)
 * - In-transit orders (IN_TRANSIT status)
 * - Completed orders (DELIVERED status)
 * - Order details modal with Google Maps
 */

const DriverDashboard = () => {
  const navigate = useNavigate();
  const [assignedOrders, setAssignedOrders] = useState([]);
  const [inTransitOrders, setInTransitOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const { user } = useAuth();
  const { modal, closeModal, showError, showConfirm, showSuccess } = useModal();

  useEffect(() => {
    fetchDriverOrders();
  }, []);

  /**
   * Fallback beep using Web Audio API
   */
  const playFallbackBeep = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      
      osc.start(audioContext.currentTime);
      osc.stop(audioContext.currentTime + 0.15);
      
      console.log('[Driver] ✅ Fallback beep played');
    } catch (err) {
      console.warn('[Driver] Beep failed:', err.message);
    }
  }, []);

  /**
   * Play notification sound with fallback
   */
  const playSound = useCallback(() => {
    try {
      const audio = new Audio('/classic-door-bell.wav');
      audio.volume = 0.8; // Increased volume for better audibility
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[Driver] ✅ Notification sound played');
          })
          .catch((err) => {
            console.warn('[Driver] ⚠️ Audio playback blocked:', err.message);
            // Fallback to beep if audio blocked
            playFallbackBeep();
          });
      }
    } catch (err) {
      console.error('[Driver] Audio error:', err.message);
      playFallbackBeep();
    }
  }, [playFallbackBeep]);

  /**
   * Fetch driver's assigned orders
   */
  const fetchDriverOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/drivers/orders');
      const orders = response.data.orders || [];

      // Filter orders by status
      setAssignedOrders(orders.filter((o) => o.status === 'ASSIGNED'));
      setInTransitOrders(orders.filter((o) => o.status === 'IN_TRANSIT'));
      setCompletedOrders(orders.filter((o) => o.status === 'DELIVERED'));
    } catch (err) {
      console.error('[DRIVER] Error fetching driver orders:', err);
      setError(err.response?.data?.error || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Listen for real-time order updates assigned to this driver
   */
  const handleOrderUpdated = useCallback((updatedOrder) => {
    console.log('[DRIVER] Order updated:', updatedOrder);

    // New order assigned to this driver
    if (updatedOrder.status === 'ASSIGNED') {
      console.log('[DRIVER] Notification: New order assigned');
      playSound();
      toast.success(`🎉 New order assigned: #${updatedOrder.id}`, {
        duration: 4000,
      });
      // Refresh orders to show new assignment
      fetchDriverOrders();
    }

    // Order started transit
    if (updatedOrder.status === 'IN_TRANSIT') {
      console.log('[DRIVER] Notification: Delivery started');
      toast(`🚚 Delivery started for order #${updatedOrder.id}`, {
        icon: '🚚',
        duration: 3000,
      });
      fetchDriverOrders();
    }

    // Order delivered
    if (updatedOrder.status === 'DELIVERED') {
      console.log('[DRIVER] Notification: Order delivered');
      playSound();
      toast.success(`✅ Order #${updatedOrder.id} delivered successfully! 🎉`, {
        duration: 4000,
      });
      // Refresh orders to update completed list
      fetchDriverOrders();
    }
  }, [playSound, fetchDriverOrders]);

  useOrderUpdates(handleOrderUpdated, {
    role: 'driver',
    userId: user?.id,
    driverId: user?.id,
  });


  const openOrderDetails = async (orderId) => {
    try {
      setDetailsLoading(true);
      const response = await api.get(`/orders/${orderId}`);
      setSelectedOrder(response.data.order);
      setIsDetailsOpen(true);
    } catch (err) {
      console.error('Error fetching order details:', err);
      showError('Error', err.response?.data?.error || 'Failed to load order details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeOrderDetails = () => {
    setIsDetailsOpen(false);
    setSelectedOrder(null);
  };

  const startDelivery = async (orderId) => {
    let order = selectedOrder;
    if (!order) {
      order = assignedOrders.find(o => o.id === orderId);
    }
    if (!order) return;
    
    showConfirm(
      'Start Delivery?',
      `Are you sure you want to start delivery for order #${order.id}?`,
      async () => {
        try {
          await api.put(`/orders/${orderId}/status`, { status: 'IN_TRANSIT' });
          await fetchDriverOrders();
          showSuccess('Success', 'Delivery started');
          closeOrderDetails();
        } catch (err) {
          console.error('Error starting delivery:', err);
          showError('Error', err.response?.data?.error || 'Failed to start delivery');
        }
      }
    );
  };

  const markDelivered = async (orderId) => {
    let order = selectedOrder;
    if (!order) {
      order = inTransitOrders.find(o => o.id === orderId);
    }
    if (!order) return;
    
    showConfirm(
      'Mark as Delivered?',
      `Are you sure you want to mark order #${order.id} as delivered?`,
      async () => {
        try {
          await api.put(`/orders/${orderId}/status`, { status: 'DELIVERED' });
          await fetchDriverOrders();
          showSuccess('Success', 'Order marked as delivered');
          closeOrderDetails();
        } catch (err) {
          console.error('Error marking delivered:', err);
          showError('Error', err.response?.data?.error || 'Failed to mark delivered');
        }
      }
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Separate completed orders into new (today) and old (previous days)
  const getGroupedCompletedOrders = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newOrders = [];
    const oldOrders = [];

    completedOrders.forEach((order) => {
      // Use updatedAt for completed orders since that's when they were marked delivered
      const orderDate = new Date(order.updatedAt || order.createdAt);
      orderDate.setHours(0, 0, 0, 0);

      if (orderDate.getTime() === today.getTime()) {
        newOrders.push(order);
      } else {
        oldOrders.push(order);
      }
    });

    // Sort each group by updatedAt (or createdAt) descending (most recent first)
    newOrders.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    oldOrders.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    return { newOrders, oldOrders };
  };

  /**
   * Calculate metrics from orders
   * No stats endpoint exists - calculate from actual data
   */
  const getMetrics = () => {
    const totalDeliveries = completedOrders.length;
    const totalEarnings = completedOrders.reduce((sum, order) => sum + order.total, 0);
    const activeDeliveries = inTransitOrders.length + assignedOrders.length;

    return {
      totalDeliveries,
      totalEarnings,
      activeDeliveries,
    };
  };

  const metrics = getMetrics();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Loading your orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '1rem',
          borderRadius: '4px',
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ color: '#5B4B8A', margin: '0' }}><i className="fas fa-car" style={{ marginRight: '0.5rem' }}></i>Driver Dashboard</h1>
        <button
          onClick={() => navigate('/')}
          style={{
            backgroundColor: '#5B4B8A',
            color: '#fff',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'background-color 0.3s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A3A78'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5B4B8A'}
        >
          <i className="fas fa-home"></i>
          <span>Home</span>
        </button>
      </div>

      {/* 📊 Metrics Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ color: '#5B4B8A', fontSize: '1.2rem', marginBottom: '1.5rem' }}>
          <i className="fas fa-chart-bar" style={{ marginRight: '0.5rem' }}></i>Your Earnings & Metrics
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          {/* Total Deliveries Card */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '2px solid #2D8659',
              borderRadius: '8px',
              padding: '1.5rem',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: '0', fontSize: '0.9rem', color: '#666', fontWeight: '600' }}>
                  Total Deliveries
                </p>
                <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2rem', color: '#2D8659', fontWeight: 'bold' }}>
                  {metrics.totalDeliveries}
                </h3>
              </div>
              <div style={{ fontSize: '2.5rem', color: '#2D8659', opacity: '0.3' }}>
                <i className="fas fa-box"></i>
              </div>
            </div>
          </div>

          {/* Total Earnings Card */}
          <div
            style={{
              backgroundColor: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '1.5rem',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: '0', fontSize: '0.9rem', color: '#666', fontWeight: '600' }}>
                  Total Earnings
                </p>
                <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2rem', color: '#5B4B8A', fontWeight: 'bold' }}>
                  MWK {metrics.totalEarnings.toLocaleString()}
                </h3>
              </div>
              <div style={{ fontSize: '2.5rem', color: '#5B4B8A', opacity: '0.3' }}>
                <i className="fas fa-money-bill-wave"></i>
              </div>
            </div>
          </div>

          {/* Active Deliveries Card */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '2px solid #ffc107',
              borderRadius: '8px',
              padding: '1.5rem',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: '0', fontSize: '0.9rem', color: '#666', fontWeight: '600' }}>
                  Active Deliveries
                </p>
                <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2rem', color: '#ffc107', fontWeight: 'bold' }}>
                  {metrics.activeDeliveries}
                </h3>
              </div>
              <div style={{ fontSize: '2.5rem', color: '#ffc107', opacity: '0.3' }}>
                <i className="fas fa-truck"></i>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Assigned Orders Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ color: '#5B4B8A', fontSize: '1.3rem', marginBottom: '1rem' }}>
          <i className="fas fa-box" style={{ marginRight: '0.5rem' }}></i>Available Orders ({assignedOrders.length})
        </h2>
        {assignedOrders.length === 0 ? (
          <div
            style={{
              backgroundColor: '#cfe2ff',
              color: '#084298',
              padding: '1.5rem',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            No available orders at the moment
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem',
            }}
          >
            {assignedOrders.map((order) => (
              <div
                key={order.id}
                style={{
                  backgroundColor: '#fff',
                  border: '2px solid #ffc107',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
              >
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#666' }}>
                  Order ID
                </p>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', color: '#333' }}>
                  #{order.id}
                </h3>
                <p style={{ margin: '0.5rem 0', fontSize: '0.95rem' }}>
                  <strong>Address:</strong> {order.deliveryAddress}
                </p>
                <p style={{ margin: '0.5rem 0', fontSize: '0.95rem' }}>
                  <strong>House:</strong> {order.houseNumber}
                </p>
                <p style={{ margin: '0.5rem 0 1rem 0', fontSize: '1rem', color: '#2D8659', fontWeight: 'bold' }}>
                  {formatMWK(order.total)}
                </p>
                <p style={{ margin: '0.5rem 0 1rem 0', fontSize: '0.9rem', color: '#666' }}>
                  Created: {formatDate(order.createdAt)}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => openOrderDetails(order.id)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#5B4B8A',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => startDelivery(order.id)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Start Delivery
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* In Transit Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ color: '#5B4B8A', fontSize: '1.3rem', marginBottom: '1rem' }}>
          <i className="fas fa-truck" style={{ marginRight: '0.5rem' }}></i>In Transit ({inTransitOrders.length})
        </h2>
        {inTransitOrders.length === 0 ? (
          <div
            style={{
              backgroundColor: '#d1ecf1',
              color: '#0c5460',
              padding: '1.5rem',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            No orders in transit
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem',
            }}
          >
            {inTransitOrders.map((order) => (
              <div
                key={order.id}
                style={{
                  backgroundColor: '#fff',
                  border: '2px solid #17a2b8',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
              >
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#666' }}>
                  Order ID
                </p>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', color: '#333' }}>
                  #{order.id}
                </h3>
                <p style={{ margin: '0.5rem 0', fontSize: '0.95rem' }}>
                  <strong>Address:</strong> {order.deliveryAddress}
                </p>
                <p style={{ margin: '0.5rem 0 1rem 0', fontSize: '1rem', color: '#2D8659', fontWeight: 'bold' }}>
                  {formatMWK(order.total)}
                </p>

                {/* Map or Warning */}
                {order.latitude && order.longitude ? (
                  <div
                    style={{
                      marginBottom: '1rem',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <iframe
                      width="100%"
                      height="200"
                      loading="lazy"
                      src={`https://www.google.com/maps?q=${order.latitude},${order.longitude}&z=15&output=embed`}
                      style={{ border: 'none' }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      backgroundColor: '#fff3cd',
                      color: '#856404',
                      padding: '1rem',
                      borderRadius: '4px',
                      marginBottom: '1rem',
                      fontSize: '0.9rem',
                    }}
                  >
                    <i className="fas fa-map-marker-alt" style={{ marginRight: '0.5rem' }}></i>No coordinates available
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => openOrderDetails(order.id)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#5B4B8A',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => markDelivered(order.id)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Mark Delivered
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Completed Orders Section */}
      <section>
        {completedOrders.length === 0 ? (
          <>
            <h2 style={{ color: '#5B4B8A', fontSize: '1.3rem', marginBottom: '1rem' }}>
              <i className="fas fa-check-circle" style={{ marginRight: '0.5rem' }}></i>Completed (0)
            </h2>
            <div
              style={{
                backgroundColor: '#d1e7dd',
                color: '#0f5132',
                padding: '1.5rem',
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              No completed deliveries yet
            </div>
          </>
        ) : (
          (() => {
            const { newOrders, oldOrders } = getGroupedCompletedOrders();

            return (
              <>
                {/* New Completed Orders (Today) */}
                {newOrders.length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    <h2 style={{ color: '#2D8659', fontSize: '1.3rem', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                      <i className="fas fa-star" style={{ marginRight: '0.5rem', color: '#FF6B6B' }}></i>
                      Completed Today ({newOrders.length})
                    </h2>
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          backgroundColor: '#fff',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                          <tr>
                            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>
                              Order ID
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>
                              Address
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                              Total
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>
                              Completed At
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {newOrders.map((order) => (
                            <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '1rem' }}>#{order.id}</td>
                              <td style={{ padding: '1rem' }}>{order.deliveryAddress}</td>
                              <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659', fontWeight: '600' }}>
                                {formatMWK(order.total)}
                              </td>
                              <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                                {formatDate(order.updatedAt)}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'center' }}>
                                <button
                                  onClick={() => openOrderDetails(order.id)}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#5B4B8A',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.9rem',
                                  }}
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Old Completed Orders (Previous Days) */}
                {oldOrders.length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    <h2 style={{ color: '#999', fontSize: '1.3rem', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                      <i className="fas fa-history" style={{ marginRight: '0.5rem' }}></i>
                      Previous Deliveries ({oldOrders.length})
                    </h2>
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          backgroundColor: '#fff',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                          <tr>
                            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>
                              Order ID
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>
                              Address
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                              Total
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>
                              Completed At
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {oldOrders.map((order) => (
                            <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '1rem' }}>#{order.id}</td>
                              <td style={{ padding: '1rem' }}>{order.deliveryAddress}</td>
                              <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659', fontWeight: '600' }}>
                                {formatMWK(order.total)}
                              </td>
                              <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                                {formatDate(order.updatedAt)}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'center' }}>
                                <button
                                  onClick={() => openOrderDetails(order.id)}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#5B4B8A',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.9rem',
                                  }}
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })()
        )}
      </section>

      {/* Order Details Modal */}
      {isDetailsOpen && selectedOrder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={closeOrderDetails}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                backgroundColor: '#5B4B8A',
                color: '#fff',
                padding: '1.5rem',
                borderRadius: '8px 8px 0 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 style={{ margin: 0 }}>Order #{selectedOrder.id}</h2>
              <button
                onClick={closeOrderDetails}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '2rem' }}>
              {/* Status Timeline */}
              <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Delivery Timeline</h3>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    position: 'relative',
                    padding: '0 1rem',
                  }}
                >
                  {/* Timeline Line */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '20px',
                      left: '2rem',
                      right: '2rem',
                      height: '2px',
                      backgroundColor: '#ddd',
                      zIndex: 0,
                    }}
                  />

                  {/* Timeline Items */}
                  {['ASSIGNED', 'IN_TRANSIT', 'DELIVERED'].map((status, idx) => {
                    const statuses = ['ASSIGNED', 'IN_TRANSIT', 'DELIVERED'];
                    const currentIdx = statuses.indexOf(selectedOrder.status);
                    const statusIdx = statuses.indexOf(status);
                    const isActive = statusIdx === currentIdx;
                    const isCompleted = statusIdx < currentIdx;

                    return (
                      <div
                        key={status}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          flex: 1,
                          position: 'relative',
                          zIndex: 1,
                        }}
                      >
                        {/* Circle */}
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            backgroundColor: isActive ? '#5B4B8A' : isCompleted ? '#28a745' : '#ddd',
                            border: `3px solid ${isActive ? '#5B4B8A' : isCompleted ? '#28a745' : '#ddd'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: '1.1rem',
                          }}
                        >
                          {isCompleted && <i className="fas fa-check"></i>}
                          {isActive && <i className="fas fa-spinner"></i>}
                          {!isCompleted && !isActive && idx + 1}
                        </div>

                        {/* Label */}
                        <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', fontWeight: '600', textAlign: 'center', color: isActive ? '#5B4B8A' : '#666' }}>
                          {status}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Basic Info */}
              <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Order Information</h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                    backgroundColor: '#f8f9fa',
                    padding: '1rem',
                    borderRadius: '4px',
                  }}
                >
                  <div>
                    <label style={{ fontWeight: '600', color: '#666' }}>Status</label>
                    <p
                      style={{
                        margin: '0.5rem 0 0 0',
                        fontSize: '1rem',
                        color: '#333',
                        fontWeight: '600',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          backgroundColor:
                            selectedOrder.status === 'ASSIGNED'
                              ? '#ffc107'
                              : selectedOrder.status === 'IN_TRANSIT'
                              ? '#17a2b8'
                              : '#28a745',
                          color: '#fff',
                          fontSize: '0.9rem',
                        }}
                      >
                        {selectedOrder.status}
                      </span>
                    </p>
                  </div>

                  <div>
                    <label style={{ fontWeight: '600', color: '#666' }}>Payment</label>
                    <p
                      style={{
                        margin: '0.5rem 0 0 0',
                        fontSize: '1rem',
                        color: '#333',
                        fontWeight: '600',
                      }}
                    >
                      {selectedOrder.paymentStatus}
                    </p>
                  </div>

                  <div>
                    <label style={{ fontWeight: '600', color: '#666' }}>Total</label>
                    <p
                      style={{
                        margin: '0.5rem 0 0 0',
                        fontSize: '1.1rem',
                        color: '#2D8659',
                        fontWeight: 'bold',
                      }}
                    >
                      {formatMWK(selectedOrder.total)}
                    </p>
                  </div>

                  <div>
                    <label style={{ fontWeight: '600', color: '#666' }}>Created</label>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#333' }}>
                      {formatDate(selectedOrder.createdAt)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Delivery Address */}
              <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Delivery Address</h3>
                <div
                  style={{
                    backgroundColor: '#f8f9fa',
                    padding: '1rem',
                    borderRadius: '4px',
                  }}
                >
                  <p style={{ margin: '0.5rem 0' }}>
                    <strong>Address:</strong> {selectedOrder.deliveryAddress}
                  </p>
                  <p style={{ margin: '0.5rem 0' }}>
                    <strong>House:</strong> {selectedOrder.houseNumber}
                  </p>
                  {selectedOrder.phone && (
                    <p style={{ margin: '0.5rem 0' }}>
                      <strong><i className="fas fa-phone" style={{ marginRight: '0.3rem' }}></i>Phone:</strong> <a href={`tel:${selectedOrder.phone}`} style={{ color: '#2D8659', textDecoration: 'none', cursor: 'pointer' }}>{selectedOrder.phone}</a>
                    </p>
                  )}
                  {selectedOrder.latitude && selectedOrder.longitude && (
                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                      <p style={{ margin: '0', fontSize: '0.9rem', color: '#666' }}>
                        <i className="fas fa-map-marker-alt" style={{ marginRight: '0.5rem' }}></i>{selectedOrder.latitude.toFixed(4)}, {selectedOrder.longitude.toFixed(4)}
                      </p>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${selectedOrder.latitude},${selectedOrder.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#2D8659',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: '4px',
                          fontWeight: '600',
                          fontSize: '0.9rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <i className="fas fa-map"></i>Navigate
                      </a>
                    </div>
                  )}
                </div>
              </section>

              {/* Google Map */}
              {selectedOrder.latitude && selectedOrder.longitude && (
                <section style={{ marginBottom: '2rem' }}>
                  <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Location</h3>
                  <iframe
                    width="100%"
                    height="300"
                    loading="lazy"
                    src={`https://www.google.com/maps?q=${selectedOrder.latitude},${selectedOrder.longitude}&z=15&output=embed`}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    }}
                  />
                </section>
              )}

              {/* Order Items */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <section style={{ marginBottom: '2rem' }}>
                  <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Items</h3>
                  <div
                    style={{
                      backgroundColor: '#f8f9fa',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ backgroundColor: '#e0e0e0' }}>
                        <tr>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>
                            Product
                          </th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>
                            Qty
                          </th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                            Price
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '0.75rem' }}>
                              {item.product?.name || 'Product'}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              {item.quantity}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                              {formatMWK(item.price * item.quantity)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Customer Info */}
              {selectedOrder.user && (
                <section style={{ marginBottom: '2rem' }}>
                  <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Customer</h3>
                  <div
                    style={{
                      backgroundColor: '#f8f9fa',
                      padding: '1rem',
                      borderRadius: '4px',
                    }}
                  >
                    <p style={{ margin: '0.5rem 0' }}>
                      <strong>Name:</strong> {selectedOrder.user.name}
                    </p>
                    <p style={{ margin: '0.5rem 0' }}>
                      <strong>Email:</strong> {selectedOrder.user.email}
                    </p>
                    {selectedOrder.user.phone && (
                      <p style={{ margin: '0.5rem 0' }}>
                        <strong>Phone:</strong> {selectedOrder.user.phone}
                      </p>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '1.5rem',
                backgroundColor: '#f8f9fa',
                borderTop: '1px solid #ddd',
                borderRadius: '0 0 8px 8px',
                display: 'flex',
                gap: '1rem',
              }}
            >
              {/* Status-based actions: Only show valid transitions */}
              {selectedOrder.status === 'ASSIGNED' && (
                <>
                  <button
                    onClick={() => startDelivery(selectedOrder.id)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    <i className="fas fa-play" style={{ marginRight: '0.5rem' }}></i>Start Delivery
                  </button>
                  <button
                    onClick={closeOrderDetails}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#6c757d',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Close
                  </button>
                </>
              )}

              {selectedOrder.status === 'IN_TRANSIT' && (
                <>
                  <button
                    onClick={() => markDelivered(selectedOrder.id)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    <i className="fas fa-check" style={{ marginRight: '0.5rem' }}></i>Mark Delivered
                  </button>
                  <button
                    onClick={closeOrderDetails}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#6c757d',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Close
                  </button>
                </>
              )}

              {selectedOrder.status === 'DELIVERED' && (
                <button
                  onClick={closeOrderDetails}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: '#6c757d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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

export default DriverDashboard;
