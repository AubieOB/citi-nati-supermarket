const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { notifySupportTicketCreated } = require('../utils/messageService.js');

const prisma = new PrismaClient();

const normalizeReplyAttachments = (files, attachments) => {
  const uploadedFiles = Array.isArray(files)
    ? files.map((file) => ({
        fileName: file.originalname,
        fileUrl: `/uploads/tickets/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
      }))
    : [];

  let normalizedAttachments = [];
  if (Array.isArray(attachments)) {
    normalizedAttachments = attachments;
  } else if (typeof attachments === 'string') {
    try {
      const parsed = JSON.parse(attachments);
      if (Array.isArray(parsed)) {
        normalizedAttachments = parsed;
      }
    } catch (error) {
      normalizedAttachments = [];
    }
  }

  return [...uploadedFiles, ...normalizedAttachments]
    .filter((attachment) => attachment?.fileName && attachment?.fileUrl)
    .map((attachment) => ({
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileSize: Number(attachment.fileSize) || 0,
      mimeType: attachment.mimeType || 'application/octet-stream',
    }));
};

/**
 * Create a new support ticket
 * POST /support/tickets
 */
const createTicket = async (req, res) => {
  try {
    const { subject, message, priority } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!subject || !message) {
      return res.status(400).json({
        error: 'Subject and message are required'
      });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        subject,
        message,
        priority: priority || 'MEDIUM',
        userId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        replies: {
          include: {
            attachments: true
          }
        }
      }
    });

    await notifySupportTicketCreated(ticket);

    // Emit Socket.io event to notify admins of new ticket in real-time
    if (global.io) {
      global.io.emit('newTicket', {
        id: ticket.id,
        subject: ticket.subject,
        message: ticket.message,
        priority: ticket.priority,
        userName: ticket.user.name,
        userEmail: ticket.user.email,
        userId: ticket.user.id,
        createdAt: ticket.createdAt,
        status: ticket.status
      });
      logger.debugLog('[Socket.io] New ticket created - emitted to admin:', ticket.subject);
    }

    res.status(201).json({
      success: true,
      ticket
    });
  } catch (error) {
    logger.errorLog('Error creating ticket:', { message: error && error.message ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to create support ticket'
    });
  }
};

/**
 * Get all tickets for current user
 * GET /support/my-tickets
 */
const getMyTickets = async (req, res) => {
  try {
    const userId = req.user.userId;

    const tickets = await prisma.supportTicket.findMany({
      where: { userId },
      include: {
        replies: {
          include: {
            attachments: true
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      count: tickets.length,
      tickets
    });
  } catch (error) {
    logger.errorLog('Error fetching user tickets:', { message: error && error.message ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to fetch support tickets'
    });
  }
};

/**
 * Get ticket details
 * GET /support/tickets/:id
 */
const getTicketById = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const userId = req.user.userId;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        replies: {
          include: {
            attachments: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({
        error: 'Support ticket not found'
      });
    }

    // Check authorization: user can only view their own tickets (unless admin)
    if (ticket.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Not authorized to view this ticket'
      });
    }

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    logger.errorLog('Error fetching ticket:', { message: error && error.message ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to fetch support ticket'
    });
  }
};

/**
 * Admin: Get all tickets
 * GET /admin/support/tickets
 */
const getAllTickets = async (req, res) => {
  try {
    // This endpoint should only be accessible to admins
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Not authorized to view all tickets'
      });
    }

    const { status, priority, sortBy = 'createdAt' } = req.query;
    
    // Build filter
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        replies: {
          include: {
            attachments: true
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { [sortBy]: 'desc' }
    });

    res.json({
      success: true,
      count: tickets.length,
      tickets
    });
  } catch (error) {
    logger.errorLog('Error fetching all tickets:', { message: error && error.message ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to fetch support tickets'
    });
  }
};

/**
 * Reply to a ticket
 * POST /support/tickets/:id/reply
 */
const replyToTicket = async (req, res) => {
  try {
    const { message, attachments } = req.body;
    const replyAttachments = normalizeReplyAttachments(req.files, attachments);
    const ticketId = parseInt(req.params.id);
    const senderId = req.user.userId;

    // Validate message
    if (!message || !message.trim()) {
      return res.status(400).json({
        error: 'Message is required'
      });
    }

    // Check if ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      return res.status(404).json({
        error: 'Support ticket not found'
      });
    }

    // Check authorization: user can reply if they own the ticket or are admin
    if (ticket.userId !== senderId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Not authorized to reply to this ticket'
      });
    }

    // Create reply with attachments
    const reply = await prisma.ticketReply.create({
      data: {
        message,
        ticketId,
        senderId,
        attachments: replyAttachments.length > 0 ? {
          create: replyAttachments.map((att) => ({
            fileName: att.fileName,
            fileUrl: att.fileUrl,
            fileSize: att.fileSize,
            mimeType: att.mimeType || 'application/octet-stream'
          }))
        } : undefined
      },
      include: {
        attachments: true
      }
    });

    // Update ticket's updatedAt timestamp
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() }
    });

    if (global.io) {
      global.io.to(`ticket_${ticketId}`).emit('ticketMessage', reply);
      logger.debugLog(`[Socket.io] Ticket ${ticketId} reply broadcast`);
    }

    res.status(201).json({
      success: true,
      reply
    });
  } catch (error) {
    logger.errorLog('Error creating reply:', { message: error && error.message ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to create reply'
    });
  }
};

/**
 * Update ticket status (Admin only)
 * PATCH /admin/support/tickets/:id/status
 */
const updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const ticketId = parseInt(req.params.id);

    // This endpoint should only be accessible to admins
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Not authorized to update ticket status'
      });
    }

    // Validate status
    const validStatuses = ['OPEN', 'IN_PROGRESS', 'CLOSED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be OPEN, IN_PROGRESS, or CLOSED'
      });
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        replies: {
          include: {
            attachments: true
          }
        }
      }
    });

    // Emit Socket.io event for real-time updates
    if (global.io) {
      global.io.emit('ticketStatusChanged', {
        ticketId: ticket.id,
        status: ticket.status,
        userId: ticket.userId
      });
      logger.debugLog(`[Socket.io] Ticket ${ticket.id} status changed to ${status}`);
    }

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Support ticket not found'
      });
    }
    logger.errorLog('Error updating ticket status:', { message: error && error.message ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to update ticket status'
    });
  }
};

/**
 * Update ticket priority (Admin only)
 * PATCH /admin/support/tickets/:id/priority
 */
const updateTicketPriority = async (req, res) => {
  try {
    const { priority } = req.body;
    const ticketId = parseInt(req.params.id);

    // This endpoint should only be accessible to admins
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Not authorized to update ticket priority'
      });
    }

    // Validate priority
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    if (!priority || !validPriorities.includes(priority)) {
      return res.status(400).json({
        error: 'Invalid priority. Must be LOW, MEDIUM, HIGH, or URGENT'
      });
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { priority },
      include: {
        replies: {
          include: {
            attachments: true
          }
        }
      }
    });

    // Emit Socket.io event for real-time updates
    if (global.io) {
      global.io.emit('ticketPriorityChanged', {
        ticketId: ticket.id,
        priority: ticket.priority,
        userId: ticket.userId
      });
      logger.debugLog(`[Socket.io] Ticket ${ticket.id} priority changed to ${priority}`);
    }

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Support ticket not found'
      });
    }
    logger.errorLog('Error updating ticket priority:', { message: error && error.message ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to update ticket priority'
    });
  }
};

/**
 * Delete a ticket
 * DELETE /support/tickets/:id
 */
const deleteTicket = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const userId = req.user.userId;

    // Check if ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      return res.status(404).json({
        error: 'Support ticket not found'
      });
    }

    // Check authorization: user can delete if they own the ticket or are admin
    if (ticket.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Not authorized to delete this ticket'
      });
    }

    // Delete ticket (cascade will handle replies and attachments)
    await prisma.supportTicket.delete({
      where: { id: ticketId }
    });

    // Emit Socket.io event for real-time updates
    if (global.io) {
      global.io.emit('ticketDeleted', {
        ticketId: ticketId,
        userId: ticket.userId
      });
      logger.debugLog(`[Socket.io] Ticket ${ticketId} deleted`);
    }

    res.json({
      success: true,
      message: 'Support ticket deleted successfully'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Support ticket not found'
      });
    }
    logger.errorLog('Error deleting ticket:', { message: error && error.message ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to delete support ticket'
    });
  }
};

module.exports = {
  createTicket,
  getMyTickets,
  getTicketById,
  getAllTickets,
  replyToTicket,
  updateTicketStatus,
  updateTicketPriority,
  deleteTicket
};
