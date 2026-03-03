import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { notifyInfo, notifyError } from '../../utils/notifications.js';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 * 🔔 PLAY NOTIFICATION SOUND (with file + Web Audio fallback)
 */
const playNotificationBeep = async () => {
  try {
    // Try file-based audio first
    const audio = new Audio('/classic-door-bell.wav');
    audio.volume = 0.8;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[SupportDashboard] ✅ Notification sound played');
        })
        .catch(() => {
          // Fallback to Web Audio API beep
          console.log('[SupportDashboard] ⚠️ File audio blocked, using beep fallback');
          playWebAudioBeep();
        });
    }
  } catch (err) {
    console.warn('[SupportDashboard] Audio initialization failed:', err.message);
    playWebAudioBeep();
  }
};

/**
 * Web Audio API fallback beep
 */
const playWebAudioBeep = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.value = 1000;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.1);
    console.log('[SupportDashboard] ✅ Beep played using Web Audio API');
  } catch (e) {
    console.warn('[SupportDashboard] Sound notification disabled:', e.message);
  }
};

/**
 * 🎯 ADMIN SUPPORT DASHBOARD (Phase 2: Real-Time)
 * 
 * Manage all support tickets with real-time chat
 * 1. View all customer tickets
 * 2. Filter by status and priority
 * 3. Reply to tickets (real-time)
 * 4. Change ticket status
 * 5. Live typing indicators for customer messages
 */

