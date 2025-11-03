const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for CSV files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/csv/bulk-products';
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bulk-products-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to only allow CSV files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Middleware for single CSV file upload
const uploadBulkProductCSV = upload.single('csvFile');

// Middleware for multiple CSV files upload (if needed)
const uploadMultipleBulkProductCSV = upload.array('csvFiles', 5);

module.exports = {
  uploadBulkProductCSV,
  uploadMultipleBulkProductCSV
};
