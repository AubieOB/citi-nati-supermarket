import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { notifyInfo, notifyError, notifySuccess } from '../../utils/notifications.js';
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
          console.log('[HelpCenter] ✅ Notification sound played');
        })
        .catch(() => {
          // Fallback to Web Audio API beep
          console.log('[HelpCenter] ⚠️ File audio blocked, using beep fallback');
          playWebAudioBeep();
        });
    }
  } catch (err) {
    console.warn('[HelpCenter] Audio initialization failed:', err.message);
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
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.1);
    console.log('[HelpCenter] ✅ Beep played using Web Audio API');
  } catch (e) {
    console.warn('[HelpCenter] Sound notification disabled:', e.message);
  }
};

/**
 * 💬 HELP CENTER PAGE (Phase 2: Real-Time)
 * 
 * Customer support ticket system with real-time chat
 * 1. Create new support tickets
 * 2. View ticket history with live replies
 * 3. Real-time messaging with typing indicators
 * 4. Unread message counters
 */

const HelpCenter = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const socket = useRef(getSocket());

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    priority: 'MEDIUM'
  });

  // Tickets state
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Real-time state
  const [replyMessage, setReplyMessage] = useState('');
  const [typingUser, setTypingUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const { modal, closeModal, showConfirm } = useModal();

  // Fetch tickets on component mount
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login');
      return;
    }

    fetchTickets();
  }, [authLoading, user, navigate]);

  // Socket listeners
  useEffect(() => {
    if (!socket.current || !user) return;

    // Listen for new messages
    const handleTicketMessage = (reply) => {
      setSelectedTicket(prev => {
        if (!prev || prev.id !== reply.ticketId) return prev;
        const updatedTicket = {
          ...prev,
          replies: [...prev.replies, reply]
        };
        // Play sound for new message
        if (reply.senderId !== user.id) {
          playNotificationBeep();
          notifyInfo('Admin replied to your ticket!');
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

    // Listen for typing indicators
    const handleTyping = ({ userId }) => {
      if (userId !== user.id) {
        setTypingUser(userId);
        setTimeout(() => setTypingUser(null), 2000);
      }
    };

    // Listen for user joined
    const handleUserJoined = ({ userId, role }) => {
      console.log(`[Chat] ${role} user ${userId} joined the ticket room`);
    };

    // Listen for ticket status changes
    const handleTicketStatusChanged = (data) => {
      if (data.userId === user.id) {
        console.log(`[HelpCenter] Ticket ${data.ticketId} status changed to ${data.status}`);
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
        playNotificationBeep();
        notifyInfo(`Ticket status updated to ${data.status}`);
      }
    };

    // Listen for ticket deletion
    const handleTicketDeleted = (data) => {
      if (data.userId === user.id) {
        console.log(`[HelpCenter] Ticket ${data.ticketId} was deleted`);
        setTickets(prev => prev.filter(t => t.id !== data.ticketId));
        if (selectedTicket?.id === data.ticketId) {
          setSelectedTicket(null);
        }
        playNotificationBeep();
        notifyInfo('Your ticket was deleted');
      }
    };

    socket.current.on('ticketMessage', handleTicketMessage);
    socket.current.on('ticketTyping', handleTyping);
    socket.current.on('userJoined', handleUserJoined);
    socket.current.on('ticketStatusChanged', handleTicketStatusChanged);
    socket.current.on('ticketDeleted', handleTicketDeleted);

    return () => {
      socket.current?.off('ticketMessage', handleTicketMessage);
      socket.current?.off('ticketTyping', handleTyping);
      socket.current?.off('userJoined', handleUserJoined);
      socket.current?.off('ticketStatusChanged', handleTicketStatusChanged);
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
      const response = await api.get('/support/my-tickets');
      setTickets(response.data.tickets || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    
    if (!formData.subject.trim() || !formData.message.trim()) {
      setError('Subject and message are required');
      return;
    }

    try {
      setError(null);
      const response = await api.post('/support/tickets', formData);
      
      const newTicket = response.data.ticket;
      setTickets(prev => [newTicket, ...prev]);
      setFormData({ subject: '', message: '', priority: 'MEDIUM' });
      setShowForm(false);
      setSuccessMessage('Ticket created successfully! We will review it shortly.');
      
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error creating ticket:', err);
      setError(err.response?.data?.error || 'Failed to create ticket');
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();

    if (!replyMessage.trim() && attachedFiles.length === 0) {
      setError('Message or attachment is required');
      return;
    }

    if (!selectedTicket) {
      return;
    }

    try {
      setError(null);

      // Upload files first and get attachment data
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

      // Create the reply via API (not Socket.io) so it's properly saved to database with attachments
      const replyResponse = await api.post(`/support/tickets/${selectedTicket.id}/reply`, {
        message: replyMessage,
        attachments: uploadedAttachments
      });

      const newReply = replyResponse.data.reply;
      
      // Manually add attachments to the reply object
      if (uploadedAttachments.length > 0) {
        newReply.attachments = uploadedAttachments;
      }

      // Update the selected ticket with new reply
      setSelectedTicket(prev => ({
        ...prev,
        replies: [...(prev.replies || []), newReply]
      }));

      // Also update the ticket in the list
      setTickets(prev =>
        prev.map(t =>
          t.id === selectedTicket.id
            ? { ...t, replies: [...(t.replies || []), newReply] }
            : t
        )
      );

      // Emit Socket.io event for real-time notification to admin
      if (socket.current) {
        socket.current.emit('ticketMessage', {
          ticketId: selectedTicket.id,
          message: replyMessage,
          senderId: user.id,
          attachments: uploadedAttachments
        });
      }

      setReplyMessage('');
      setAttachedFiles([]);
    } catch (err) {
      console.error('Error sending reply:', err);
      setError(err.response?.data?.error || 'Failed to send reply');
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
          
          setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
          console.error('Error deleting ticket:', err);
          setError(err.response?.data?.error || 'Failed to delete ticket');
        }
      }
    );
  };

  const handleTyping = (e) => {
    setReplyMessage(e.target.value);

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
  };

  const statusColor = (status) => {
    switch (status) {
      case 'OPEN': return '#ff6b6b';
      case 'IN_PROGRESS': return '#ffd93d';
      case 'CLOSED': return '#51cf66';
      default: return '#999';
    }
  };

  const priorityBadge = (priority) => {
    const colors = {
      LOW: '#4ecdc4',
      MEDIUM: '#ffd93d',
      HIGH: '#ff6b6b',
      URGENT: '#ae1000'
    };
    return colors[priority] || '#999';
  };

  if (authLoading || loading) {
    return (
      <div className="page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '3rem', color: '#2D8659' }}></i>
          <p style={{ marginTop: '1rem' }}>Loading help center...</p>
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
              <i className="fas fa-headset"></i>
              Help Center
            </h1>
            <p style={{ margin: '0', color: '#666' }}>
              Get support and track your support tickets
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

          {/* Create Ticket Button */}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2D8659',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                marginBottom: '2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <i className="fas fa-plus"></i>
              Create New Ticket
            </button>
          )}

          {/* Create Ticket Form */}
          {showForm && (
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '1.5rem',
              borderRadius: '8px',
              marginBottom: '2rem',
              border: '1px solid #e0e0e0'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#333' }}>
                Create a New Support Ticket
              </h3>
              <form onSubmit={handleCreateTicket}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: '#333'
                  }}>
                    Subject <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleFormChange}
                    placeholder="Brief description of your issue"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: '#333'
                  }}>
                    Message <span style={{ color: 'red' }}>*</span>
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleFormChange}
                    placeholder="Describe your issue in detail..."
                    rows={5}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: '#333'
                  }}>
                    Priority
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleFormChange}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="LOW">Low - General inquiry</option>
                    <option value="MEDIUM">Medium - Standard issue</option>
                    <option value="HIGH">High - Urgent issue</option>
                    <option value="URGENT">Urgent - Critical problem</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="submit"
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#2D8659',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '1rem'
                    }}
                  >
                    Submit Ticket
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ subject: '', message: '', priority: 'MEDIUM' });
                    }}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#e0e0e0',
                      color: '#333',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '1rem'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Two-Column Layout: Tickets List + Chat (Responsive) */}
          {tickets.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px'
            }}>
              <i className="fas fa-inbox" style={{ fontSize: '3rem', color: '#ccc', marginBottom: '1rem' }}></i>
              <p style={{ color: '#666', fontSize: '1.1rem' }}>
                No support tickets yet. Create one to get started!
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              {/* Left: Tickets List */}
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#333' }}>
                  Tickets ({tickets.length})
                </h3>
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
                        transition: 'all 0.2s',
                        borderLeft: `4px solid ${statusColor(ticket.status)}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <h4 style={{ margin: 0, color: '#333', fontSize: '1rem' }}>
                          #{ticket.id}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.75rem',
                            backgroundColor: statusColor(ticket.status),
                            color: 'white',
                            borderRadius: '12px'
                          }}>
                            {ticket.status}
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
                              fontSize: '1rem',
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

                      <p style={{ margin: '0.25rem 0', color: '#333', fontWeight: '500', fontSize: '0.9rem' }}>
                        {ticket.subject.substring(0, 30)}...
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#999' }}>
                        <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                        <span><i className="fas fa-comments"></i> {ticket.replies.length}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Chat View */}
              {selectedTicket ? (
                <div style={{
                  padding: '1.5rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '600px',
                  maxHeight: '600px'
                }}>
                  {/* Ticket Header */}
                  <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e0e0e0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, color: '#333' }}>
                        {selectedTicket.subject}
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleDeleteTicket(selectedTicket.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ff6b6b',
                          cursor: 'pointer',
                          fontSize: '1.2rem',
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
                    <p style={{ margin: '0', color: '#666', fontSize: '0.9rem' }}>
                      Ticket #{selectedTicket.id} • {selectedTicket.status}
                    </p>
                  </div>

                  {/* Messages Area */}
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    marginBottom: '1rem',
                    padding: '1rem',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0'
                  }}>
                    {/* Initial Message */}
                    <div style={{
                      marginBottom: '1rem',
                      padding: '1rem',
                      backgroundColor: '#f0f8ff',
                      borderRadius: '4px',
                      borderLeft: '3px solid #2D8659'
                    }}>
                      <div style={{ fontSize: '0.85rem', color: '#999', marginBottom: '0.5rem' }}>
                        You • {new Date(selectedTicket.createdAt).toLocaleString()}
                      </div>
                      <p style={{ margin: 0, color: '#333', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                        {selectedTicket.message}
                      </p>
                    </div>

                    {/* Replies */}
                    {selectedTicket.replies.map(reply => {
                      const isUserMessage = reply.senderId === user.id;
                      return (
                      <div
                        key={reply.id}
                        style={{
                          marginBottom: '1rem',
                          padding: '0.75rem',
                          backgroundColor: isUserMessage ? '#f0f8ff' : '#fff',
                          borderRadius: '4px',
                          border: '1px solid #e0e0e0',
                          borderLeft: `3px solid ${isUserMessage ? '#2D8659' : '#ff6b6b'}`
                        }}
                      >
                        <div style={{ fontSize: '0.85rem', color: '#999', marginBottom: '0.5rem' }}>
                          {isUserMessage ? 'You' : 'Admin'} • {new Date(reply.createdAt).toLocaleString()}
                        </div>
                        <p style={{ margin: '0.25rem 0', color: '#333', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                          {reply.message}
                        </p>
                        {/* Display Attachments */}
                        {reply.attachments && reply.attachments.length > 0 && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                              <i className="fas fa-paperclip"></i> Attachments:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {reply.attachments.map((attachment, idx) => {
                                // Construct full attachment URL using backend base URL
                                const backendBaseUrl = api.defaults.baseURL?.replace('/api', '') || 'http://localhost:5000';
                                const fullAttachmentUrl = `${backendBaseUrl}${attachment.fileUrl}`;
                                return (
                                <a
                                  key={idx}
                                  href={fullAttachmentUrl}
                                  download={attachment.fileName}
                                  style={{
                                    padding: '0.5rem 0.75rem',
                                    backgroundColor: '#f0f8ff',
                                    color: '#2D8659',
                                    textDecoration: 'none',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    border: '1px solid #2D8659',
                                    cursor: 'pointer'
                                  }}
                                  title={`${attachment.fileName} (${(attachment.fileSize / 1024).toFixed(2)} KB)`}
                                >
                                  <i className="fas fa-download"></i> {attachment.fileName}
                                </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                    })}

                    {/* Typing Indicator */}
                    {typingUser && (
                      <div style={{
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        fontStyle: 'italic',
                        color: '#999',
                        fontSize: '0.9rem'
                      }}>
                        <i className="fas fa-ellipsis-h"></i> Admin is typing...
                      </div>
                    )}
                  </div>

                  {/* Reply Input with File Attachment */}
                  {selectedTicket.status !== 'CLOSED' ? (
                    <form onSubmit={handleSendReply}>
                      {/* Attached Files Preview */}
                      {attachedFiles.length > 0 && (
                        <div style={{
                          marginBottom: '0.75rem',
                          padding: '0.75rem',
                          backgroundColor: '#f0f8ff',
                          borderRadius: '4px',
                          border: '1px solid #2D8659'
                        }}>
                          <h5 style={{ margin: '0 0 0.5rem 0', color: '#333', fontSize: '0.9rem' }}>
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
                                  padding: '0.5rem 0.75rem',
                                  backgroundColor: 'white',
                                  borderRadius: '4px',
                                  fontSize: '0.85rem',
                                  color: '#333'
                                }}
                              >
                                <i className="fas fa-file"></i>
                                <span>{file.name.substring(0, 20)}...</span>
                                <button
                                  type="button"
                                  onClick={() => removeAttachedFile(idx)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ff6b6b',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={replyMessage}
                          onChange={handleTyping}
                          placeholder="Type your message..."
                          style={{
                            flex: 1,
                            minWidth: '150px',
                            padding: '0.75rem',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '0.9rem',
                            fontFamily: 'inherit'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          title="Attach file"
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#4ecdc4',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '1rem'
                          }}
                        >
                          <i className="fas fa-paperclip"></i>
                        </button>
                        <button
                          type="submit"
                          style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: '#2D8659',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Send
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
                  ) : (
                    <div style={{
                      padding: '0.75rem',
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
                    <p style={{ margin: 0 }}>Select a ticket from the list</p>
                  </div>
                </div>
              )}
            </div>
          )}
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

export default HelpCenter;