const SupportDashboard = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const socket = useRef(getSocket());

  // Filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // Tickets state
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Real-time state
  const [typingUser, setTypingUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [unattendedCount, setUnattendedCount] = useState(0);
  const { modal, closeModal, showConfirm } = useModal();

  // Fetch tickets on component mount or filter change
  useEffect(() => {
    if (authLoading) return;

    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }

    fetchTickets();
  }, [authLoading, user, navigate, filterStatus, filterPriority]);

  // Socket listeners for real-time messages
  useEffect(() => {
    if (!socket.current || !user) return;

    // Listen for new customer messages (live replies)
    const handleTicketMessage = (reply) => {
      setSelectedTicket(prev => {
        if (!prev || prev.id !== reply.ticketId) return prev;
        const updatedTicket = {
          ...prev,
          replies: [...prev.replies, reply]
        };
        // Play sound for new message from customer
        if (reply.senderId !== user.id) {
          playNotificationBeep();
          notifyInfo('New message from customer!');
        }
        return updatedTicket;
      });

      // Update tickets list
      setTickets(prev =>
        prev.map(t =>
          t.id === reply.ticketId
            ? { ...t, replies: [...t.replies, reply] }
            : t
        )
      );
    };

    // Listen for customer typing indicators
    const handleTyping = ({ userId }) => {
      if (userId !== user.id) {
        setTypingUser(userId);
        setTimeout(() => setTypingUser(null), 2000);
      }
    };

    // Listen for user joined room
    const handleUserJoined = ({ userId, role }) => {
      console.log(`[Chat] ${role} user ${userId} joined the ticket room`);
    };

    // Listen for new tickets from customers
    const handleNewTicket = (ticketData) => {
      console.log('[SupportDashboard] 🎫 New support ticket:', ticketData.subject);
      const newTicket = {
        id: ticketData.id,
        subject: ticketData.subject,
        message: ticketData.message,
        priority: ticketData.priority,
        status: ticketData.status,
        createdAt: ticketData.createdAt,
        updatedAt: ticketData.createdAt,
        user: {
          id: ticketData.userId,
          name: ticketData.userName,
          email: ticketData.userEmail
        },
        replies: [],
        userId: ticketData.userId
      };
      
      setTickets(prev => [newTicket, ...prev]);
      setUnattendedCount(prev => prev + 1);
      playNotificationBeep();
      notifyInfo(`New Support Ticket from ${ticketData.userName}`);
    };

    // Listen for ticket status changes from other admins
    const handleTicketStatusChanged = (data) => {
      setSelectedTicket(prev =>
        prev && prev.id === data.ticketId
          ? { ...prev, status: data.status }
          : prev
      );
      setTickets(prev =>
        prev.map(t =>
          t.id === data.ticketId
            ? { ...t, status: data.status }
            : t
        )
      );
    };

    // Listen for ticket priority changes from other admins
    const handleTicketPriorityChanged = (data) => {
      setSelectedTicket(prev =>
        prev && prev.id === data.ticketId
          ? { ...prev, priority: data.priority }
          : prev
      );
      setTickets(prev =>
        prev.map(t =>
          t.id === data.ticketId
            ? { ...t, priority: data.priority }
            : t
        )
      );
    };

    // Listen for ticket deletions from other admins
    const handleTicketDeleted = (data) => {
      setTickets(prev => prev.filter(t => t.id !== data.ticketId));
      if (selectedTicket?.id === data.ticketId) {
        setSelectedTicket(null);
      }
      setUnattendedCount(prev => Math.max(0, prev - 1));
    };

    socket.current.on('ticketMessage', handleTicketMessage);
    socket.current.on('ticketTyping', handleTyping);
    socket.current.on('userJoined', handleUserJoined);
    socket.current.on('newTicket', handleNewTicket);
    socket.current.on('ticketStatusChanged', handleTicketStatusChanged);
    socket.current.on('ticketPriorityChanged', handleTicketPriorityChanged);
    socket.current.on('ticketDeleted', handleTicketDeleted);

    return () => {
      socket.current?.off('ticketMessage', handleTicketMessage);
      socket.current?.off('ticketTyping', handleTyping);
      socket.current?.off('userJoined', handleUserJoined);
      socket.current?.off('newTicket', handleNewTicket);
      socket.current?.off('ticketStatusChanged', handleTicketStatusChanged);
      socket.current?.off('ticketPriorityChanged', handleTicketPriorityChanged);
      socket.current?.off('ticketDeleted', handleTicketDeleted);
    };
  }, [user]);

  // Handle ticket selection - join room
  useEffect(() => {
    if (selectedTicket && socket.current) {
      socket.current.emit('joinTicketRoom', selectedTicket.id);
      console.log(`[Chat] Joined ticket ${selectedTicket.id} room`);

      return () => {
        socket.current?.emit('leaveTicketRoom', selectedTicket.id);
      };
    }
  }, [selectedTicket]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);

      let url = '/support/admin/tickets';
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterPriority) params.append('priority', filterPriority);
      if (params.toString()) {
        url += '?' + params.toString();
      }

      const response = await api.get(url);
      const ticketList = response.data.tickets || [];
      setTickets(ticketList);

      // Count unattended tickets (OPEN status)
      const unattended = ticketList.filter(t => t.status === 'OPEN').length;
      setUnattendedCount(unattended);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();

    if (!replyText.trim() && attachedFiles.length === 0) {
      setError('Reply message or attachment is required');
      return;
    }

    if (!selectedTicket) return;

    try {
      setError(null);

      // Upload files first
      let uploadedAttachments = [];
      for (const file of attachedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('ticketId', selectedTicket.id);

        try {
          const response = await api.post('/support/upload-attachment', formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });
          uploadedAttachments.push(response.data.attachment);
        } catch (uploadErr) {
          console.error('File upload failed:', uploadErr);
          notifyError(`Failed to upload ${file.name}`);
        }
      }

      // Use socket for real-time
      if (socket.current) {
        socket.current.emit('ticketMessage', {
          ticketId: selectedTicket.id,
          message: replyText,
          senderId: user.id,
          attachments: uploadedAttachments
        });
      }

      setReplyText('');
      setAttachedFiles([]);
      setSuccessMessage('Reply sent successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error sending reply:', err);
      setError('Failed to send reply');
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const maxSize = 5 * 1024 * 1024; // 5MB

    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        notifyError(`File ${file.name} is larger than 5MB`);
        return false;
      }
      return true;
    });

    setAttachedFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeleteTicket = async (ticketId) => {
    showConfirm(
      'Delete Ticket?',
      'Are you sure you want to delete this ticket? This action cannot be undone.',
      async () => {
        try {
          setError(null);
          await api.delete(`/support/tickets/${ticketId}`);
          
          setTickets(prev => prev.filter(t => t.id !== ticketId));
          setSelectedTicket(null);
          setSuccessMessage('Ticket deleted successfully');
      
          // Recount unattended tickets
          fetchTickets();
          
          setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
          console.error('Error deleting ticket:', err);
          setError(err.response?.data?.error || 'Failed to delete ticket');
        }
      }
    );
  };

  const handleStatusChange = async (ticketId, newStatus) => {
    try {
      setError(null);
      const response = await api.patch(`/support/admin/tickets/${ticketId}/status`, {
        status: newStatus
      });

      const updatedTicket = response.data.ticket;

      // Update selected ticket if it's the current one
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(updatedTicket);
      }

      // Update tickets list
      setTickets(prev =>
        prev.map(t => t.id === ticketId ? updatedTicket : t)
      );

      setSuccessMessage('Ticket status updated!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update ticket status');
    }
  };

  const handlePriorityChange = async (ticketId, newPriority) => {
    try {
      setError(null);
      const response = await api.patch(`/support/admin/tickets/${ticketId}/priority`, {
        priority: newPriority
      });

      const updatedTicket = response.data.ticket;

      // Update selected ticket if it's the current one
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(updatedTicket);
      }

      // Update tickets list
      setTickets(prev =>
        prev.map(t => t.id === ticketId ? updatedTicket : t)
      );

      setSuccessMessage('Ticket priority updated!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error updating priority:', err);
      setError('Failed to update ticket priority');
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'OPEN': return '#ff6b6b';
      case 'IN_PROGRESS': return '#ffd93d';
      case 'CLOSED': return '#51cf66';
      default: return '#999';
    }
  };

  const priorityColor = (priority) => {
    switch (priority) {
      case 'LOW': return '#4ecdc4';
      case 'MEDIUM': return '#ffd93d';
      case 'HIGH': return '#ff6b6b';
      case 'URGENT': return '#ae1000';
      default: return '#999';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '3rem', color: '#2D8659' }}></i>
          <p style={{ marginTop: '1rem' }}>Loading support dashboard...</p>
        </Container>
      </div>
    );
  }

  return (
    <div className="page" style={{ minHeight: '100vh', paddingBottom: '3rem' }}>
      <Container>
        <div style={{ paddingTop: '2rem' }}>
          {/* Header */}
          <div style={{
            marginBottom: '2rem',
            paddingBottom: '1.5rem',
            borderBottom: '1px solid #e0e0e0'
          }}>
            <h1 style={{
              margin: '0 0 0.5rem 0',
              fontSize: '2rem',
              color: '#333',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <i className="fas fa-life-ring"></i>
              Support Tickets
              {unattendedCount > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#ff6b6b',
                  color: 'white',
                  borderRadius: '20px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <i className="fas fa-exclamation-circle"></i>
                  {unattendedCount} Unattended
                </span>
              )}
            </h1>
            <p style={{ margin: '0', color: '#666' }}>
              Total Tickets: {tickets.length} | Open: {tickets.filter(t => t.status === 'OPEN').length} | In Progress: {tickets.filter(t => t.status === 'IN_PROGRESS').length} | Closed: {tickets.filter(t => t.status === 'CLOSED').length}
            </p>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div style={{
              padding: '1rem',
              backgroundColor: '#d4edda',
              color: '#155724',
              borderRadius: '4px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <i className="fas fa-check-circle"></i>
              {successMessage}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div style={{
              padding: '1rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <i className="fas fa-exclamation-circle"></i>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {/* Left: Ticket List */}
            <div>
              {/* Filters */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px'
              }}>
                <h4 style={{ margin: '0 0 1rem 0', color: '#333' }}>Filters</h4>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontSize: '0.9rem',
                    color: '#666',
                    fontWeight: '500'
                  }}>
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="">All Status</option>
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontSize: '0.9rem',
                    color: '#666',
                    fontWeight: '500'
                  }}>
                    Priority
                  </label>
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="">All Priority</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Tickets List */}
              {tickets.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px'
                }}>
                  <i className="fas fa-inbox" style={{ fontSize: '2rem', color: '#ccc', marginBottom: '0.5rem' }}></i>
                  <p style={{ color: '#666', margin: 0 }}>No tickets matching filters</p>
                </div>
              ) : (
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  {tickets.map(ticket => (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      style={{
                        padding: '1rem',
                        marginBottom: '0.75rem',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: selectedTicket?.id === ticket.id ? '#f0f8ff' : 'white',
                        borderLeft: `4px solid ${statusColor(ticket.status)}`,
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: '500', color: '#333' }}>#{ticket.id}</span>
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: statusColor(ticket.status),
                            color: 'white',
                            borderRadius: '10px'
                          }}>
                            {ticket.status}
                          </span>
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: priorityColor(ticket.priority),
                            color: 'white',
                            borderRadius: '10px'
                          }}>
                            {ticket.priority}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTicket(ticket.id);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ff6b6b',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              padding: '0.25rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Delete ticket"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                      <p style={{ margin: '0.25rem 0', color: '#333', fontSize: '0.9rem', fontWeight: '500' }}>
                        {ticket.subject.substring(0, 30)}...
                      </p>
                      <div style={{ fontSize: '0.8rem', color: '#999' }}>
                        {ticket.user?.name} • {new Date(ticket.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Ticket Details */}
            {selectedTicket ? (
              <div style={{
                padding: '1.5rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e0e0e0'
              }}>
                <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e0e0e0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: '#333' }}>
                        Ticket #{selectedTicket.id}
                      </h3>
                      <p style={{ margin: '0', color: '#666' }}>
                        {selectedTicket.subject}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteTicket(selectedTicket.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ff6b6b',
                          cursor: 'pointer',
                          fontSize: '1.2rem',
                          padding: '0.25rem'
                        }}
                        title="Delete ticket"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                      <button
                        onClick={() => setSelectedTicket(null)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '1.5rem',
                          cursor: 'pointer',
                          color: '#999'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: '#666', fontWeight: '500' }}>Status</label>
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => handleStatusChange(selectedTicket.id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '0.9rem',
                          marginTop: '0.25rem'
                        }}
                      >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.85rem', color: '#666', fontWeight: '500' }}>Priority</label>
                      <select
                        value={selectedTicket.priority}
                        onChange={(e) => handlePriorityChange(selectedTicket.id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '0.9rem',
                          marginTop: '0.25rem'
                        }}
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', color: '#666' }}>
                    <div>
                      <strong>Customer:</strong> {selectedTicket.user?.name}
                      <br />
                      <strong>Email:</strong> {selectedTicket.user?.email}
                    </div>
                    <div>
                      <strong>Created:</strong> {new Date(selectedTicket.createdAt).toLocaleString()}
                      <br />
                      <strong>Updated:</strong> {new Date(selectedTicket.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Message */}
                <div style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  border: '1px solid #e0e0e0'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#333' }}>Original Message</h4>
                  <p style={{ margin: 0, color: '#666', lineHeight: '1.6' }}>
                    {selectedTicket.message}
                  </p>
                </div>

                {/* Replies */}
                <div style={{
                  marginBottom: '1.5rem',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#333' }}>
                    Replies ({selectedTicket.replies.length})
                  </h4>
                  {selectedTicket.replies.length === 0 ? (
                    <p style={{ color: '#999', fontStyle: 'italic' }}>No replies yet</p>
                  ) : (
                    selectedTicket.replies.map(reply => (
                      <div
                        key={reply.id}
                        style={{
                          marginBottom: '1rem',
                          padding: '0.75rem',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                          border: '1px solid #e0e0e0'
                        }}
                      >
                        <div style={{ fontSize: '0.8rem', color: '#999', marginBottom: '0.25rem' }}>
                          {new Date(reply.createdAt).toLocaleString()}
                        </div>
                        <p style={{ margin: '0.25rem 0', color: '#333', fontSize: '0.9rem' }}>
                          {reply.message}
                        </p>
                        {/* Display Attachments */}
                        {reply.attachments && reply.attachments.length > 0 && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>
                              <i className="fas fa-paperclip"></i> Attachments:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {reply.attachments.map((attachment, idx) => (
                                <a
                                  key={idx}
                                  href={attachment.fileUrl}
                                  download={attachment.fileName}
                                  style={{
                                    padding: '0.35rem 0.5rem',
                                    backgroundColor: '#f0f8ff',
                                    color: '#2D8659',
                                    textDecoration: 'none',
                                    borderRadius: '3px',
                                    fontSize: '0.75rem',
                                    border: '1px solid #2D8659',
                                    cursor: 'pointer'
                                  }}
                                  title={`${attachment.fileName} (${(attachment.fileSize / 1024).toFixed(2)} KB)`}
                                >
                                  <i className="fas fa-download"></i> {attachment.fileName}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Customer Typing Indicator */}
                {typingUser && (
                  <div style={{
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    backgroundColor: '#f0f8ff',
                    borderRadius: '4px',
                    fontStyle: 'italic',
                    color: '#2D8659',
                    fontSize: '0.9rem'
                  }}>
                    <i className="fas fa-ellipsis-h"></i> Customer is typing...
                  </div>
                )}

{/* Reply Form with File Attachment */}
                {selectedTicket.status !== 'CLOSED' && (
                  <form onSubmit={handleReply}>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontWeight: '500',
                      color: '#333',
                      fontSize: '0.9rem'
                    }}>
                      Send Reply
                    </label>

                    {/* Attached Files Preview */}
                    {attachedFiles.length > 0 && (
                      <div style={{
                        marginBottom: '0.75rem',
                        padding: '0.75rem',
                        backgroundColor: '#f0f8ff',
                        borderRadius: '4px',
                        border: '1px solid #2D8659'
                      }}>
                        <h5 style={{ margin: '0 0 0.5rem 0', color: '#333', fontSize: '0.85rem' }}>
                          <i className="fas fa-paperclip"></i> Attachments ({attachedFiles.length})
                        </h5>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {attachedFiles.map((file, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.35rem 0.5rem',
                                backgroundColor: 'white',
                                borderRadius: '3px',
                                fontSize: '0.8rem',
                                color: '#333'
                              }}
                            >
                              <i className="fas fa-file"></i>
                              <span>{file.name.substring(0, 15)}...</span>
                              <button
                                type="button"
                                onClick={() => removeAttachedFile(idx)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ff6b6b',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <textarea
                      value={replyText}
                      onChange={(e) => {
                        setReplyText(e.target.value);

                        // Emit typing indicator
                        if (socket.current && selectedTicket && !isTyping) {
                          setIsTyping(true);
                          socket.current.emit('ticketTyping', {
                            ticketId: selectedTicket.id,
                            userId: user.id
                          });
                        }

                        // Reset typing after 2 seconds of inactivity
                        clearTimeout(typingTimeoutRef.current);
                        typingTimeoutRef.current = setTimeout(() => {
                          setIsTyping(false);
                        }, 2000);
                      }}
                      placeholder="Type your response..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        fontFamily: 'inherit',
                        marginBottom: '0.75rem',
                        resize: 'vertical'
                      }}
                    />

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach file"
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#4ecdc4',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        <i className="fas fa-paperclip"></i> Attach
                      </button>
                      <button
                        type="submit"
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#2D8659',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        Send Reply
                      </button>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      accept="*/*"
                    />
                  </form>
                )}

                {selectedTicket.status === 'CLOSED' && (
                  <div style={{
                    padding: '1rem',
                    backgroundColor: '#d4edda',
                    borderRadius: '4px',
                    color: '#155724',
                    textAlign: 'center',
                    fontSize: '0.9rem'
                  }}>
                    This ticket is closed. You cannot add replies.
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                color: '#999',
                textAlign: 'center'
              }}>
                <div>
                  <i className="fas fa-arrow-left" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}></i>
                  <p style={{ margin: 0 }}>Select a ticket to view details</p>
                </div>
              </div>
            )}
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

export default SupportDashboard;
