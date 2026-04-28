const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listFileManager,
  downloadFile,
  createFolder,
  uploadMw,
  uploadFiles,
  deleteEntry,
} = require('../controllers/fileManager.controller');

const router = express.Router();

function requireSuperuser(req, res, next) {
  if (!req.user?.is_superuser) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

router.use(authMiddleware);
router.use(requireSuperuser);

router.get('/file', downloadFile);
router.get('/', listFileManager);
router.post('/folder', createFolder);
router.post('/upload', uploadMw.array('files', 4000), uploadFiles);
router.delete('/', deleteEntry);

module.exports = router;
