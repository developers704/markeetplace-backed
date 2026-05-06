const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const { attachRoleContext } = require('../middlewares/b2bRole.middleware');

const {
  createPurchaseRequest,
  getPurchaseStatus,
  listPurchaseRequests,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  listStoreInventory,
  listMyStoreInventory,
  patchPurchaseFulfillment,
  markPurchaseReceived,
  listB2bPurchaseChatMessages,
  postB2bPurchaseChatMessage,
  markB2bPurchaseChatSeen,
} = require('../controllers/v2B2B.controller');

/**
 * B2B Purchase Flow (v2)
 * Mounted at: /api/v2/b2b
 */

router.use(authMiddleware, attachRoleContext);

router.post('/purchase', createPurchaseRequest);
router.get('/status/:purchaseId', getPurchaseStatus);

router.patch('/requests/:purchaseId/fulfillment', patchPurchaseFulfillment);
router.post('/requests/:purchaseId/mark-received', markPurchaseReceived);
router.get('/requests/:purchaseId/chat-messages', listB2bPurchaseChatMessages);
router.post('/requests/:purchaseId/chat-messages', postB2bPurchaseChatMessage);
router.post('/requests/:purchaseId/chat-messages/seen', markB2bPurchaseChatSeen);

router.get('/requests', listPurchaseRequests);
router.post('/approve/:requestId', approvePurchaseRequest);
router.post('/reject/:requestId', rejectPurchaseRequest);

router.get('/store-inventory', listStoreInventory);
router.get('/store-inventory/my', listMyStoreInventory);

module.exports = router;


