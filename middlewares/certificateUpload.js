const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create certificates directory if it doesn't exist
const certificatesDir = 'uploads/certificates';
if (!fs.existsSync(certificatesDir)) {
  fs.mkdirSync(certificatesDir, { recursive: true });
}

// Storage configuration for certificate signatures
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/certificates/';
    
    // Create subdirectories based on file type
    if (file.fieldname === 'userSignature') {
      uploadPath += 'user-signatures/';
    } else if (file.fieldname === 'presidentSignature') {
      uploadPath += 'president-signatures/';
    } else if (file.fieldname === 'certificateImage') {
      uploadPath += 'generated-certificates/';
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(file.originalname);
    
    let filename;
    if (file.fieldname === 'userSignature') {
      // Include user ID in filename if available
      const userId = req.user?.id || 'unknown';
      filename = `user-sig-${userId}-${timestamp}-${randomString}${extension}`;
    } else if (file.fieldname === 'presidentSignature') {
      filename = `president-sig-${timestamp}-${randomString}${extension}`;
    } else if (file.fieldname === 'certificateImage') {
      filename = `certificate-${timestamp}-${randomString}${extension}`;
    } else {
      filename = `cert-file-${timestamp}-${randomString}${extension}`;
    }
    
    cb(null, filename);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  console.log('File filter check:', {
    fieldname: file.fieldname,
    mimetype: file.mimetype,
    originalname: file.originalname
  });
  
  // Allow only image files
  if (file.mimetype.startsWith('image/')) {
    // Additional check for signature files
    if (file.fieldname === 'userSignature' || file.fieldname === 'presidentSignature') {
      // Accept PNG, JPG, JPEG for signatures
      if (file.mimetype === 'image/png' || 
          file.mimetype === 'image/jpeg' || 
          file.mimetype === 'image/jpg') {
        cb(null, true);
      } else {
        cb(new Error('Only PNG, JPG, JPEG files are allowed for signatures!'), false);
      }
    } else {
      cb(null, true);
    }
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Multer configuration
const certificateUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for certificate images
    files: 3 // Maximum 3 files (user signature, president signature, certificate image)
  }
});

// Middleware for certificate request (user signature only)
const uploadCertificateRequest = certificateUpload.fields([
  { name: 'userSignature', maxCount: 1 }
]);

// Middleware for admin approval (president signature)
const uploadPresidentSignature = certificateUpload.fields([
  { name: 'presidentSignature', maxCount: 1 }
]);

// Middleware for final certificate upload (generated certificate image)
const uploadCertificateImage = certificateUpload.fields([
  { name: 'certificateImage', maxCount: 1 }
]);

// Combined middleware for multiple file types
const uploadCertificateFiles = certificateUpload.fields([
  { name: 'userSignature', maxCount: 1 },
  { name: 'presidentSignature', maxCount: 1 },
  { name: 'certificateImage', maxCount: 1 }
]);

// Error handling middleware
const handleCertificateUploadError = (error, req, res, next) => {
  console.error('Certificate upload error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 10MB allowed for certificate images.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 3 files allowed.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field. Allowed fields: userSignature, presidentSignature, certificateImage'
      });
    }
  }
  
  if (error.message.includes('Only PNG, JPG, JPEG')) {
    return res.status(400).json({
      success: false,
      message: 'Only PNG, JPG, JPEG files are allowed for signatures.'
    });
  }
  
  if (error.message.includes('Only image files')) {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed.'
    });
  }
  
  next(error);
};

module.exports = {
  uploadCertificateRequest,
  uploadPresidentSignature,
  uploadCertificateImage,
  uploadCertificateFiles,
  handleCertificateUploadError
};
