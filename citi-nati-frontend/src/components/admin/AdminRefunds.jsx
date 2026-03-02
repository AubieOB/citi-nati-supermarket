import React, { useState, useEffect } from 'react';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/**
 * 💰 ADMIN REFUNDS MANAGEMENT
 * 
 * View and approve pending refunds
 * Track refund status and customer communications
 */

const AdminRefunds = () => {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [selectedRefundId, setSelectedRefundId] = useState(null);
  const { modal, closeModal, showConfirm } = useModal();

  useEffect(() => {
    fetchPendingRefunds();
  }, []);

  const fetchPendingRefunds = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/admin/refunds/pending');
      setRefunds(response.data.refunds || []);
    } catch (err) {
      console.error('Error fetching refunds:', err);
      setError(err.response?.data?.error || 'Failed to load refunds');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRefund = (refundId) => {
    setSelectedRefundId(refundId);
    setApprovalNote('');
    
    const refund = refunds.find(r => r.id === refundId);
    showConfirm(
      'Approve Refund?',
      `Confirm refund of ${refund.amount} MWK for ${refund.customerName} (Order #${refundId})`,
      async () => {
        try {
          await api.put(`/admin/refunds/${refundId}/approve`, {
            refundNote: approvalNote
          });
          
          // Remove from pending list
          setRefunds(refunds.filter(r => r.id !== refundId));
          setApprovalNote('');
          setSelectedRefundId(null);
          
        } catch (err) {
          console.error('Error approving refund:', err);
          alert(err.response?.data?.error || 'Failed to approve refund');
        }
      }
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Loading refunds...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#5B4B8A', marginBottom: '0.5rem' }}>
          <i className="fas fa-undo" style={{ marginRight: '0.5rem' }}></i>
          Pending Refunds
        </h2>
        <p style={{ color: '#666', marginBottom: '1rem' }}>
          Manage customer refunds that require manual processing
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '1rem',
          alignItems: 'start'
        }}>
          <div style={{
            backgroundColor: '#e8f4f8',
            padding: '1rem',
            borderRadius: '8px',
            borderLeft: '4px solid #17a2b8'
          }}>
            <i className="fas fa-info-circle" style={{ marginRight: '0.5rem' }}></i>
            <strong>Total Pending:</strong> {refunds.length} refund{refunds.length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={() => window.open('https://dashboard.paychangu.com', '_blank')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#5B4B8A',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#4a3a6e';
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#5B4B8A';
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            <i className="fas fa-external-link-alt"></i>
            Open PayChangu Dashboard
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '2rem'
        }}>
          {error}
        </div>
      )}

      {/* Refunds List */}
      {refunds.length === 0 ? (
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '2rem',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#666'
        }}>
          <i className="fas fa-check-circle" style={{ marginRight: '0.5rem', color: '#28a745' }}></i>
          No pending refunds. All refunds have been processed!
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {refunds.map((refund) => (
            <div
              key={refund.id}
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
              }}
            >
              {/* Order Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid #eee'
              }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: '#333' }}>
                    Order #{refund.id}
                  </h3>
                  <p style={{ margin: '0.25rem 0', color: '#666' }}>
                    <strong>Customer:</strong> {refund.customerName}
                  </p>
                  <p style={{ margin: '0.25rem 0', color: '#666' }}>
                    <strong>Email:</strong> {refund.customerEmail}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    backgroundColor: '#fff3cd',
                    color: '#856404',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    fontWeight: '600'
                  }}>
                    {refund.amount} MWK
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#999', margin: '0.5rem 0 0 0' }}>
                    {new Date(refund.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Order Items */}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#5B4B8A' }}>
                  <i className="fas fa-box" style={{ marginRight: '0.5rem' }}></i>
                  Items:
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {refund.items.map((item) => (
                    <li key={item.id} style={{
                      padding: '0.5rem 0',
                      borderBottom: '1px solid #f0f0f0',
                      fontSize: '0.9rem'
                    }}>
                      <span>{item.product.name}</span>
                      <span style={{ float: 'right', color: '#999' }}>
                        x{item.quantity} @ {item.price} MWK
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Refund Reason */}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#5B4B8A' }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.5rem' }}></i>
                  Reason:
                </h4>
                <p style={{
                  margin: 0,
                  padding: '0.75rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  color: '#666',
                  fontSize: '0.9rem'
                }}>
                  {refund.notes}
                </p>
              </div>

              {/* Transaction Details */}
              <div style={{
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                fontSize: '0.85rem'
              }}>
                <p style={{ margin: '0.25rem 0', color: '#666' }}>
                  <i className="fas fa-credit-card" style={{ marginRight: '0.5rem', width: '16px' }}></i>
                  <strong>Payment Reference:</strong> <code>{refund.paymentReference}</code>
                </p>
                <p style={{ margin: '0.25rem 0', color: '#666' }}>
                  <i className="fas fa-tag" style={{ marginRight: '0.5rem', width: '16px' }}></i>
                  <strong>Status:</strong> {refund.status}
                </p>
              </div>

              {/* Approval Section */}
              <div style={{
                backgroundColor: '#f0f8ff',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1rem',
                border: '1px solid #b3d9ff'
              }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  <i className="fas fa-edit" style={{ marginRight: '0.5rem' }}></i>
                  Optional Note (visible in system)
                </label>
                <textarea
                  value={selectedRefundId === refund.id ? approvalNote : ''}
                  onChange={(e) => {
                    setSelectedRefundId(refund.id);
                    setApprovalNote(e.target.value);
                  }}
                  placeholder="e.g., 'Refund processed via Paychangu dashboard on [date]'"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                    minHeight: '60px',
                    marginBottom: '1rem'
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  variant="primary"
                  onClick={() => handleApproveRefund(refund.id)}
                  style={{ flex: 1 }}
                >
                  <i className="fas fa-check-circle" style={{ marginRight: '0.5rem' }}></i>
                  Mark as Refunded
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText || 'Approve'}
        cancelText={modal.cancelText || 'Cancel'}
        showCancelButton={modal.showCancelButton !== false}
      />
    </div>
  );
};

export default AdminRefunds;
