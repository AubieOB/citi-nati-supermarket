const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  createTicket,
  getMyTickets,
  getTicketById,
  getAllTickets,
  replyToTicket,
  updateTicketStatus,
  updateTicketPriority,
  deleteTicket
} = require('../controllers/support.controller');
const { uploadTicketAttachment } = require('../controllers/upload.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/tickets/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

const router = express.Router();

// Apply authentication to all routes
router.use(verifyTokenMiddleware);

/**
 * CUSTOMER ROUTES
 */

// Create a new support ticket
router.post('/tickets', createTicket);

// Get all tickets for current user
router.get('/my-tickets', getMyTickets);

// Get specific ticket details
router.get('/tickets/:id', getTicketById);

// Reply to a ticket
router.post('/tickets/:id/reply', replyToTicket);

// Delete a ticket
router.delete('/tickets/:id', deleteTicket);

/**
 * FILE UPLOAD ROUTES
 */

// Upload ticket attachment
router.post('/upload-attachment', upload.single('file'), uploadTicketAttachment);

/**
 * ADMIN ROUTES
 */

// Get all tickets (admin only)
router.get('/admin/tickets', getAllTickets);

// Update ticket status (admin only)
router.patch('/admin/tickets/:id/status', updateTicketStatus);

// Update ticket priority (admin only)
router.patch('/admin/tickets/:id/priority', updateTicketPriority);

module.exports = router;
