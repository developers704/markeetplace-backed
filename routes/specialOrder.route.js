const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { uploadSpoAttachments, uploadSpoChatAttachments } = require('../middlewares/spoUpload.middleware');

const {
  createSpecialOrder,
  listMySpecialOrders,
  listAdminSpecialOrders,
  getSpecialOrderById,
  updateSpecialOrder,
  finalizeSpecialOrder,
  listSpoChatMessages,
  postSpoChatMessage,
  markSpoChatSeen,
  isPrivilegedSpecialOrderAdmin,
} = require('../controllers/specialOrder.controller');

const checkSpecialOrderAdmin = (req, res, next) => {
  if (isPrivilegedSpecialOrderAdmin(req)) return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

router.use(authMiddleware);

router.post('/', uploadSpoAttachments, createSpecialOrder);
router.get('/', listMySpecialOrders);
router.get('/admin', listAdminSpecialOrders);

router.patch('/:id/finalize', finalizeSpecialOrder);
router.get('/:id/chat-messages', listSpoChatMessages);
router.post('/:id/chat-messages', uploadSpoChatAttachments, postSpoChatMessage);
router.post('/:id/chat-messages/seen', markSpoChatSeen);
router.get('/:id', getSpecialOrderById);
router.patch('/:id',  updateSpecialOrder);

module.exports = router;
