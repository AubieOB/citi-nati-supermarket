import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import api from '../../utils/api.js';
import { getSocket, identifySocket } from '../../utils/socket.js';
import { notifyInfo, notifyError, notifySuccess, playNotificationSound } from '../../utils/notifications.js';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  appendValidatedSupportFiles,
  buildSupportAttachmentDownloadUrl,
  dedupeTicketsById,
  formatSupportTime,
  getSupportAttachmentIcon,
  mergeReplyIntoReplyList,
  mergeReplyIntoTicketList,
  upsertTicketById,
} from '../../utils/supportChat.js';
import '../../styles/global.css';
import '../../styles/support-messenger.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

/**
 *  HELP CENTER PAGE (Phase 2: Real-Time)
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
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');

  // Real-time state
  const [replyMessage, setReplyMessage] = useState('');
  const [typingUser, setTypingUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const { modal, closeModal, showConfirm } = useModal();
  const messagesEndRef = useRef(null);

  // Fetch tickets on component mount
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login');
      return;
    }

    fetchTickets();
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user?.id) return;
    identifySocket(user.id, 'user', user.email || null);
  }, [user]);

  // Socket listeners
  useEffect(() => {
    if (!socket.current || !user) return;

    // Listen for new messages
    const handleTicketMessage = (reply) => {
      setSelectedTicket(prev => {
        if (!prev || prev.id !== reply.ticketId) return prev;
        const updatedTicket = {
          ...prev,
          updatedAt: reply.createdAt || new Date().toISOString(),
          replies: mergeReplyIntoReplyList(prev.replies || [], reply)
        };
        // Play sound for new message
        if (reply.senderId !== user.id) {
          playNotificationSound();
          notifyInfo('Admin replied to your ticket!');
        }
        return updatedTicket;
      });

      // Update tickets list
      setTickets(prev => mergeReplyIntoTicketList(prev, reply));
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
                ? { ...t, status: data.status, updatedAt: new Date().toISOString() }
              : t
          )
        );
        playNotificationSound();
        notifyInfo(`Ticket status updated to ${data.status}`);
      }
    };

    const handleTicketPriorityChanged = (data) => {
      if (data.userId !== user.id) return;

      setSelectedTicket(prev =>
        prev && String(prev.id) === String(data.ticketId)
          ? { ...prev, priority: data.priority }
          : prev
      );

      setTickets(prev =>
        prev.map(t =>
          String(t.id) === String(data.ticketId)
            ? { ...t, priority: data.priority, updatedAt: new Date().toISOString() }
            : t
        )
      );
    };

    const handleNewTicket = (ticketData) => {
      if (ticketData.userId !== user.id) return;

      const newTicket = {
        id: ticketData.id,
        subject: ticketData.subject,
        message: ticketData.message,
        priority: ticketData.priority,
        status: ticketData.status,
        createdAt: ticketData.createdAt,
        updatedAt: ticketData.createdAt,
        replies: [],
        userId: ticketData.userId,
        user: {
          id: ticketData.userId,
          name: ticketData.userName || user.name,
          email: ticketData.userEmail || user.email,
        },
      };

      setTickets(prev => {
        return upsertTicketById(prev, newTicket);
      });
    };

    // Listen for ticket deletion
    const handleTicketDeleted = (data) => {
      if (data.userId === user.id) {
        console.log(`[HelpCenter] Ticket ${data.ticketId} was deleted`);
        setTickets(prev => prev.filter(t => String(t.id) !== String(data.ticketId)));
        if (String(selectedTicket?.id) === String(data.ticketId)) {
          setSelectedTicket(null);
        }
        playNotificationSound();
        notifyInfo('Your ticket was deleted');
      }
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedTicket?.id, selectedTicket?.replies?.length]);

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
      const ticketList = response.data.tickets || [];
      setTickets(dedupeTicketsById(ticketList));
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
      setTickets(prev => upsertTicketById(prev, newTicket));
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

    if (!selectedTicket) {
      return;
    }
    if (!replyMessage.trim()) {
      setError('Type a message before sending your reply');
      return;
    }

    try {
      setIsSendingReply(true);
      setError(null);

      const formData = new FormData();
      formData.append('message', replyMessage.trim());
      attachedFiles.forEach((file) => {
        formData.append('attachments', file);
      });

      const replyResponse = await api.post(`/support/tickets/${selectedTicket.id}/reply`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const reply = replyResponse.data.reply;

      setSelectedTicket((prev) => {
        if (!prev || prev.id !== selectedTicket.id) return prev;
        return {
          ...prev,
          updatedAt: reply.createdAt || new Date().toISOString(),
          replies: mergeReplyIntoReplyList(prev.replies || [], reply),
        };
      });

      setTickets((prev) => mergeReplyIntoTicketList(prev, reply));

      setReplyMessage('');
      setAttachedFiles([]);
    } catch (err) {
      console.error('Error sending reply:', err);
      setError(err.response?.data?.error || 'Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => appendValidatedSupportFiles(prev, files, notifyError));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files || []);
    setAttachedFiles((prev) => appendValidatedSupportFiles(prev, files, notifyError));
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
          
          setTickets(prev => prev.filter(t => String(t.id) !== String(ticketId)));
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

  const filteredTickets = tickets
    .filter((ticket) => {
      const query = ticketSearch.trim().toLowerCase();
      if (!query) return true;

      return [ticket.subject, ticket.message, String(ticket.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime());

  const conversationMessages = selectedTicket
    ? [
        {
          id: `initial-${selectedTicket.id}`,
          senderId: user?.id,
          message: selectedTicket.message,
          createdAt: selectedTicket.createdAt,
          attachments: [],
          senderLabel: 'You',
        },
        ...(selectedTicket.replies || []).map((reply) => ({
          ...reply,
          senderLabel: reply.senderId === user?.id ? 'You' : 'Support Team',
        })),
      ]
    : [];

  const panelStyleVars = {
    '--support-panel': 'rgba(255, 255, 255, 0.92)',
    '--support-panel-strong': '#ffffff',
    '--support-panel-muted': '#eef4f7',
    '--support-border': 'rgba(148, 163, 184, 0.22)',
    '--support-text': '#102132',
    '--support-text-muted': '#627388',
    '--support-accent': '#2D8659',
    '--support-secondary': '#0f766e',
    '--support-bg': '#f6f9fb',
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
    <div className="page support-messenger-shell" style={{ minHeight: '100vh', paddingBottom: '3rem', ...panelStyleVars }}>
      <div className="support-help-fullwidth">
        <div style={{ paddingTop: '2rem' }}>
          <section className="support-hero">
            <div>
              <h1 className="support-hero-title">Help Center</h1>
              <p className="support-hero-subtitle">
                Talk to support in a real conversation layout, track every reply live, and send files through one faster message flow.
              </p>
            </div>
            <div className="support-hero-metrics">
              <div className="support-metric-chip">
                <span className="support-metric-label">Tickets</span>
                <span className="support-metric-value">{tickets.length}</span>
              </div>
              <div className="support-metric-chip">
                <span className="support-metric-label">Open</span>
                <span className="support-metric-value">{tickets.filter((ticket) => ticket.status === 'OPEN').length}</span>
              </div>
              <div className="support-metric-chip">
                <span className="support-metric-label">Live chat</span>
                <span className="support-metric-value">On</span>
              </div>
            </div>
          </section>

          {successMessage && (
            <div className="support-alert is-success">
              <i className="fas fa-circle-check"></i>
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div className="support-alert is-error">
              <i className="fas fa-circle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          {showForm ? (
            <section className="support-ticket-creator">
              <h2 className="support-section-title" style={{ marginTop: 0 }}>Start a new conversation</h2>
              <p className="support-empty-copy" style={{ marginTop: '0.35rem' }}>Give the team enough detail so they can help without extra back-and-forth.</p>
              <form onSubmit={handleCreateTicket} className="support-form-stack" style={{ marginTop: '1rem' }}>
                <div className="support-form-grid">
                  <div>
                    <label className="support-field-label">Subject</label>
                    <input className="support-input" type="text" name="subject" value={formData.subject} onChange={handleFormChange} placeholder="Short summary of the issue" />
                  </div>
                  <div>
                    <label className="support-field-label">Priority</label>
                    <select className="support-select" name="priority" value={formData.priority} onChange={handleFormChange}>
                      <option value="LOW">Low · General inquiry</option>
                      <option value="MEDIUM">Medium · Standard issue</option>
                      <option value="HIGH">High · Urgent issue</option>
                      <option value="URGENT">Urgent · Critical problem</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="support-field-label">Message</label>
                  <textarea className="support-textarea" name="message" value={formData.message} onChange={handleFormChange} rows={5} placeholder="Explain what happened, what you expected, and any order numbers or details that matter." />
                </div>
                <div className="support-form-actions">
                  <button type="submit" className="support-primary-button"><i className="fas fa-paper-plane"></i> Submit Ticket</button>
                  <button
                    type="button"
                    className="support-ghost-button"
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ subject: '', message: '', priority: 'MEDIUM' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <div style={{ marginTop: '1.1rem' }}>
              <button type="button" className="support-primary-button" onClick={() => setShowForm(true)}>
                <i className="fas fa-plus"></i> New Ticket
              </button>
            </div>
          )}

          <section className="support-messenger-layout">
            <aside className="support-sidebar">
              <div className="support-sidebar-header">
                <label className="support-field-label">Search your tickets</label>
                <input
                  className="support-search-input"
                  value={ticketSearch}
                  onChange={(event) => setTicketSearch(event.target.value)}
                  placeholder="Search by subject, message, or ticket #"
                />
              </div>
              <div className="support-ticket-list">
                {filteredTickets.length === 0 ? (
                  <div className="support-empty-card" style={{ margin: '0.75rem' }}>
                    <p className="support-empty-copy" style={{ margin: 0 }}>No tickets yet. Start one above and the conversation will appear here.</p>
                  </div>
                ) : (
                  filteredTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      className={`support-ticket-card${selectedTicket?.id === ticket.id ? ' is-active' : ''}`}
                      style={{ '--ticket-accent': statusColor(ticket.status) }}
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setReplyMessage('');
                        setAttachedFiles([]);
                      }}
                    >
                      <div className="support-ticket-card-content">
                        <div className="support-ticket-top">
                          <div>
                            <p className="support-ticket-title">#{ticket.id} · {ticket.subject}</p>
                            <div className="support-badge-row" style={{ marginTop: '0.45rem' }}>
                              <span className="support-badge" style={{ backgroundColor: statusColor(ticket.status), color: '#fff' }}>{ticket.status.replace('_', ' ')}</span>
                              <span className="support-badge" style={{ backgroundColor: priorityBadge(ticket.priority), color: '#fff' }}>{ticket.priority}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="support-icon-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteTicket(ticket.id);
                            }}
                            title="Delete ticket"
                          >
                            <i className="fas fa-trash" style={{ color: '#dc4c64' }}></i>
                          </button>
                        </div>
                        <p className="support-ticket-preview" style={{ margin: '0.7rem 0 0.8rem' }}>
                          {(ticket.message || '').slice(0, 90)}{ticket.message?.length > 90 ? '…' : ''}
                        </p>
                        <div className="support-ticket-bottom">
                          <span className="support-inline-copy"><i className="fas fa-comments"></i> {(ticket.replies || []).length} replies</span>
                          <span className="support-inline-copy">{formatSupportTime(ticket.updatedAt || ticket.createdAt)}</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>

            {selectedTicket ? (
              <section className="support-conversation-panel">
                <div className="support-conversation-header">
                  <div>
                    <h2 className="support-conversation-title">{selectedTicket.subject}</h2>
                    <div className="support-conversation-meta">
                      <span className="support-chip"><i className="fas fa-hashtag"></i> {selectedTicket.id}</span>
                      <span className="support-chip"><i className="fas fa-signal"></i> {selectedTicket.status.replace('_', ' ')}</span>
                      <span className="support-chip"><i className="fas fa-bolt"></i> {selectedTicket.priority}</span>
                    </div>
                  </div>
                  <button type="button" className="support-danger-button" onClick={() => handleDeleteTicket(selectedTicket.id)}>
                    <i className="fas fa-trash"></i> Delete
                  </button>
                </div>

                <div className="support-conversation-body">
                  <div className="support-message-stack">
                    {conversationMessages.map((message) => {
                      const isSelf = message.senderId === user?.id;
                      return (
                        <div key={message.id} className={`support-message-row ${isSelf ? 'is-self' : 'is-other'}`}>
                          <div className="support-message-bubble">
                            <div className="support-badge-row" style={{ justifyContent: 'space-between' }}>
                              <span className="support-message-author">{isSelf ? 'You' : (message.senderLabel || 'Support Team')}</span>
                              <span className="support-message-time">{formatSupportTime(message.createdAt)}</span>
                            </div>
                            <p className="support-message-text">{message.message}</p>
                            {message.attachments?.length > 0 && (
                              <div className="support-attachments">
                                {message.attachments.map((attachment, index) => (
                                  <a
                                    key={`${message.id}-attachment-${index}`}
                                    className="support-attachment-link"
                                    href={buildSupportAttachmentDownloadUrl(api, attachment)}
                                    download={attachment.fileName}
                                    title={`${attachment.fileName} (${(attachment.fileSize / 1024).toFixed(1)} KB)`}
                                  >
                                    <i className={`fas ${getSupportAttachmentIcon(attachment.fileName, attachment.mimeType)}`}></i>
                                    <span className="support-attachment-name">
                                      <strong>{attachment.fileName}</strong>
                                      <span>{(attachment.fileSize / 1024).toFixed(1)} KB</span>
                                    </span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {typingUser && <div className="support-typing"><i className="fas fa-ellipsis"></i> Support is typing…</div>}
                    <div ref={messagesEndRef}></div>
                  </div>
                </div>

                <div className="support-composer">
                  {selectedTicket.status === 'CLOSED' ? (
                    <div className="support-alert is-success" style={{ marginTop: 0 }}>
                      <i className="fas fa-lock"></i>
                      <span>This ticket is closed. Create a new ticket if you need more help.</span>
                    </div>
                  ) : (
                    <form onSubmit={handleSendReply} className="support-compose-surface" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                      {attachedFiles.length > 0 && (
                        <div className="support-attachments" style={{ marginBottom: '0.8rem' }}>
                          {attachedFiles.map((file, index) => (
                            <div key={`${file.name}-${file.size}-${index}`} className="support-attachment-chip">
                              <i className={`fas ${getSupportAttachmentIcon(file.name, file.type)}`}></i>
                              <span className="support-attachment-name">
                                <strong>{file.name}</strong>
                                <span>{(file.size / 1024).toFixed(1)} KB</span>
                              </span>
                              <button type="button" className="support-icon-button" onClick={() => removeAttachedFile(index)}>
                                <i className="fas fa-xmark"></i>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <textarea
                        className="support-textarea"
                        value={replyMessage}
                        onChange={handleTyping}
                        placeholder={dragOver ? 'Drop files here, then finish your message…' : 'Type your message…'}
                        rows={3}
                        disabled={isSendingReply}
                      />
                      <div className="support-composer-toolbar" style={{ justifyContent: 'space-between', marginTop: '0.75rem' }}>
                        <div className="support-chip-row">
                          <button type="button" className="support-secondary-button" onClick={() => fileInputRef.current?.click()} disabled={isSendingReply}>
                            <i className="fas fa-paperclip"></i> Add Files
                          </button>
                          <span className="support-inline-copy">Drag files into the composer or browse. Max 5MB each.</span>
                        </div>
                        <button type="submit" className="support-primary-button" disabled={isSendingReply}>
                          <i className={`fas ${isSendingReply ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i> {isSendingReply ? 'Sending…' : 'Send'}
                        </button>
                      </div>
                      <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} accept={SUPPORT_ATTACHMENT_ACCEPT} />
                    </form>
                  )}
                </div>
              </section>
            ) : (
              <section className="support-empty-state">
                <div className="support-empty-card">
                  <i className="fas fa-headset" style={{ fontSize: '2rem', color: '#2D8659' }}></i>
                  <h3 className="support-section-title" style={{ marginTop: '1rem' }}>Choose a conversation</h3>
                  <p className="support-empty-copy">Select a ticket to see the full message thread in the new chat view.</p>
                </div>
              </section>
            )}
          </section>
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

export default HelpCenter;
