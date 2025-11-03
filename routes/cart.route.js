const express = require('express');
const router = express.Router();
const {
  addToCart,
  removeFromCart,
  updateCartItemQuantity,
  getCart,
  applyCoupon,
  clearCart,
  bulkUpdateCartItems,
  generateGuestSession
} = require('../controllers/cart.controller');
const guestOrAuthMiddleware = require('../middlewares/guestOrAuthMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const checkAccountStatus = require('../middlewares/checkAccountStatus');

router.post('/add', guestOrAuthMiddleware, checkAccountStatus,  addToCart);
router.post('/bulk-update', guestOrAuthMiddleware, bulkUpdateCartItems);
router.delete('/clear', guestOrAuthMiddleware, clearCart);
router.delete('/remove/:itemId', guestOrAuthMiddleware, removeFromCart);
router.put('/update/:itemId', guestOrAuthMiddleware, updateCartItemQuantity);
router.get('/', guestOrAuthMiddleware, getCart);
router.get('/generate-session', generateGuestSession);
router.post('/apply-coupon', authMiddleware, applyCoupon);

module.exports = router;
