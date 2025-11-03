const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const createDirectoryIfNotExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// Create necessary directories
createDirectoryIfNotExists('uploads/courses/thumbnails');
createDirectoryIfNotExists('uploads/courses/videos');
createDirectoryIfNotExists('uploads/courses/content');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'videos' || file.fieldname.startsWith('chapter_video_')) {
            cb(null, 'uploads/courses/videos');
        } else if (file.fieldname === 'courseThumbnail' || file.fieldname === 'videoThumbnails' || file.fieldname.startsWith('content_thumbnail_')) {
            cb(null, 'uploads/courses/thumbnails');
        } else {
            cb(null, 'uploads/courses/content');
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'videos' || file.fieldname.startsWith('chapter_video_')) {
        if (!file.originalname.match(/\.(mp4|webm|mkv)$/)) {
            return cb(new Error('Invalid video format. Only mp4, webm, and mkv files are allowed.'), false);
        }
    } else if (file.fieldname === 'courseThumbnail' || file.fieldname === 'videoThumbnails' || file.fieldname.startsWith('content_thumbnail_')) {
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
            return cb(new Error('Invalid image format. Only jpg, jpeg, and png files are allowed.'), false);
        }
    } else {
        // For other content files, allow common document formats
        if (!file.originalname.match(/\.(pdf|doc|docx|ppt|pptx|txt)$/)) {
            return cb(new Error('Invalid file format. Only pdf, doc, docx, ppt, pptx, and txt files are allowed.'), false);
        }
    }
    cb(null, true);
};

const limits = {
    videos: 500 * 1024 * 1024, // 500MB
    thumbnails: 2 * 1024 * 1024, // 2MB
    documents: 10 * 1024 * 1024 // 10MB
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: (req, file) => {
            if (file.fieldname === 'videos' || file.fieldname.startsWith('chapter_video_')) {
                return limits.videos;
            } else if (file.fieldname === 'courseThumbnail' || file.fieldname === 'videoThumbnails' || file.fieldname.startsWith('content_thumbnail_')) {
                return limits.thumbnails;
            } else {
                return limits.documents;
            }
        }
    }
});


const handleUpload = (req, res, next) => {
    upload.any()(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    message: `File size too large. Videos must be less than ${limits.videos / (1024 * 1024)}MB, images less than ${limits.thumbnails / (1024 * 1024)}MB, and documents less than ${limits.documents / (1024 * 1024)}MB`
                });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({
                    message: 'Maximum file count exceeded'
                });
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({
                    message: 'Unexpected field name in upload'
                });
            }
        }
        if (err) {
            return res.status(400).json({ message: err.message });
        }
        next();
    });
};

module.exports = handleUpload;
