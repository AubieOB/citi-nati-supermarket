const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const logger = require('../utils/logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify Cloudinary configuration on startup
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  logger.warnLog('[CLOUDINARY] ⚠️ WARNING: Cloudinary environment variables not fully configured!', {
    CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ? '✓' : '✗',
    API_KEY: process.env.CLOUDINARY_API_KEY ? '✓' : '✗',
    API_SECRET: process.env.CLOUDINARY_API_SECRET ? '✓' : '✗',
  });
} else {
  logger.debugLog('[CLOUDINARY] Configuration verified');
}

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'citi-nati-products',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

// File filter to allow only image types
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  
  if (allowedMimes.includes(file.mimetype)) {
    logger.debugLog('[CLOUDINARY UPLOAD] ✓ File accepted', { originalname: file.originalname });
    cb(null, true);
  } else {
    logger.errorLog('[CLOUDINARY UPLOAD] ✗ File rejected - invalid MIME type:', { mimetype: file.mimetype });
    cb(new Error('Only image files are allowed (jpg, jpeg, png, webp)'), false);
  }
};

// Create multer instance with Cloudinary storage
const uploadProductImage = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
});

// Wrap multer to add logging and normalize response
const uploadWithLogging = (req, res, next) => {
  logger.debugLog('[CLOUDINARY MIDDLEWARE] Starting file upload processing');
  uploadProductImage.single('image')(req, res, (err) => {
    if (err) {
      logger.errorLog('[CLOUDINARY UPLOAD] ❌ Upload error:', { message: err.message });
      return res.status(400).json({ error: `Upload failed: ${err.message}` });
    }
    
    if (req.file) {
      logger.debugLog('[CLOUDINARY UPLOAD] Raw req.file object', { file: req.file });
      
      // Normalize multer-storage-cloudinary response to standard format
      // multer-storage-cloudinary returns: path, filename, size, mimetype, encoding
      req.file.secure_url = req.file.path;      // Cloudinary URL
      req.file.public_id = req.file.filename;   // Cloudinary public ID
      
      logger.debugLog('[CLOUDINARY UPLOAD] ✅ File uploaded successfully', {
        originalname: req.file.originalname,
        secure_url: req.file.secure_url,
        public_id: req.file.public_id,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
    } else {
      logger.debugLog('[CLOUDINARY UPLOAD] No file provided (optional upload)');
    }
    
    next();
  });
};

module.exports = uploadWithLogging;
module.exports.cloudinary = cloudinary;
