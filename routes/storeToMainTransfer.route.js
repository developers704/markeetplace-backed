const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { attachRoleContext, requireAdmin } = require('../middlewares/b2bRole.middleware');
const {
  createBatchOrders,
  listMyOrders,
  listAdminOrders,
  getOrder,
  getOrderItem,
  patchStatus,
  approveOrder,
  approveItems,
  rejectOrder,
  rejectItems,
  markItemsReceived,
  receiveAllApproved,
} = require('../controllers/storeToMainTransfer.controller');

router.use(authMiddleware, attachRoleContext);

// User routes
router.post('/', createBatchOrders);
router.get('/mine', listMyOrders);

// Admin routes
router.get('/admin', requireAdmin(), listAdminOrders);
router.patch('/:id/status', requireAdmin(), patchStatus);
router.post('/:id/approve', requireAdmin(), approveOrder);
router.post('/:id/approve-items', requireAdmin(), approveItems);
router.post('/:id/reject', requireAdmin(), rejectOrder);
router.post('/:id/reject-items', requireAdmin(), rejectItems);
router.post('/:id/receive-items', requireAdmin(), markItemsReceived);
router.post('/:id/receive-all', requireAdmin(), receiveAllApproved);

// Shared (access-checked inside controller)
router.get('/:id/items/:itemId', getOrderItem);
router.get('/:id', getOrder);

module.exports = router;
