import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { playNotificationSound } from '../../utils/notifications.js';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/**
 * 📬 ADMIN INBOX
 * 
 * Features:
 * - Displays system notifications and events
 * - Message types: New User Registration, Payment Confirmation, Order Updates, etc.
 * - Filter by message type and date range
 * - Mark messages as read/unread
 * - Real-time message updates
 * - Delete messages
 * - Notification sounds for critical alerts (refunds)
 */

const AdminInbox = () => {
  const INBOX_PERFORMANCE_WARNING_THRESHOLD = 500;
  const [messages, setMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const { modal, closeModal, showConfirm } = useModal();
  const notificationAudioRef = useRef(null);
  const soundedMessagesRef = useRef(new Set());

  // Message types
  const messageTypes = [
    { value: 'new_user', label: 'New User Registration', icon: 'fa-user-plus', color: '#4CAF50' },
    { value: 'payment_success', label: 'Payment Confirmation', icon: 'fa-check-circle', color: '#2196F3' },
    { value: 'order_placed', label: 'New Order', icon: 'fa-shopping-cart', color: '#FF9800' },
    { value: 'order_completed', label: 'Order Completed', icon: 'fa-check', color: '#8BC34A' },
    { value: 'payment_failed', label: 'Payment Failed', icon: 'fa-times-circle', color: '#F44336' },
    { value: 'driver_assigned', label: 'Driver Assigned', icon: 'fa-car', color: '#9C27B0' },
    { value: 'refund_required', label: 'Refund Required', icon: 'fa-exclamation-triangle', color: '#FF5722' },
    { value: 'system', label: 'System Alert', icon: 'fa-bell', color: '#607D8B' },
  ];

  // Fetch messages on mount
  useEffect(() => {
    fetchMessages();
    // Poll for new messages every 30 seconds
    const interval = setInterval(fetchMessages, 30000);
    return () => clearInterval(interval);
  }, []);



  // Set up Socket.io listener for real-time admin messages
  useEffect(() => {
    try {
      const socket = getSocket();
      if (!socket) {
        console.warn('[AdminInbox] Socket not initialized');
        return;
      }

      /**
       * Listen for new admin messages in real-time
       */
      const handleNewAdminMessage = (newMessage) => {
        console.log('[AdminInbox] New message received via Socket.io:', newMessage);
        
        // Check if message already exists (prevent duplicates)
        if (!messages.some(m => m.id === newMessage.id)) {
          // Add new message to the front of the list
          setMessages(prevMessages => [newMessage, ...prevMessages]);
          
          // Play sound ONLY ONCE per message
          if (!soundedMessagesRef.current.has(newMessage.id)) {
            soundedMessagesRef.current.add(newMessage.id);
            playNotificationSound();
          }
          
          // Get message type info for better display
          const messageType = messageTypes.find(t => t.value === newMessage.type);
          const icon = messageType?.icon || 'fa-bell';
          const color = messageType?.color || '#607D8B';
          
          // Show toast notification
          toast.success(
            <div>
              <strong>{newMessage.title}</strong><br/>
              <small>{newMessage.message.substring(0, 60)}...</small>
            </div>,
            {
              duration: 4000,
              icon: <i className={`fas ${icon}`} style={{ color }}></i>,
            }
          );
        }
      };

      const handleNewTicket = (ticketData) => {
        console.log('[AdminInbox] 🎫 New support ticket received:', ticketData.subject);
        playNotificationSound();
        
        // Create a message for the ticket
        const newMessage = {
          id: `ticket_${ticketData.id}_${Date.now()}`,
          type: 'support_ticket',
          title: `New Support Ticket: ${ticketData.subject}`,
          message: `From: ${ticketData.userName} (${ticketData.userEmail})\n${ticketData.message.substring(0, 100)}...`,
          timestamp: new Date(ticketData.createdAt),
          icon: 'fa-ticket-alt',
          color: '#FF9800',
          priority: ticketData.priority
        };
        
        setMessages(prev => [newMessage, ...prev]);
        
        // Show toast notification
        toast.success(
          <div>
            <strong>New Support Ticket</strong><br/>
            <small>{ticketData.subject}</small><br/>
            <small style={{ fontSize: '0.75rem' }}>From: {ticketData.userName}</small>
          </div>,
          {
            duration: 4000,
            icon: <i className="fas fa-ticket-alt" style={{ color: '#FF9800' }}></i>,
          }
        );
      };

      socket.on('newAdminMessage', handleNewAdminMessage);
      socket.on('newTicket', handleNewTicket);
      console.log('[AdminInbox] Socket.io listeners registered for newAdminMessage and newTicket');

      return () => {
        socket.off('newAdminMessage', handleNewAdminMessage);
        socket.off('newTicket', handleNewTicket);
        console.log('[AdminInbox] Socket.io listeners removed');
      };
    } catch (err) {
      console.error('[AdminInbox] Socket.io setup error:', err);
    }
  }, [messages, messageTypes]);

  // Apply filters whenever messages, filters change
  useEffect(() => {
    applyFilters();
  }, [messages, searchTerm, selectedType, dateFilter]);

  const clearSearch = () => {
    setSearchTerm('');
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

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/admin/messages');
      setMessages(response.data.messages || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(err.response?.data?.error || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const getMockMessages = () => {
    const now = new Date();
    return [
      {
        id: 1,
        type: 'new_user',
        title: 'New User Registration',
        message: 'User "John Doe" (john@example.com) has registered successfully.',
        createdAt: new Date(now.getTime() - 5 * 60000).toISOString(),
        read: false,
      },
      {
        id: 2,
        type: 'payment_success',
        title: 'Payment Confirmation',
        message: 'Payment of MWK 45,000 for Order #1234 confirmed via PayChangu. Transaction ID: TXN123456',
        createdAt: new Date(now.getTime() - 15 * 60000).toISOString(),
        read: false,
      },
      {
        id: 3,
        type: 'order_placed',
        title: 'New Order',
        message: 'Order #1234 placed by John Doe. Total: MWK 45,000. Items: 5',
        createdAt: new Date(now.getTime() - 20 * 60000).toISOString(),
        read: true,
      },
      {
        id: 4,
        type: 'driver_assigned',
        title: 'Driver Assigned',
        message: 'Driver "James Wilson" assigned to Order #1234. Expected delivery: 2 hours.',
        createdAt: new Date(now.getTime() - 45 * 60000).toISOString(),
        read: true,
      },
      {
        id: 5,
        type: 'payment_failed',
        title: 'Payment Failed',
        message: 'Payment attempt for Order #1233 failed. Error: Card declined. Contact customer.',
        createdAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
        read: false,
      },
      {
        id: 6,
        type: 'order_completed',
        title: 'Order Completed',
        message: 'Order #1232 delivered successfully. Customer confirmed receipt.',
        createdAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
        read: true,
      },
      {
        id: 7,
        type: 'system',
        title: 'System Alert',
        message: 'Product "Bananas" stock is running low (5 units remaining).',
        createdAt: new Date(now.getTime() - 6 * 3600000).toISOString(),
        read: true,
      },
    ];
  };

  const applyFilters = () => {
    let filtered = [...messages];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(msg =>
        msg.title.toLowerCase().includes(search) ||
        msg.message.toLowerCase().includes(search)
      );
    }

    // Type filter
    if (selectedType) {
      filtered = filtered.filter(msg => msg.type === selectedType);
    }

    // Date filter
    if (dateFilter) {
      const now = new Date();
      const filterDate = new Date(dateFilter);
      filtered = filtered.filter(msg => {
        const msgDate = new Date(msg.createdAt);
        return msgDate.toDateString() === filterDate.toDateString();
      });
    }

    // Sort by newest first
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setFilteredMessages(filtered);
  };

  const handleMarkAsRead = async (messageId) => {
    try {
      await api.patch(`/admin/messages/${messageId}/read`);
      setMessages(messages.map(msg =>
        msg.id === messageId ? { ...msg, read: true } : msg
      ));
    } catch (err) {
      console.error('Error marking message as read:', err);
    }
  };

  const handleMarkAsUnread = async (messageId) => {
    try {
      await api.patch(`/admin/messages/${messageId}/unread`);
      setMessages(messages.map(msg =>
        msg.id === messageId ? { ...msg, read: false } : msg
      ));
    } catch (err) {
      console.error('Error marking message as unread:', err);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    showConfirm(
      'Delete Message?',
      'Are you sure you want to delete this message?',
      async () => {
        try {
          await api.delete(`/admin/messages/${messageId}`);
          setMessages(messages.filter(msg => msg.id !== messageId));
        } catch (err) {
          console.error('Error deleting message:', err);
        }
      }
    );
  };

  const handleDeleteAll = async () => {
    showConfirm(
      'Delete All Messages?',
      'Are you sure you want to delete all messages? This action cannot be undone.',
      async () => {
        try {
          await api.delete('/admin/messages');
          setMessages([]);
        } catch (err) {
          console.error('Error deleting all messages:', err);
        }
      }
    );
  };

  const handleMarkAllAsRead = async () => {
    try {
      const response = await api.patch('/admin/messages/read/all');
      // Update all messages to read state
      setMessages(messages.map(msg => ({ ...msg, read: true })));
      toast.success(`Marked ${response.data.updated} message${response.data.updated !== 1 ? 's' : ''} as read`, {
        duration: 2000,
      });
    } catch (err) {
      console.error('Error marking all messages as read:', err);
      toast.error('Failed to mark messages as read', { duration: 2000 });
    }
  };

  const getMessageTypeInfo = (type) => {
    return messageTypes.find(t => t.value === type) || messageTypes[messageTypes.length - 1];
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const now = new Date();
    let msgTime;
    
    // Handle both string and Date object formats
    if (typeof timestamp === 'string') {
      msgTime = new Date(timestamp);
    } else if (timestamp instanceof Date) {
      msgTime = timestamp;
    } else {
      msgTime = new Date(timestamp);
    }
    
    // Check if date is valid
    if (isNaN(msgTime.getTime())) {
      return 'Invalid date';
    }
    
    const diffMs = now - msgTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return msgTime.toLocaleDateString();
  };

  const unreadCount = messages.filter(m => !m.read).length;
  const showPerformanceWarning = messages.length >= INBOX_PERFORMANCE_WARNING_THRESHOLD;

  return (
    <div style={{
      padding: '1rem 0',
      height: '100%',
      minHeight: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
    }}>
      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '2rem',
        }}>
          {error}
        </div>
      )}

      {/* Performance Hint */}
      {!loading && !error && showPerformanceWarning && (
        <div style={{
          backgroundColor: '#fff3cd',
          color: '#856404',
          padding: '0.75rem 1rem',
          borderRadius: '6px',
          marginBottom: '1rem',
          border: '1px solid #ffeeba',
          fontSize: '0.9rem',
          lineHeight: '1.4',
        }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.5rem' }}></i>
          Large inbox loaded ({messages.length} messages). For faster performance, use search and filters, or clear old items.
        </div>
      )}

      {/* Filters */}
      {messages.length > 0 && (
        <>
        <div
          style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          marginBottom: '2rem',
          position: 'relative',
          zIndex: 80,
          padding: '1rem',
          backgroundColor: '#fff',
          border: '1px solid #eee',
          borderRadius: '8px',
          flexWrap: 'wrap',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
          marginBottom: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <i className="fas fa-inbox" style={{ color: '#5B4B8A' }}></i>
                Inbox
              </h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                <span style={{
                  backgroundColor: unreadCount > 0 ? '#F44336' : '#6c757d',
                  color: '#fff',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '12px',
                  fontWeight: '600',
                  marginRight: '0.5rem',
                }}>
                  {unreadCount}
                </span>
                unread message{unreadCount !== 1 ? 's' : ''}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#4CAF50',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: '#fff',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = '#45a049';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = '#4CAF50';
                  }}
                  title={`Mark all ${unreadCount} unread message${unreadCount !== 1 ? 's' : ''} as read`}
                >
                  <i className="fas fa-check-double" style={{ marginRight: '0.5rem' }}></i>
                  Mark All Read
                </button>
              )}
              <button
                onClick={handleDeleteAll}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f8f9fa',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#666',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#eee';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#f8f9fa';
                }}
              >
                <i className="fas fa-trash" style={{ marginRight: '0.5rem' }}></i>
                Clear All
              </button>
            </div>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#eee' }}></div>

          {/* Search Input */}
          <div style={{
            position: 'relative',
            flex: 1,
            minWidth: '200px',
          }}>
            <input
              type="text"
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 2.25rem 0.75rem 0.75rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                backgroundColor: '#f5f5f5',
                transition: 'box-shadow 0.3s ease, background-color 0.3s ease'
              }}
              onFocus={(e) => {
                e.target.style.backgroundColor = '#fff';
                e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.backgroundColor = '#f5f5f5';
                e.target.style.boxShadow = 'none';
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

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: '0.75rem',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              minWidth: '180px',
              backgroundColor: '#f5f5f5',
              transition: 'box-shadow 0.3s ease, background-color 0.3s ease',
              cursor: 'pointer'
            }}
            onFocus={(e) => {
              e.target.style.backgroundColor = '#fff';
              e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.2)';
            }}
            onBlur={(e) => {
              e.target.style.backgroundColor = '#f5f5f5';
              e.target.style.boxShadow = 'none';
            }}
          >
            <option value="">All Types</option>
            {messageTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>

          {/* Date Filter */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              padding: '0.75rem',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              backgroundColor: '#f5f5f5',
              transition: 'box-shadow 0.3s ease, background-color 0.3s ease'
            }}
            onFocus={(e) => {
              e.target.style.backgroundColor = '#fff';
              e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.2)';
            }}
            onBlur={(e) => {
              e.target.style.backgroundColor = '#f5f5f5';
              e.target.style.boxShadow = 'none';
            }}
          />

          {/* Reset Filters */}
          {(searchTerm || selectedType || dateFilter) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedType('');
                setDateFilter('');
              }}
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#f44336',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: '0.5rem' }}></i>
              Reset
            </button>
          )}

          {/* Results Count */}
          <div style={{
            marginLeft: 'auto',
            fontSize: '0.9rem',
            color: '#666',
            minWidth: '100px',
            textAlign: 'right',
          }}>
            {filteredMessages.length} / {messages.length} messages
          </div>
        </div>
        </>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#666',
        }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.5rem' }}></i>
          Loading messages...
        </div>
      )}

      {/* Empty State */}
      {!loading && messages.length === 0 && (
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '3rem 2rem',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#999',
        }}>
          <i className="fas fa-inbox" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block' }}></i>
          <p style={{ fontSize: '1.1rem', margin: 0 }}>Your inbox is empty</p>
        </div>
      )}

      {/* No Filter Results */}
      {!loading && messages.length > 0 && filteredMessages.length === 0 && (
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '3rem 2rem',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#999',
        }}>
          <i className="fas fa-search" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block' }}></i>
          <p style={{ fontSize: '1rem', margin: 0 }}>No messages match your filters</p>
        </div>
      )}

      {/* Messages List */}
      {!loading && filteredMessages.length > 0 && (
        <div style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          overflowY: 'auto',
          paddingBottom: '0.5rem',
        }}>
          {filteredMessages.map((message) => {
            const typeInfo = getMessageTypeInfo(message.type);
            return (
              <div
                key={message.id}
                style={{
                  padding: '1.25rem',
                  border: `2px solid ${message.read ? '#eee' : '#e3f2fd'}`,
                  borderRadius: '8px',
                  backgroundColor: message.read ? '#fff' : '#f5f9ff',
                  boxShadow: message.read ? 'none' : '0 2px 8px rgba(33, 150, 243, 0.1)',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.boxShadow = message.read ? 'none' : '0 2px 8px rgba(33, 150, 243, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  {/* Icon */}
                  <div style={{
                    width: '3rem',
                    height: '3rem',
                    borderRadius: '50%',
                    backgroundColor: typeInfo.color + '20',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <i
                      className={`fas ${typeInfo.icon}`}
                      style={{
                        color: typeInfo.color,
                        fontSize: '1.25rem',
                      }}
                    ></i>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <h4 style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: message.read ? '500' : '600',
                        color: message.read ? '#333' : '#000',
                      }}>
                        {message.title}
                      </h4>
                      {!message.read && (
                        <span style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: '#2196F3',
                        }}></span>
                      )}
                    </div>
                    <p style={{
                      margin: '0 0 0.75rem 0',
                      color: '#666',
                      fontSize: '0.95rem',
                      lineHeight: '1.5',
                      wordBreak: 'break-word',
                    }}>
                      {message.message}
                    </p>
                    <p style={{
                      margin: 0,
                      fontSize: '0.85rem',
                      color: '#999',
                    }}>
                      {formatTime(message.createdAt)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexShrink: 0,
                    marginLeft: '1rem',
                  }}>
                    {!message.read ? (
                      <button
                        onClick={() => handleMarkAsRead(message.id)}
                        title="Mark as read"
                        style={{
                          width: '2.5rem',
                          height: '2.5rem',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          color: '#2196F3',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#e3f2fd';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#fff';
                        }}
                      >
                        <i className="fas fa-envelope-open"></i>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMarkAsUnread(message.id)}
                        title="Mark as unread"
                        style={{
                          width: '2.5rem',
                          height: '2.5rem',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          color: '#999',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#f5f5f5';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#fff';
                        }}
                      >
                        <i className="fas fa-envelope"></i>
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteMessage(message.id)}
                      title="Delete message"
                      style={{
                        width: '2.5rem',
                        height: '2.5rem',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        color: '#f44336',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffebee';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#fff';
                      }}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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

export default AdminInbox;
