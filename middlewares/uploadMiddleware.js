const multer = require('multer');
const path = require('path');

function generateUniqueFilename(file) {
  const timestamp = Date.now();
  const originalName = file.originalname;
  const ext = path.extname(originalName);
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomString}${ext}`;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/images/products'); // Save to the same folder
  },
  filename: function (req, file, cb) {
    cb(null, generateUniqueFilename(file));
  },
});


const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true); // Allow image files
  } else {
    cb(new Error('Not an image! Please upload only images.'), false); // Reject non-image files
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 5 // Max file size: 5MB
  }
});

const uploadMiddleware = (req, res, next) => {
  const uploadFields = [
    { name: 'gallery', maxCount: 5 }, // Allow up to 5 gallery images
    { name: 'image', maxCount: 1 } // Allow 1 image (for the main product image)
  ];

  upload.fields(uploadFields)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({ error: 'You can only upload up to 5 gallery images and 1 main image' });
        } else {
          res.status(400).json({ error: err.message });
        }
      } else {
        res.status(400).json({ error: err.message });
      }
    } else {
      next();
    }
  });
};

module.exports = uploadMiddleware;
