const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { attachRoleContext, requireAdmin } = require('../middlewares/b2bRole.middleware');
const { uploadSpoChatAttachments } = require('../middlewares/spoUpload.middleware');
const {
  createStoreTransferOrder,
  listMyStoreTransferOrders,
  listAdminStoreTransferOrders,
  exportAdminStoreTransferOrdersCsv,
  getStoreTransferOrder,
  patchStoreTransferStatus,
  approveStoreTransferOrder,
  markStoreTransferReceived,
  listStoreTransferChatMessages,
  postStoreTransferChatMessage,
  markStoreTransferChatSeen,
  getMyStoreInventory,
  createBatchStoreTransferOrders,
} = require('../controllers/b2bStoreTransfer.controller');

router.use(authMiddleware, attachRoleContext);

router.get('/my-store-inventory', getMyStoreInventory);
router.post('/batch', createBatchStoreTransferOrders);
router.post('/', createStoreTransferOrder);
router.get('/mine', listMyStoreTransferOrders);
router.get('/admin', requireAdmin(), listAdminStoreTransferOrders);
router.get('/admin/export/csv', requireAdmin(), exportAdminStoreTransferOrdersCsv);

router.get('/:id/chat-messages', listStoreTransferChatMessages);
router.post('/:id/chat-messages', uploadSpoChatAttachments, postStoreTransferChatMessage);
router.post('/:id/chat-messages/seen', markStoreTransferChatSeen);
router.patch('/:id/status', requireAdmin(), patchStoreTransferStatus);
router.post('/:id/approve', requireAdmin(), approveStoreTransferOrder);
router.post('/:id/received', markStoreTransferReceived);
router.get('/:id', getStoreTransferOrder);

module.exports = router;
