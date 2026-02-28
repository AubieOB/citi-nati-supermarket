const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify Cloudinary configuration on startup
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('[CLOUDINARY] ⚠️ WARNING: Cloudinary environment variables not fully configured!');
  console.warn('[CLOUDINARY] CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '✓' : '✗');
  console.warn('[CLOUDINARY] API_KEY:', process.env.CLOUDINARY_API_KEY ? '✓' : '✗');
  console.warn('[CLOUDINARY] API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✓' : '✗');
} else {
  console.log('[CLOUDINARY] ✅ Configuration verified');
}

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file, cb) => {
    cb(null, {
      folder: 'citi-nati-products',
      resource_type: 'auto',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    });
  },
});

// File filter to allow only image types
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  
  if (allowedMimes.includes(file.mimetype)) {
    console.log('[CLOUDINARY UPLOAD] ✓ File accepted:', file.originalname);
    cb(null, true);
  } else {
    console.error('[CLOUDINARY UPLOAD] ✗ File rejected - invalid MIME type:', file.mimetype);
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
  console.log('[CLOUDINARY MIDDLEWARE] Starting file upload processing...');
  uploadProductImage.single('image')(req, res, (err) => {
    if (err) {
      console.error('[CLOUDINARY UPLOAD] ❌ Upload error:', err.message);
      return res.status(400).json({ error: `Upload failed: ${err.message}` });
    }
    
    if (req.file) {
      console.log('[CLOUDINARY UPLOAD] 📧 Raw req.file object:', req.file);
      
      // Normalize multer-storage-cloudinary response to standard format
      // multer-storage-cloudinary returns: path, filename, size, mimetype, encoding
      req.file.secure_url = req.file.path;      // Cloudinary URL
      req.file.public_id = req.file.filename;   // Cloudinary public ID
      
      console.log('[CLOUDINARY UPLOAD] ✅ File uploaded successfully:', {
        originalname: req.file.originalname,
        secure_url: req.file.secure_url,
        public_id: req.file.public_id,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
    } else {
      console.log('[CLOUDINARY UPLOAD] ℹ️ No file provided (optional upload)');
    }
    
    next();
  });
};

module.exports = uploadWithLogging;
module.exports.cloudinary = cloudinary;
