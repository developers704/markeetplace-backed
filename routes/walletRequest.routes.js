const express = require('express');
const router = express.Router();
const controller = require('../controllers/walletRequest.controller');
const authMiddleware = require('../middlewares/authMiddleware.js');

router.post('/', authMiddleware, controller.createWalletRequest);
router.post('/bulk-update', authMiddleware, controller.bulkUpdateWalletRequests);
router.get('/', authMiddleware, controller.getAllWalletRequests);
router.get('/', authMiddleware, controller.getCustomerWalletRequests);
router.get('/details', authMiddleware, controller.getCustomerWalletDetails);
router.put('/:requestId', authMiddleware, controller.handleWalletRequest);

module.exports = router;