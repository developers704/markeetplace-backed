const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { attachRoleContext, requireAdmin } = require('../middlewares/b2bRole.middleware');
const {
  createStoreTransferOrder,
  listMyStoreTransferOrders,
  listAdminStoreTransferOrders,
  getStoreTransferOrder,
  patchStoreTransferStatus,
  approveStoreTransferOrder,
  markStoreTransferReceived,
  listStoreTransferChatMessages,
  postStoreTransferChatMessage,
} = require('../controllers/b2bStoreTransfer.controller');

router.use(authMiddleware, attachRoleContext);

router.post('/', createStoreTransferOrder);
router.get('/mine', listMyStoreTransferOrders);
router.get('/admin', requireAdmin(), listAdminStoreTransferOrders);

router.get('/:id/chat-messages', listStoreTransferChatMessages);
router.post('/:id/chat-messages', postStoreTransferChatMessage);
router.patch('/:id/status', requireAdmin(), patchStoreTransferStatus);
router.post('/:id/approve', requireAdmin(), approveStoreTransferOrder);
router.post('/:id/received', markStoreTransferReceived);
router.get('/:id', getStoreTransferOrder);

module.exports = router;
