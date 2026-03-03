const fs = require('fs');
const path = require('path');

/**
 * Upload file for support ticket attachment
 * POST /support/upload-attachment
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

/**
 * Download ticket attachment with proper headers
 * GET /support/download-attachment/:filename
 */
const downloadTicketAttachment = async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    // Security: prevent directory traversal attacks
    const safeFilename = path.basename(filename);
    const filePath = path.join(__dirname, '../../uploads/tickets', safeFilename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file stats
    const stat = fs.statSync(filePath);

    // Set proper headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    // Stream file to client
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('Error streaming file:', err);
      res.status(500).json({ error: 'Failed to download file' });
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
};

module.exports = {
  uploadTicketAttachment,
  downloadTicketAttachment
};
