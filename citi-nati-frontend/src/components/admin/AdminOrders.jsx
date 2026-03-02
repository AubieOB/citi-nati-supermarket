import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import { getSocket } from '../../utils/socket.js';
import OrderDetailsModal from './OrderDetailsModal.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { notifySuccess, notifyError } from '../../utils/notifications.js';

/**
 * 📋 ADMIN ORDERS MANAGEMENT
 * 
 * View all orders, assign drivers, update status
 */

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const { modal, closeModal, showError, showSuccess, showConfirm } = useModal();
  const [updatingStatus, setUpdatingStatus] = useState(null);

  useEffect(() => {
    fetchOrders();
    fetchDrivers();
  }, []);

  /**
   * Real-time order updates via Socket.io
   */
  useEffect(() => {
    try {
      const socket = getSocket();
      if (!socket) {
        console.warn('[AdminOrders] Socket not initialized');
        return;
      }

      const handleOrderUpdated = (updatedOrder) => {
        console.log('[AdminOrders] Order updated via Socket.io:', updatedOrder.id);

        if (!updatedOrder?.id) return;

        // Refresh orders list when any order is updated
        fetchOrders();

        // Show toast for status changes
        if (['REFUND_PENDING', 'CANCELLED', 'DELIVERED'].includes(updatedOrder.status)) {
          toast(`📦 Order #${updatedOrder.id}: ${updatedOrder.status}`, {
            duration: 3000,
          });
        }
      };

      socket.on('orderUpdated', handleOrderUpdated);
      console.log('[AdminOrders] Socket.io listener registered for orderUpdated');

      return () => {
        socket.off('orderUpdated', handleOrderUpdated);
        console.log('[AdminOrders] Socket.io listener removed');
      };
    } catch (err) {
      console.error('[AdminOrders] Socket.io setup error:', err);
    }
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/admin/orders');
      setOrders(response.data.orders || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err.response?.data?.error || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const response = await api.get('/drivers');
      setDrivers(response.data.drivers || []);
    } catch (err) {
      console.error('Error fetching drivers:', err);
    }
  };

  const openOrderDetails = async (orderId) => {
    try {
      setDetailsLoading(true);
      const response = await api.get(`/admin/orders/${orderId}`);
      setSelectedOrder(response.data.order);
      setIsDetailsOpen(true);
    } catch (err) {
      console.error('Error fetching order details:', err);
      notifyError(`Failed to load order details: ${err.response?.data?.error || 'Unknown error'}`, 4000);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeOrderDetails = () => {
    setIsDetailsOpen(false);
    setSelectedOrder(null);
  };

  const handleStatusUpdate = (newStatus) => {
    setSelectedOrder(prev => ({ ...prev, status: newStatus }));
    setOrders(orders.map(o => o.id === selectedOrder.id ? { ...o, status: newStatus } : o));
  };

  const handleDriverAssign = (driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    setSelectedOrder(prev => ({ ...prev, driverId, driver }));
    setOrders(orders.map(o => o.id === selectedOrder.id ? { ...o, driverId, driver } : o));
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      setUpdatingStatus(orderId);
      await api.put(`/orders/${orderId}/status`, { status: newStatus });
      await fetchOrders();
      
      // Show success notification with sound
      if (newStatus === 'IN_TRANSIT') {
        notifySuccess(`🚚 Order #${orderId} is now in transit!`, 4000);
      } else if (newStatus === 'DELIVERED') {
        notifySuccess(`✅ Order #${orderId} delivered!`, 4000);
      } else if (newStatus === 'CANCELLED') {
        notifySuccess(`❌ Order #${orderId} cancelled`, 4000);
      } else {
        notifySuccess(`Order #${orderId} status updated to ${newStatus}`, 4000);
      }
    } catch (err) {
      console.error('Error updating status:', err);
      notifyError(`Failed to update order status: ${err.response?.data?.error || 'Unknown error'}`, 4000);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const assignDriver = async (orderId, driverId) => {
    if (!driverId) return;
    
    const driver = drivers.find(d => d.id === driverId);
    const driverName = driver ? driver.name : `Driver #${driverId}`;
    
    showConfirm(
      'Assign Driver?',
      `Are you sure you want to assign ${driverName} to this order?`,
      async () => {
        try {
          await api.put(`/orders/${orderId}/assign-driver`, { driverId });
          await fetchOrders();
          notifySuccess(`📦 ${driverName} assigned to order #${orderId}!`, 4000);
        } catch (err) {
          console.error('Error assigning driver:', err);
          notifyError(`Failed to assign driver: ${err.response?.data?.error || 'Unknown error'}`, 4000);
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

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading orders...</div>;
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: '#f8d7da',
        color: '#721c24',
        padding: '1rem',
        borderRadius: '4px',
      }}>
        {error}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '2rem',
        borderRadius: '8px',
        textAlign: 'center',
        color: '#666',
      }}>
        No orders yet
      </div>
    );
  }

  return (
    <div>
      {/* Get grouped orders */}
      {(() => {
        const { newOrders, oldOrders } = getGroupedOrders();

        return (
          <>
            {/* New Orders Section */}
            {newOrders.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#2D8659', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                  <i className="fas fa-star" style={{ marginRight: '0.5rem', color: '#FF6B6B' }}></i>
                  New Orders Today ({newOrders.length})
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  }}>
                    <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                      <tr>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Order ID</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Customer</th>
                        <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Total</th>
                        <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Status</th>
                        <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Driver</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Date</th>
                        <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newOrders.map((order) => (
                        <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '1rem' }}>#{order.id}</td>
                          <td style={{ padding: '1rem' }}>{order.user?.name || 'N/A'}</td>
                          <td style={{
                            padding: '1rem',
                            textAlign: 'right',
                            color: '#2D8659',
                            fontWeight: '600',
                          }}>
                            {formatMWK(order.total)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <select
                              value={order.status}
                              onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                              disabled={updatingStatus === order.id}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: order.status === 'PENDING' ? '#fff3cd'
                                  : order.status === 'CONFIRMED' ? '#cfe2ff'
                                  : order.status === 'DELIVERED' ? '#d1e7dd'
                                  : '#f8d7da',
                              }}
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="CONFIRMED">CONFIRMED</option>
                              <option value="DELIVERED">DELIVERED</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            {order.driverId ? (
                              <span style={{ color: '#4caf50', fontWeight: '600' }}>
                                {order.driver?.name}
                              </span>
                            ) : (
                              <select
                                onChange={(e) => assignDriver(order.id, e.target.value)}
                                style={{
                                  padding: '0.5rem',
                                  borderRadius: '4px',
                                  border: 'none',
                                }}
                              >
                                <option value="">Assign Driver</option>
                                {drivers.map((driver) => (
                                  <option key={driver.id} value={driver.id}>
                                    {driver.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                            {formatDate(order.createdAt)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <button
                              onClick={() => openOrderDetails(order.id)}
                              disabled={detailsLoading}
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

            {/* Old Orders Section */}
            {oldOrders.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#666', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                  <i className="fas fa-history" style={{ marginRight: '0.5rem', color: '#999' }}></i>
                  Previous Orders ({oldOrders.length})
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  }}>
                    <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                      <tr>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Order ID</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Customer</th>
                        <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Total</th>
                        <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Status</th>
                        <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Driver</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Date</th>
                        <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oldOrders.map((order) => (
                        <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '1rem' }}>#{order.id}</td>
                          <td style={{ padding: '1rem' }}>{order.user?.name || 'N/A'}</td>
                          <td style={{
                            padding: '1rem',
                            textAlign: 'right',
                            color: '#2D8659',
                            fontWeight: '600',
                          }}>
                            {formatMWK(order.total)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <select
                              value={order.status}
                              onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                              disabled={updatingStatus === order.id}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: order.status === 'PENDING' ? '#fff3cd'
                                  : order.status === 'CONFIRMED' ? '#cfe2ff'
                                  : order.status === 'DELIVERED' ? '#d1e7dd'
                                  : '#f8d7da',
                              }}
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="CONFIRMED">CONFIRMED</option>
                              <option value="DELIVERED">DELIVERED</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            {order.driverId ? (
                              <span style={{ color: '#4caf50', fontWeight: '600' }}>
                                {order.driver?.name}
                              </span>
                            ) : (
                              <select
                                onChange={(e) => assignDriver(order.id, e.target.value)}
                                style={{
                                  padding: '0.5rem',
                                  borderRadius: '4px',
                                  border: 'none',
                                }}
                              >
                                <option value="">Assign Driver</option>
                                {drivers.map((driver) => (
                                  <option key={driver.id} value={driver.id}>
                                    {driver.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                            {formatDate(order.createdAt)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <button
                              onClick={() => openOrderDetails(order.id)}
                              disabled={detailsLoading}
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
      })()}

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        isOpen={isDetailsOpen}
        onClose={closeOrderDetails}
        drivers={drivers}
        onStatusUpdate={handleStatusUpdate}
        onDriverAssign={handleDriverAssign}
      />
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

export default AdminOrders;
