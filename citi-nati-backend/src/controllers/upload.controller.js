const fs = require('fs');
const path = require('path');

/**
 * Upload file for support ticket attachment
 * POST /upload/ticket-attachment
 */
const uploadTicketAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file provided'
      });
    }

    const { ticketId, replyId } = req.body;

    // Validate ticket ID
    if (!ticketId) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Ticket ID is required'
      });
    }

    // File info
    const fileUrl = `/uploads/tickets/${req.file.filename}`;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    const mimeType = req.file.mimetype;

    res.json({
      success: true,
      attachment: {
        fileName,
        fileUrl,
        fileSize,
        mimeType,
        ticketId,
        replyId
      }
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    
    // Clean up uploaded file
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error deleting uploaded file:', e);
      }
    }

    res.status(500).json({
      error: 'Failed to upload file'
    });
  }
};

module.exports = {
  uploadTicketAttachment
};
