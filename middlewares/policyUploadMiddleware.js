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
    cb(null, 'uploads/images/policies'); // Save to policies folder
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

const policyUploadMiddleware = (req, res, next) => {
  upload.single('picture')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        res.status(400).json({ error: err.message });
      } else {
        res.status(400).json({ error: err.message });
      }
    } else {
      next();
    }
  });
};

module.exports = policyUploadMiddleware;
