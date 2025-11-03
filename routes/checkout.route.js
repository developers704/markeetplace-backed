const express = require('express');
const router = express.Router();
const {
    calculateOrderTotals,
    placeOrder,
    getUserOrders,
    getAllOrders,
    updateOrderStatus,
    cancelOrderForCustomer,
    cancelOrder,
    updatePaymentMethod,
    updateWalletBalance,
    getAllWallets,
    getOwnWallet,
    processRefund,
    updateOrderByAdmin,
    downloadOrdersData
} = require('../controllers/checkout.controller');
const guestOrAuthMiddleware = require('../middlewares/guestOrAuthMiddleware');
const checkAccountStatus = require('../middlewares/checkAccountStatus');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');


router.post('/calculate-total', guestOrAuthMiddleware, checkAccountStatus, calculateOrderTotals);
router.post('/process', guestOrAuthMiddleware, checkAccountStatus, placeOrder);
router.post(
    '/wallet/update',
    authMiddleware,
    checkSuperuserOrPermission('Orders', 'Update'),
    adminLogger(),
    updateWalletBalance
  );
router.get('/history', authMiddleware, getUserOrders);
router.get('/order', authMiddleware, checkSuperuserOrPermission('Orders', 'View'), getAllOrders);
router.get('/wallet', authMiddleware, getOwnWallet);
router.get('/orders/download-data', downloadOrdersData);
router.get('/admin/wallets', authMiddleware, checkSuperuserOrPermission('Orders', 'View'), getAllWallets);
// Route for processing refund
router.put(
  '/refund',
  authMiddleware,
  checkSuperuserOrPermission('Orders', 'Update'),
  adminLogger(),
  processRefund
);
router.put('/:orderId/status', authMiddleware, checkSuperuserOrPermission('Orders', 'Update'), adminLogger(), updateOrderStatus);
router.put('/update-payment-method', authMiddleware, updatePaymentMethod);
router.put('/cancel/:orderId', guestOrAuthMiddleware, cancelOrderForCustomer);
router.put('/admin/:orderId', 
  authMiddleware,
  checkSuperuserOrPermission('Orders', 'Update'),
  adminLogger(), 
  updateOrderByAdmin
);
router.put('/:orderId/cancel', authMiddleware, checkSuperuserOrPermission('Orders', 'Cancel'), adminLogger(), cancelOrder);


module.exports = router;