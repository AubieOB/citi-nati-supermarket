import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { notifyInfo, notifyError, playNotificationSound } from '../../utils/notifications.js';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  appendValidatedSupportFiles,
  buildSupportAttachmentDownloadUrl,
  formatSupportTime,
  getSupportAttachmentIcon,
  mergeReplyIntoReplyList,
  mergeReplyIntoTicketList,
  parseMessageLinks,
} from '../../utils/supportChat.js';
import '../../styles/global.css';
import '../../styles/support-messenger.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

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

const SupportDashboard = ({ openTicketRequest }) => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const socket = useRef(getSocket());
  
  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(
    typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark')
  );

  // Watch for dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const darkMode = document.body.classList.contains('admin-theme-dark');
      setIsDarkMode(darkMode);
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const isAdminDarkTheme = isDarkMode;

  const panelBg = isAdminDarkTheme ? '#1e1e1e' : '#fff';
  const panelSoft = isAdminDarkTheme ? '#181818' : '#f8f9fa';
  const panelAlt = isAdminDarkTheme ? '#202020' : '#f0f8ff';
  const borderColor = isAdminDarkTheme ? '#333333' : '#e0e0e0';
  const textPrimary = isAdminDarkTheme ? '#f1f5f9' : '#333';
  const textSecondary = isAdminDarkTheme ? '#c4c4c4' : '#666';
  const textMuted = isAdminDarkTheme ? '#9a9a9a' : '#999';
  const inputBg = isAdminDarkTheme ? '#161616' : '#fff';

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
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');

  // Real-time state
  const [typingUser, setTypingUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [unattendedCount, setUnattendedCount] = useState(0);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const { modal, closeModal, showConfirm } = useModal();
  const filterBarRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [isMaximized, setIsMaximized] = useState(false);

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
          updatedAt: reply.createdAt || new Date().toISOString(),
          replies: mergeReplyIntoReplyList(prev.replies || [], reply)
        };
        // Play sound for new message from customer
        if (reply.senderId !== user.id) {
          playNotificationSound();
          notifyInfo('New message from customer!');
        }
        return updatedTicket;
      });

      // Update tickets list
      setTickets(prev => mergeReplyIntoTicketList(prev, reply));
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
      
      setTickets(prev => [newTicket, ...prev].sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime()));
      setUnattendedCount(prev => prev + 1);
      playNotificationSound();
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
            ? { ...t, status: data.status, updatedAt: new Date().toISOString() }
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
            ? { ...t, priority: data.priority, updatedAt: new Date().toISOString() }
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedTicket?.id, selectedTicket?.replies?.length]);

  useEffect(() => {
    const ticketId = String(openTicketRequest?.ticketId || '');
    if (!ticketId || tickets.length === 0) return;

    const matchingTicket = tickets.find((ticket) => String(ticket.id) === ticketId);
    if (!matchingTicket) return;

    setSelectedTicket((prev) => {
      if (String(prev?.id || '') === ticketId) {
        return prev;
      }

      return matchingTicket;
    });
  }, [openTicketRequest, tickets]);

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
        top: window.innerWidth <= 768 ? mobileTopOffset : rect.top,
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

  // Re-measure bar height after each render to account for content wrapping
  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  const supportFilterSpacerHeight = filterBarHeight > 0 ? filterBarHeight + 8 : 0;

  const handleReply = async (e) => {
    e.preventDefault();

    if (!selectedTicket) return;
    if (!replyText.trim()) {
      setError('Type a message before sending your reply');
      return;
    }

    try {
      setIsSendingReply(true);
      setError(null);

      const formData = new FormData();
      formData.append('message', replyText.trim());
      attachedFiles.forEach((file) => {
        formData.append('attachments', file);
      });

      const response = await api.post(`/support/tickets/${selectedTicket.id}/reply`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const reply = response.data.reply;

      setSelectedTicket((prev) => {
        if (!prev || prev.id !== selectedTicket.id) return prev;
        return {
          ...prev,
          updatedAt: reply.createdAt || new Date().toISOString(),
          replies: mergeReplyIntoReplyList(prev.replies || [], reply),
        };
      });

      setTickets((prev) => mergeReplyIntoTicketList(prev, reply));

      setReplyText('');
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

  const removeAttachedFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleReplyInputChange = (event) => {
    setReplyText(event.target.value);

    if (socket.current && selectedTicket && !isTyping) {
      setIsTyping(true);
      socket.current.emit('ticketTyping', {
        ticketId: selectedTicket.id,
        userId: user.id
      });
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 2000);
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

  const filteredTickets = tickets
    .filter((ticket) => {
      const query = ticketSearch.trim().toLowerCase();
      if (!query) return true;

      return [ticket.subject, ticket.message, ticket.user?.name, ticket.user?.email, String(ticket.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime());

  const conversationMessages = selectedTicket
    ? [
        {
          id: `initial-${selectedTicket.id}`,
          senderId: selectedTicket.userId,
          message: selectedTicket.message,
          createdAt: selectedTicket.createdAt,
          attachments: [],
          senderLabel: selectedTicket.user?.name || 'Customer',
        },
        ...(selectedTicket.replies || []).map((reply) => ({
          ...reply,
          senderLabel: reply.senderId === user?.id ? 'You' : (selectedTicket.user?.name || 'Customer'),
        })),
      ]
    : [];

  const panelStyleVars = {
    '--support-panel': panelBg,
    '--support-panel-strong': panelBg,
    '--support-panel-muted': panelSoft,
    '--support-border': borderColor,
    '--support-text': textPrimary,
    '--support-text-muted': textSecondary,
    '--support-accent': '#2D8659',
    '--support-secondary': '#0f766e',
    '--support-bg': panelSoft,
  };

  if (authLoading || loading) {
    return (
      <div className="page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '3rem', color: '#2D8659' }}></i>
          <p style={{ marginTop: '1rem' }}>Loading support dashboard...</p>
        </div>
      </div>
    );
  }

  return (
      <div className="page support-messenger-shell support-admin-sealed" style={{ minHeight: '100vh', paddingBottom: '1rem', ...panelStyleVars }}>
          <div
            className="support-admin-sealed-inner"
            style={{
              paddingTop: '0.25rem',
              '--support-fixed-header-offset': `${supportFilterSpacerHeight + 14}px`,
            }}
          >
            <section
              ref={filterBarRef}
              className="support-hero support-fixed-header"
              style={{
                position: 'fixed',
                top: `${filterBarLayout.top}px`,
                left: `${filterBarLayout.left}px`,
                width: `${filterBarLayout.width}px`,
                zIndex: 82,
              }}
            >
              <div>
                <h1 className="support-hero-title">Online Support</h1>
                <p className="support-hero-subtitle">Live tickets workspace</p>
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
                  <span className="support-metric-label">Awaiting Admin</span>
                  <span className="support-metric-value">{unattendedCount}</span>
                </div>
              </div>
            </section>

            <div style={{ height: `${supportFilterSpacerHeight}px` }}></div>

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

            <section className="support-messenger-layout">
              <aside className="support-sidebar">
                <div className="support-sidebar-header">
                  <div className="support-form-stack">
                    <div>
                      <label className="support-field-label">Search tickets</label>
                      <input
                        className="support-search-input"
                        value={ticketSearch}
                        onChange={(event) => setTicketSearch(event.target.value)}
                        placeholder="Search subject, customer, email, or ticket #"
                      />
                    </div>
                    <div className="support-form-grid">
                      <div>
                        <label className="support-field-label">Status</label>
                        <select className="support-select" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
                          <option value="">All statuses</option>
                          <option value="OPEN">Open</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                      </div>
                      <div>
                        <label className="support-field-label">Priority</label>
                        <select className="support-select" value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)}>
                          <option value="">All priorities</option>
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="URGENT">Urgent</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="support-ticket-list">
                  {filteredTickets.length === 0 ? (
                    <div className="support-empty-card" style={{ margin: '0.75rem' }}>
                      <p className="support-empty-copy" style={{ margin: 0 }}>No tickets match the current filters.</p>
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
                          setReplyText('');
                          setAttachedFiles([]);
                        }}
                      >
                        <div className="support-ticket-card-content">
                          <div className="support-ticket-top">
                            <div>
                              <p className="support-ticket-title">#{ticket.id} · {ticket.subject}</p>
                              <p className="support-ticket-preview" style={{ margin: '0.35rem 0 0' }}>
                                {ticket.user?.name || 'Customer'}
                              </p>
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
                          <p className="support-ticket-preview" style={{ margin: '0.65rem 0 0.8rem' }}>
                            {(ticket.message || '').slice(0, 96)}{ticket.message?.length > 96 ? '…' : ''}
                          </p>
                          <div className="support-ticket-bottom">
                            <div className="support-badge-row">
                              <span className="support-badge" style={{ backgroundColor: statusColor(ticket.status), color: '#fff' }}>{ticket.status.replace('_', ' ')}</span>
                              <span className="support-badge" style={{ backgroundColor: priorityColor(ticket.priority), color: '#fff' }}>{ticket.priority}</span>
                            </div>
                            <span className="support-inline-copy">{formatSupportTime(ticket.updatedAt || ticket.createdAt)}</span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </aside>

              {selectedTicket ? (
                <section className="support-conversation-panel" style={isMaximized ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, borderRadius: 0, height: '100%', width: '100%' } : {}}>
                  <div className="support-conversation-header">
                    <div>
                      <div className="support-conversation-top">
                        <div>
                          <h2 className="support-conversation-title">{selectedTicket.subject}</h2>
                          <div className="support-conversation-meta">
                            <span className="support-chip"><i className="fas fa-hashtag"></i> {selectedTicket.id}</span>
                            <span className="support-chip"><i className="fas fa-user"></i> {selectedTicket.user?.name || 'Customer'}</span>
                            <span className="support-chip"><i className="fas fa-envelope"></i> {selectedTicket.user?.email || 'No email'}</span>
                          </div>
                        </div>
                        <div className="support-badge-row" style={{ gap: '0.5rem' }}>
                          <button type="button" className="support-icon-button" onClick={() => setIsMaximized(!isMaximized)} title={isMaximized ? 'Restore' : 'Maximize'}>
                            <i className={`fas ${isMaximized ? 'fa-compress' : 'fa-expand'}`}></i>
                          </button>
                          <button type="button" className="support-danger-button" onClick={() => handleDeleteTicket(selectedTicket.id)}>
                            <i className="fas fa-trash"></i> Delete
                          </button>
                        </div>
                      </div>
                      <div className="support-form-grid" style={{ marginTop: '1rem' }}>
                        <div>
                          <label className="support-field-label">Status</label>
                          <select className="support-select" value={selectedTicket.status} onChange={(event) => handleStatusChange(selectedTicket.id, event.target.value)}>
                            <option value="OPEN">Open</option>
                            <option value="IN_PROGRESS">In progress</option>
                            <option value="CLOSED">Closed</option>
                          </select>
                        </div>
                        <div>
                          <label className="support-field-label">Priority</label>
                          <select className="support-select" value={selectedTicket.priority} onChange={(event) => handlePriorityChange(selectedTicket.id, event.target.value)}>
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="URGENT">Urgent</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="support-conversation-body">
                    <div className="support-message-stack">
                      {conversationMessages.map((message) => {
                        const isSelf = message.senderId === user?.id;
                        return (
                          <div key={message.id} className={`support-message-row ${isSelf ? 'is-self' : 'is-other'}`}>
                            <div className="support-message-bubble">
                              <div className="support-badge-row" style={{ justifyContent: 'space-between' }}>
                                <span className="support-message-author">{isSelf ? 'You' : (message.senderLabel || 'Customer')}</span>
                                <span className="support-message-time">{formatSupportTime(message.createdAt)}</span>
                              </div>
                              <p className="support-message-text">
                                {parseMessageLinks(message.message).map((part, idx) =>
                                  typeof part === 'string' ? (
                                    <span key={idx}>{part}</span>
                                  ) : (
                                    <a
                                      key={idx}
                                      href={part.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: 'var(--support-accent, #2D8659)',
                                        textDecoration: 'underline',
                                        wordBreak: 'break-all',
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {part.text}
                                    </a>
                                  )
                                )}
                              </p>
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
                      {typingUser && <div className="support-typing"><i className="fas fa-ellipsis"></i> Customer is typing…</div>}
                      <div ref={messagesEndRef}></div>
                    </div>
                  </div>

                  <div className="support-composer">
                    {selectedTicket.status === 'CLOSED' ? (
                      <div className="support-alert is-success" style={{ marginTop: 0 }}>
                        <i className="fas fa-lock"></i>
                        <span>This ticket is closed. Reopen it to send more replies.</span>
                      </div>
                    ) : (
                      <form onSubmit={handleReply} className="support-compose-surface">
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
                          value={replyText}
                          onChange={handleReplyInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (!isSendingReply && replyText.trim()) handleReply(e);
                            }
                          }}
                          placeholder="Write a reply… (Enter to send, Shift+Enter for new line)"
                          rows={3}
                          disabled={isSendingReply}
                        />
                        <div className="support-composer-toolbar" style={{ justifyContent: 'space-between', marginTop: '0.75rem' }}>
                          <div className="support-chip-row">
                            <button type="button" className="support-secondary-button" onClick={() => fileInputRef.current?.click()} disabled={isSendingReply}>
                              <i className="fas fa-paperclip"></i> Add Files
                            </button>
                            <span className="support-inline-copy">PDF, images, text, Word, Excel up to 5MB each</span>
                          </div>
                          <button type="submit" className="support-primary-button" disabled={isSendingReply}>
                            <i className={`fas ${isSendingReply ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i> {isSendingReply ? 'Sending…' : 'Send Reply'}
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
                    <i className="fas fa-comments" style={{ fontSize: '2rem', color: '#2D8659' }}></i>
                    <h3 className="support-section-title" style={{ marginTop: '1rem' }}>Open a conversation</h3>
                    <p className="support-empty-copy">Pick a ticket from the queue to view the thread in the new chat workspace.</p>
                  </div>
                </section>
              )}
            </section>
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

export default SupportDashboard;
