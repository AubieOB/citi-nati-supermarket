const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Deduplication cache to prevent duplicate notifications
 */
const messageDeduplicationCache = new Map();
const MESSAGE_DEDUP_TTL = 5000; // 5 seconds

/**
 * Check if message was recently created (deduplication)
 */
const isMessageDuplicate = (type, title, message) => {
  const key = `${type}:${title}:${message}`;
  if (messageDeduplicationCache.has(key)) {
    console.log('[ADMIN_MSG] Duplicate detected, skipping:', key.substring(0, 50));
    return true;
  }
  
  messageDeduplicationCache.set(key, true);
  setTimeout(() => {
    messageDeduplicationCache.delete(key);
  }, MESSAGE_DEDUP_TTL);
  
  return false;
};

/**
 * Get all admin messages with optional filtering
 */
const getMessages = async (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;

    let where = {};
    if (type) {
      where.type = type;
    }

    const messages = await prisma.adminMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    const total = await prisma.adminMessage.count({ where });

    return res.json({
      messages,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('[ERROR] Get admin messages:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/**
 * Mark a message as read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const message = await prisma.adminMessage.update({
      where: { id: parseInt(id) },
      data: { read: true },
    });

    return res.json(message);
  } catch (error) {
    console.error('[ERROR] Mark message as read:', error);
    return res.status(500).json({ error: 'Failed to update message' });
  }
};

/**
 * Mark a message as unread
 */
const markAsUnread = async (req, res) => {
  try {
    const { id } = req.params;

    const message = await prisma.adminMessage.update({
      where: { id: parseInt(id) },
      data: { read: false },
    });

    return res.json(message);
  } catch (error) {
    console.error('[ERROR] Mark message as unread:', error);
    return res.status(500).json({ error: 'Failed to update message' });
  }
};

/**
 * Delete a single message
 */
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.adminMessage.delete({
      where: { id: parseInt(id) },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[ERROR] Delete message:', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
};

/**
 * Delete all messages
 */
const deleteAllMessages = async (req, res) => {
  try {
    const result = await prisma.adminMessage.deleteMany();

    return res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error('[ERROR] Delete all messages:', error);
    return res.status(500).json({ error: 'Failed to delete messages' });
  }
};

/**
 * Create a new admin message (used internally)
 */
const createMessage = async (type, title, message) => {
  try {
    // Check for duplicates
    if (isMessageDuplicate(type, title, message)) {
      console.log('[MESSAGE] Duplicate message skipped:', type);
      return null;
    }

    const newMessage = await prisma.adminMessage.create({
      data: {
        type,
        title,
        message,
        read: false,
      },
    });
    console.log('[MESSAGE] Created admin message:', newMessage.id, type);

    // Emit real-time notification to all admins via Socket.io
    if (global.io) {
      global.io.to('admin_room').emit('newAdminMessage', {
        id: newMessage.id,
        type: newMessage.type,
        title: newMessage.title,
        message: newMessage.message,
        read: newMessage.read,
        createdAt: newMessage.createdAt,
      });
      console.log('[Socket.io] Admin message', newMessage.id, 'emitted to admin_room');
    }

    return newMessage;
  } catch (error) {
    console.error('[ERROR] Create admin message:', error);
    return null;
  }
};

module.exports = {
  getMessages,
  markAsRead,
  markAsUnread,
  deleteMessage,
  deleteAllMessages,
  createMessage,
};
