const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware.js');
const {
  getMessages,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  resolveMessage,
  deleteMessage,
  deleteAllMessages,
} = require('../controllers/admin-messages.controller.js');

/**
 * Admin Messages Routes
 * All routes require admin authentication
 */

// Get all messages (with filtering)
router.get('/', verifyTokenMiddleware, verifyAdmin, getMessages);

// Mark all messages as read (specific route before parameterized routes)
router.patch('/read/all', verifyTokenMiddleware, verifyAdmin, markAllAsRead);

// Mark message as read
router.patch('/:id/read', verifyTokenMiddleware, verifyAdmin, markAsRead);

// Mark message as unread
router.patch('/:id/unread', verifyTokenMiddleware, verifyAdmin, markAsUnread);

// Resolve message lifecycle state
router.patch('/:id/resolve', verifyTokenMiddleware, verifyAdmin, resolveMessage);

// Delete a single message (must be before '/')
router.delete('/:id', verifyTokenMiddleware, verifyAdmin, deleteMessage);

// Delete all messages
router.delete('/', verifyTokenMiddleware, verifyAdmin, deleteAllMessages);

module.exports = router;
