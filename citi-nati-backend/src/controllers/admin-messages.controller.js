const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
    const newMessage = await prisma.adminMessage.create({
      data: {
        type,
        title,
        message,
        read: false,
      },
    });
    console.log('[MESSAGE] Created admin message:', newMessage.id, type);
    return newMessage;
  } catch (error) {
    console.error('[ERROR] Create admin message:', error);
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
