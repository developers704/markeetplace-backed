const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { attachRoleContext } = require('../middlewares/b2bRole.middleware');
const { getAdminChatUnreadSummary } = require('../controllers/adminChatUnread.controller');

router.use(authMiddleware, attachRoleContext);
router.get('/chat-unread-summary', getAdminChatUnreadSummary);

module.exports = router;
