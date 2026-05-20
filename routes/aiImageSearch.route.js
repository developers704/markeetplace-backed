const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const {
  analyzeByImage,
  searchByImage,
  getStats,
  getHealth,
  reloadIndex,
  runIncrementalSync,
  runFullRebuild,
  getIndexJobStatus,
} = require('../controllers/aiImageSearch.controller');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
});

router.use(authMiddleware);

/** Customer / staff visual search (Special Order AI tab) */
router.post('/analyze', upload.single('file'), analyzeByImage);
router.post('/search', upload.single('file'), searchByImage);
router.get('/stats', getStats);

/** Admin — index management */
router.get(
  '/admin/health',
  checkSuperuserOrPermission('Settings', 'View'),
  getHealth,
);
router.get(
  '/admin/status',
  checkSuperuserOrPermission('Settings', 'View'),
  getIndexJobStatus,
);
router.post(
  '/admin/reload',
  checkSuperuserOrPermission('Settings', 'Update'),
  reloadIndex,
);
router.post(
  '/admin/sync',
  checkSuperuserOrPermission('Settings', 'Update'),
  runIncrementalSync,
);
router.post(
  '/admin/rebuild',
  checkSuperuserOrPermission('Settings', 'Update'),
  runFullRebuild,
);

module.exports = router;
