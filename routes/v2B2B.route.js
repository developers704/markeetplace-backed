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
} = require('../controllers/v2B2B.controller');

/**
 * B2B Purchase Flow (v2)
 * Mounted at: /api/v2/b2b
 */

router.use(authMiddleware, attachRoleContext);

router.post('/purchase', createPurchaseRequest);
router.get('/status/:purchaseId', getPurchaseStatus);

router.get('/requests', listPurchaseRequests);
router.post('/approve/:requestId', approvePurchaseRequest);
router.post('/reject/:requestId', rejectPurchaseRequest);

router.get('/store-inventory', listStoreInventory);
router.get('/store-inventory/my', listMyStoreInventory);

module.exports = router;


