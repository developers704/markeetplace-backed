const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const createDirectoryIfNotExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// Create directory for React Quill images
createDirectoryIfNotExists('uploads/courses/quill-images');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/courses/quill-images');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'quill-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit for images
    }
});

const handleQuillImageUpload = upload.single('image');

module.exports = handleQuillImageUpload;

