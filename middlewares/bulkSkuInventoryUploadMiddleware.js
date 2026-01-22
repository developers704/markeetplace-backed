const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for SKU Inventory CSV files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/csv/sku-inventory';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'sku-inventory-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

const uploadSkuInventoryCSV = upload.single('csvFile');

module.exports = { uploadSkuInventoryCSV };


