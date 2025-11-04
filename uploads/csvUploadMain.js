// csvUploadMain.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join('uploads', 'csv');   // << saves to uploads/csv
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'file-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// accept common CSV mimetypes or .csv extension
const allowed = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];
const fileFilter = (req, file, cb) => {
  const okMime = allowed.includes(file.mimetype);
  const okExt  = path.extname(file.originalname).toLowerCase() === '.csv';
  return (okMime || okExt) ? cb(null, true) : cb(new Error('Only .csv files are allowed'), false);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 50 } // 50MB
});
