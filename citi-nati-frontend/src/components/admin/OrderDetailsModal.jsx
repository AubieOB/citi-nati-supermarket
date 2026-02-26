import React, { useState } from 'react';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/**
 * 📋 ORDER DETAILS MODAL
 * 
 * Full order details with:
 * - Basic order info
 * - Customer details
 * - Delivery location (Google Maps)
 * - Order items
 * - Driver info
 * - Status & Payment controls
 */

const OrderDetailsModal = ({ order, isOpen, onClose, drivers, onStatusUpdate, onDriverAssign }) => {
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingDriver, setUpdatingDriver] = useState(false);
  const { modal, closeModal, showError, showConfirm, showSuccess } = useModal();

  if (!isOpen || !order) {
    return null;
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdatingStatus(true);
      await api.put(`/orders/${order.id}/status`, { status: newStatus });
      onStatusUpdate(newStatus);
    } catch (err) {
      console.error('Error updating status:', err);
      showError('Error', err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDriverAssign = async (driverId) => {
    if (!driverId) return;
    
    const selectedDriver = drivers.find(d => d.id === driverId);
    const driverName = selectedDriver ? selectedDriver.name : `Driver #${driverId}`;
    
    showConfirm(
      'Assign Driver?',
      `Are you sure you want to assign ${driverName} to this order?`,
      async () => {
        try {
          setUpdatingDriver(true);
          await api.put(`/orders/${order.id}/assign-driver`, { driverId });
          onDriverAssign(driverId);
          showSuccess('Success', `Driver ${driverName} assigned successfully`);
        } catch (err) {
          console.error('Error assigning driver:', err);
          showError('Error', err.response?.data?.error || 'Failed to assign driver');
        } finally {
          setUpdatingDriver(false);
        }
      }
    );
  };

  const hasCoordinates = order.latitude && order.longitude;

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          maxWidth: '800px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Order #{order.id}</h2>
            <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9 }}>
              Created: {formatDate(order.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '2rem' }}>
          {/* Basic Info Section */}
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
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: '#333' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      backgroundColor: order.status === 'PENDING' ? '#ffc107' : 
                                       order.status === 'CONFIRMED' ? '#28a745' :
                                       order.status === 'DELIVERED' ? '#007bff' : '#dc3545',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  >
                    {order.status}
                  </span>
                </p>
              </div>

              <div>
                <label style={{ fontWeight: '600', color: '#666' }}>Payment Status</label>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: '#333' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      backgroundColor: order.paymentStatus === 'PAID' ? '#28a745' : 
                                       order.paymentStatus === 'PENDING' ? '#ffc107' : '#dc3545',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  >
                    {order.paymentStatus}
                  </span>
                </p>
              </div>

              <div>
                <label style={{ fontWeight: '600', color: '#666' }}>Total</label>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.2rem', color: '#5B4B8A', fontWeight: 'bold' }}>
                  {formatMWK(order.total)}
                </p>
              </div>

              <div>
                <label style={{ fontWeight: '600', color: '#666' }}>Order ID</label>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', color: '#333' }}>#{order.id}</p>
              </div>
            </div>
          </section>

          {/* Customer Section */}
          {order.user && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Customer Information</h3>
              <div
                style={{
                  backgroundColor: '#f8f9fa',
                  padding: '1rem',
                  borderRadius: '4px',
                }}
              >
                <p style={{ margin: '0.5rem 0' }}>
                  <strong>Name:</strong> {order.user.name}
                </p>
                <p style={{ margin: '0.5rem 0' }}>
                  <strong>Email:</strong> {order.user.email}
                </p>
                <p style={{ margin: '0.5rem 0' }}>
                  <strong>User ID:</strong> {order.user.id}
                </p>
              </div>
            </section>
          )}

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
                <strong>Address:</strong> {order.deliveryAddress}
              </p>
              <p style={{ margin: '0.5rem 0' }}>
                <strong>House Number:</strong> {order.houseNumber}
              </p>
              {order.phone && (
                <p style={{ margin: '0.5rem 0' }}>
                  <strong><i className="fas fa-phone" style={{ marginRight: '0.3rem' }}></i>Phone:</strong> <a href={`tel:${order.phone}`} style={{ color: '#2D8659', textDecoration: 'none', cursor: 'pointer' }}>{order.phone}</a>
                </p>
              )}
              {hasCoordinates && (
                <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#666' }}>
                  <strong><i className="fas fa-map-marker-alt" style={{ marginRight: '0.3rem' }}></i>Coordinates:</strong> <a href={`https://www.google.com/maps?q=${order.latitude},${order.longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2D8659', textDecoration: 'none', cursor: 'pointer' }}>{order.latitude.toFixed(4)}, {order.longitude.toFixed(4)}</a>
                </p>
              )}
            </div>
          </section>

          {/* Google Map */}
          {hasCoordinates && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Location Map</h3>
              <iframe
                width="100%"
                height="300"
                loading="lazy"
                src={`https://www.google.com/maps?q=${order.latitude},${order.longitude}&z=15&output=embed`}
                style={{
                  border: 'none',
                  borderRadius: '4px',
                }}
              />
            </section>
          )}

          {/* Order Items */}
          {order.items && order.items.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Order Items</h3>
              <div
                style={{
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead
                    style={{
                      backgroundColor: '#e0e0e0',
                      borderBottom: '2px solid #ddd',
                    }}
                  >
                    <tr>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>
                        Product
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>
                        Quantity
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                        Price
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, index) => (
                      <tr
                        key={index}
                        style={{
                          borderBottom: index < order.items.length - 1 ? '1px solid #ddd' : 'none',
                        }}
                      >
                        <td style={{ padding: '0.75rem' }}>
                          {item.product?.name || 'Product'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {formatMWK(item.price)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                          {formatMWK(item.quantity * item.price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Driver Info */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Driver Assignment</h3>
            {order.driver ? (
              <div
                style={{
                  backgroundColor: '#f8f9fa',
                  padding: '1rem',
                  borderRadius: '4px',
                }}
              >
                <p style={{ margin: '0.5rem 0' }}>
                  <strong>Driver:</strong> {order.driver.name}
                </p>
                <p style={{ margin: '0.5rem 0' }}>
                  <strong>Phone:</strong> {order.driver.phone}
                </p>
                <p style={{ margin: '0.5rem 0' }}>
                  <strong>Email:</strong> {order.driver.email || 'N/A'}
                </p>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: '#fff3cd',
                  padding: '1rem',
                  borderRadius: '4px',
                  marginBottom: '1rem',
                }}
              >
                <p style={{ margin: 0, color: '#856404' }}>No driver assigned yet</p>
              </div>
            )}
            {!order.driver && drivers.length > 0 && (
              <select
                onChange={(e) => handleDriverAssign(e.target.value)}
                disabled={updatingDriver}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: '4px',
                  marginTop: '1rem',
                }}
              >
                <option value="">Select driver...</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} - {driver.phone}
                  </option>
                ))}
              </select>
            )}
          </section>

          {/* Status Update */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Update Status</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.5rem',
              }}
            >
              {['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'].map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  disabled={updatingStatus || order.status === status}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: order.status === status ? '#5B4B8A' : '#f0f0f0',
                    color: order.status === status ? '#fff' : '#333',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: updatingStatus || order.status === status ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    opacity: updatingStatus ? 0.6 : 1,
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#f8f9fa',
            borderTop: '1px solid #ddd',
            borderRadius: '0 0 8px 8px',
            textAlign: 'right',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
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
        </div>
      </div>
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

export default OrderDetailsModal;
