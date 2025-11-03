const multer = require('multer');
const path = require('path');

// Use memory storage to keep images in memory without saving to disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};

const upload = multer({
  storage: storage, // Store files in memory
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 5 // 5MB size limit per image
  }
});

// Middleware function for handling image uploads
const uploadReviewImagesMiddleware = (req, res, next) => {
  upload.array('images', 3)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'You can upload up to 3 images per review.' });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    next(); // Proceed to the controller
  });
};

module.exports = uploadReviewImagesMiddleware;