const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(process.cwd(), 'uploads', 'spo');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `spo-${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedImages = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'image/svg+xml',
    'image/heic',
    'image/heif',
  ];
    const allowedVideos = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo', // avi
    'video/x-matroska', // mkv
    'video/mpeg',
  ];
    const allowedDocuments = [
    'application/pdf',

    // Word
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

    // Excel
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    // PowerPoint
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Text
    'text/plain',
    'text/csv',

    // Zip
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
  ];
  if (allowedImages.includes(file.mimetype) || allowedVideos.includes(file.mimetype)||  allowedDocuments.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images, videos, PDF, Word, Excel, PowerPoint, TXT, CSV and ZIP files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadSpoAttachments = upload.fields([
  { name: 'attachments', maxCount: 10 },
  { name: 'canvasDrawing', maxCount: 1 },
]);

const uploadSpoChatAttachments = upload.array('chatAttachments', 5);

module.exports = { uploadSpoAttachments, uploadSpoChatAttachments };
