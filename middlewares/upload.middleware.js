/**
 * Multer upload middleware for CSV and PDF files
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

// File filter - accept only CSV and PDF
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === 'csv' && ext === '.csv') {
    return cb(null, true);
  }
  if (file.fieldname === 'pdfs' && ext === '.pdf') {
    return cb(null, true);
  }
  cb(new Error('Invalid file type. CSV for csv field, PDF for pdfs field.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
});

// Middleware: csv (single), pdfs (multiple)
exports.uploadMiddleware = upload.fields([
  { name: 'csv', maxCount: 1 },
  { name: 'pdfs', maxCount: 100 },
]);
