const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { attachRoleContext, requireAdmin } = require('../middlewares/b2bRole.middleware');
const {
  createBatchOrders,
  listMyOrders,
  listAdminOrders,
  getOrder,
  patchStatus,
  approveOrder,
  rejectOrder,
} = require('../controllers/storeToMainTransfer.controller');

router.use(authMiddleware, attachRoleContext);

// User routes
router.post('/', createBatchOrders);
router.get('/mine', listMyOrders);

// Admin routes
router.get('/admin', requireAdmin(), listAdminOrders);
router.patch('/:id/status', requireAdmin(), patchStatus);
router.post('/:id/approve', requireAdmin(), approveOrder);
router.post('/:id/reject', requireAdmin(), rejectOrder);

// Shared (access-checked inside controller)
router.get('/:id', getOrder);

module.exports = router;
