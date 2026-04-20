import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import { getSocket } from '../../utils/socket.js';
import OrderDetailsModal from './OrderDetailsModal.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { notifySuccess, notifyError } from '../../utils/notifications.js';
import { generateAdminOrdersTablePDF } from '../../utils/pdfReports.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSION_KEYS, hasPermission } from '../../utils/permissions.js';
import useMobileViewport from '../../hooks/useMobileViewport.js';
import '../../css/admin-responsive-filters.css';

/**
 * 📋 ADMIN ORDERS MANAGEMENT
 * 
 * View all orders, assign drivers, update status
 */

const AdminOrders = () => {
  const { user: loggedInUser } = useAuth();
  const isMobileViewport = useMobileViewport();
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const { modal, closeModal, showError, showSuccess, showConfirm } = useModal();
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const filterBarRef = useRef(null);
  const canManageOrders = hasPermission(loggedInUser, PERMISSION_KEYS.ADMIN_ORDERS_MANAGE);

  useEffect(() => {
    fetchOrders();
    if (canManageOrders) {
      fetchDrivers();
    }
  }, [canManageOrders]);

  /**
   * Real-time order updates via Socket.io
   * Listens for:
   * 1. New orders (newOrder event) - Adds to list immediately
   * 2. Updated orders (orderUpdated event) - Updates existing order
   */
  useEffect(() => {
    try {
      const socket = getSocket();
      if (!socket) {
        console.warn('[AdminOrders] Socket not initialized');
        return;
      }

      // Handle NEW orders arriving in real-time
      const handleNewOrder = (newOrder) => {
        console.log('[AdminOrders] New order received via Socket.io:', newOrder.id);

        if (!newOrder?.id) return;

        // Add new order to the top of the list
        setOrders(prevOrders => [newOrder, ...prevOrders]);

        // Show celebratory notification
        toast(`🎉 New Order #${newOrder.id} from ${newOrder.user?.name || 'Customer'}!`, {
          duration: 4000,
          icon: '📋',
        });
      };

      // Handle UPDATED orders (status changes, driver assignment, etc.)
      const handleOrderUpdated = (updatedOrder) => {
        console.log('[AdminOrders] Order updated via Socket.io:', updatedOrder.id);

        if (!updatedOrder?.id) return;

        // Update individual order in state instead of refetching all
        setOrders(prevOrders => 
          prevOrders.map(order => 
            order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order
          )
        );

        // Show toast for status changes
        if (['REFUND_PENDING', 'CANCELLED', 'DELIVERED'].includes(updatedOrder.status)) {
          toast(`📦 Order #${updatedOrder.id}: ${updatedOrder.status}`, {
            duration: 3000,
          });
        }
      };

      socket.on('newOrder', handleNewOrder);
      socket.on('orderUpdated', handleOrderUpdated);
      console.log('[AdminOrders] Socket.io listeners registered for newOrder and orderUpdated');

      return () => {
        socket.off('newOrder', handleNewOrder);
        socket.off('orderUpdated', handleOrderUpdated);
        console.log('[AdminOrders] Socket.io listeners removed');
      };
    } catch (err) {
      console.error('[AdminOrders] Socket.io setup error:', err);
    }
  }, []);

  const fetchOrders = async () => {
    try {
      // only show loading spinner if we have no orders yet
      if (orders.length === 0) setLoading(true);
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
      
      // Optimistic update
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );
      
      await api.put(`/orders/${orderId}/status`, { status: newStatus });
      
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
      // Refetch on error to revert optimistic update
      await fetchOrders();
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
          // Optimistic update
          setOrders(prevOrders => 
            prevOrders.map(order => 
              order.id === orderId ? { ...order, driverId, driver } : order
            )
          );
          
          await api.put(`/orders/${orderId}/assign-driver`, { driverId });
          notifySuccess(`📦 ${driverName} assigned to order #${orderId}!`, 4000);
        } catch (err) {
          console.error('Error assigning driver:', err);
          notifyError(`Failed to assign driver: ${err.response?.data?.error || 'Unknown error'}`, 4000);
          // Refetch on error to revert optimistic update
          await fetchOrders();
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

  /**
   * Check if order is from today and unassigned (for highlighting)
   */
  const isUnassignedToday = (order) => {
    const orderDate = new Date(order.createdAt);
    const today = new Date();
    orderDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return orderDate.getTime() === today.getTime() && !order.driverId;
  };

  const matchesPriceFilter = (orderTotal) => {
    const total = Number(orderTotal || 0);

    if (priceFilter === 'under_10000') return total < 10000;
    if (priceFilter === '10000_50000') return total >= 10000 && total <= 50000;
    if (priceFilter === '50001_100000') return total >= 50001 && total <= 100000;
    if (priceFilter === 'over_100000') return total > 100000;
    return true;
  };

  const filteredOrders = orders.filter((order) => {
    const query = searchTerm.trim().toLowerCase();
    const orderIdText = String(order.id || '');
    const customerName = String(order.user?.name || '').toLowerCase();
    const customerEmail = String(order.user?.email || '').toLowerCase();
    const driverName = String(order.driver?.name || '').toLowerCase();
    const status = String(order.status || '').toLowerCase();

    const matchesSearch = !query
      || orderIdText.includes(query)
      || customerName.includes(query)
      || customerEmail.includes(query)
      || driverName.includes(query)
      || status.includes(query);

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    const matchesDriver = driverFilter === 'all'
      || (driverFilter === 'assigned' && !!order.driverId)
      || (driverFilter === 'unassigned' && !order.driverId)
      || String(order.driverId || '') === driverFilter;

    return matchesSearch && matchesStatus && matchesDriver && matchesPriceFilter(order.total);
  });

  const clearSearch = () => {
    setSearchTerm('');
  };

  const downloadOrdersPDF = async () => {
    if (filteredOrders.length === 0) {
      notifyError('No orders found for current filters', 3000);
      return;
    }

    try {
      const selectedDriverName = drivers.find((driver) => String(driver.id) === driverFilter)?.name || '';

      await generateAdminOrdersTablePDF(filteredOrders, {
        statusFilter,
        priceFilter,
        driverFilter,
        selectedDriverName,
      });
      notifySuccess(`Orders PDF downloaded with ${filteredOrders.length} order(s)`, 3000);
    } catch (err) {
      console.error('Error generating orders PDF:', err);
      notifyError('Failed to generate Orders PDF', 3000);
    }
  };

  useEffect(() => {
    const handleLeftCtrlClear = (event) => {
      if (event.repeat) return;

      const isLeftCtrl = event.code === 'ControlLeft' || (event.key === 'Control' && event.location === 1);
      if (!isLeftCtrl) return;
      if (!searchTerm) return;

      event.preventDefault();
      clearSearch();
    };

    window.addEventListener('keydown', handleLeftCtrlClear);

    return () => {
      window.removeEventListener('keydown', handleLeftCtrlClear);
    };
  }, [searchTerm]);

  useEffect(() => {
    let resizeObserver;

    const updateFilterBarLayout = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;

      const rect = contentArea.getBoundingClientRect();
      const mobileTopOffset = 56;

      setFilterBarLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? mobileTopOffset : 0,
      });

      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };

    updateFilterBarLayout();
    window.addEventListener('resize', updateFilterBarLayout);

    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFilterBarLayout);
      resizeObserver.observe(contentArea);
    }

    return () => {
      window.removeEventListener('resize', updateFilterBarLayout);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  // Separate orders into new (today) and old (previous days)
  const getGroupedOrders = (sourceOrders = orders) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newOrders = [];
    const oldOrders = [];

    sourceOrders.forEach((order) => {
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

  return (
    <div>
      {/* Loading Indicator */}
      {loading && orders.length === 0 && (
        <div style={{backgroundColor: '#e7f3ff', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <i className="fas fa-spinner fa-spin"></i>
          <span>Loading orders...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && orders.length === 0 && (
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '2rem',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#666',
        }}>
          No orders yet
        </div>
      )}

      {/* Orders Content */}
      {orders.length > 0 && (
        <>
          {/* Loading indicator while fetching more */}
          {loading && (
            <div style={{backgroundColor: '#e7f3ff', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <i className="fas fa-spinner fa-spin"></i>
              <span>Loading more orders...</span>
            </div>
          )}

          <div
            ref={filterBarRef}
            className={isMobileViewport ? 'admin-filter-bar-fixed' : ''}
            style={!isMobileViewport ? {
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            marginBottom: 0,
            flexWrap: 'wrap',
            position: 'fixed',
            top: `${filterBarLayout.top}px`,
            left: `${filterBarLayout.left}px`,
            width: `${filterBarLayout.width}px`,
            zIndex: 80,
            backgroundColor: '#fff',
            border: '1px solid #eee',
            borderRadius: '8px',
            padding: '0.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            boxSizing: 'border-box',
          } : {
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            zIndex: 80,
            backgroundColor: '#fff',
            border: '1px solid #eee',
            borderRadius: '8px',
            padding: '0.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            boxSizing: 'border-box',
          }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
              <input
                type="text"
                placeholder="Search by order #, customer, email, driver, status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="admin-filter-input"
                style={{
                  width: '100%',
                  padding: '0.55rem 2.25rem 0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  backgroundColor: '#fff',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={clearSearch}
                  title="Clear search (Left Ctrl)"
                  aria-label="Clear search"
                  style={{
                    position: 'absolute',
                    right: '0.45rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#e9ecef',
                    color: '#555',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    padding: 0,
                  }}
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="admin-filter-select"
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                minWidth: '160px',
                backgroundColor: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="REFUND_PENDING">REFUND_PENDING</option>
              <option value="REFUNDED">REFUNDED</option>
            </select>

            <select
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value)}
              className="admin-filter-select"
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                minWidth: '160px',
                backgroundColor: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Totals</option>
              <option value="under_10000">Under MWK 10,000</option>
              <option value="10000_50000">MWK 10,000 - 50,000</option>
              <option value="50001_100000">MWK 50,001 - 100,000</option>
              <option value="over_100000">Over MWK 100,000</option>
            </select>

            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="admin-filter-select"
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                minWidth: '160px',
                backgroundColor: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Driver States</option>
              <option value="assigned">Assigned Driver</option>
              <option value="unassigned">Unassigned</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={String(driver.id)}>
                  Driver: {driver.name}
                </option>
              ))}
            </select>

            {(searchTerm || statusFilter !== 'all' || priceFilter !== 'all' || driverFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setPriceFilter('all');
                  setDriverFilter('all');
                }}
                style={{
                  padding: '0.55rem 0.9rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#dc3545',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                }}
              >
                Clear Filters
              </button>
            )}

            {canManageOrders && (
              <button
                type="button"
                onClick={downloadOrdersPDF}
                style={{
                  padding: '0.55rem 0.9rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#5B4B8A',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  whiteSpace: 'nowrap',
                }}
                title="Download filtered orders as PDF"
              >
                <i className="fas fa-file-pdf"></i>
                Download PDF
              </button>
            )}

            <span style={{ color: '#666', fontSize: '0.9rem', marginLeft: 'auto' }}>
              {filteredOrders.length} / {orders.length} orders
            </span>
          </div>

          <div style={{ height: `${Math.max(filterBarHeight - 8, 0)}px` }}></div>

      {/* Get grouped orders */}
      {(() => {
        const { newOrders, oldOrders } = getGroupedOrders(filteredOrders);

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
                        <tr 
                          key={order.id} 
                          style={{ 
                            borderBottom: '1px solid #eee',
                            backgroundColor: isUnassignedToday(order) ? '#FFF8DC' : 'transparent',
                            borderLeft: isUnassignedToday(order) ? '4px solid #FF6B6B' : 'none',
                          }}
                        >
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
                            {canManageOrders ? (
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
                            ) : (
                              <span style={{ fontWeight: 600, color: '#4b5563' }}>{order.status}</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            {order.driverId ? (
                              <span style={{ color: '#4caf50', fontWeight: '600' }}>
                                {order.driver?.name}
                              </span>
                            ) : canManageOrders ? (
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
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Unassigned</span>
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
                        <tr 
                          key={order.id} 
                          style={{ 
                            borderBottom: '1px solid #eee',
                            backgroundColor: !order.driverId ? '#FFF8E1' : 'transparent',
                            borderLeft: !order.driverId ? '4px solid #FFA500' : 'none',
                          }}
                        >
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
                            {canManageOrders ? (
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
                            ) : (
                              <span style={{ fontWeight: 600, color: '#4b5563' }}>{order.status}</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            {order.driverId ? (
                              <span style={{ color: '#4caf50', fontWeight: '600' }}>
                                {order.driver?.name}
                              </span>
                            ) : canManageOrders ? (
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
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Unassigned</span>
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

          {!loading && filteredOrders.length === 0 && (
            <div style={{
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              padding: '1rem',
              textAlign: 'center',
              color: '#666',
            }}>
              No orders match your current search/filter.
            </div>
          )}
        </>
      )}

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
