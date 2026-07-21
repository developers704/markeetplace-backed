const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  getMySession,
  markSeen,
  loadMoreProducts,
  sendMessage,
  requestHuman,
  returnToAi,
  uploadImage,
  adminListSessions,
  adminGetSession,
  adminGetSummary,
  adminResendSupportEmails,
  adminAcceptSession,
  adminSendMessage,
  adminCloseSession,
} = require('../controllers/supportChat.controller');

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

router.get('/session', getMySession);
router.post('/session/:sessionId/seen', markSeen);
router.post('/session/:sessionId/messages/:messageId/more-products', loadMoreProducts);
router.post('/message', sendMessage);
router.post('/request-human', requestHuman);
router.post('/return-to-ai', returnToAi);
router.post('/image', upload.single('file'), uploadImage);

router.get('/admin/sessions', adminListSessions);
router.get('/admin/summary', adminGetSummary);
router.get('/admin/sessions/:sessionId', adminGetSession);
router.post('/admin/sessions/:sessionId/accept', adminAcceptSession);
router.post('/admin/sessions/:sessionId/resend-emails', adminResendSupportEmails);
router.post('/admin/sessions/:sessionId/message', adminSendMessage);
router.post('/admin/sessions/:sessionId/close', adminCloseSession);

module.exports = router;
