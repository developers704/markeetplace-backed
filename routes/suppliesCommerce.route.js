const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { attachRoleContext } = require('../middlewares/b2bRole.middleware');
const {
  getSuppliesCart,
  addSuppliesCartItem,
  updateSuppliesCartItem,
  removeSuppliesCartItem,
  clearSuppliesCart,
  placeSuppliesOrder,
  listMySuppliesOrders,
  getMySuppliesOrder,
  adminListSuppliesOrders,
  adminGetSuppliesOrder,
  adminApproveSuppliesOrder,
  adminRejectSuppliesOrder,
  adminShipSuppliesOrder,
  markSuppliesOrderReceived,
} = require('../controllers/suppliesCommerce.controller');

router.get('/cart', authMiddleware, attachRoleContext, getSuppliesCart);
router.post('/cart/add', authMiddleware, attachRoleContext, addSuppliesCartItem);
router.put('/cart/item/:itemId', authMiddleware, attachRoleContext, updateSuppliesCartItem);
router.delete('/cart/item/:itemId', authMiddleware, attachRoleContext, removeSuppliesCartItem);
router.delete('/cart/clear', authMiddleware, attachRoleContext, clearSuppliesCart);

router.post('/orders/place', authMiddleware, attachRoleContext, placeSuppliesOrder);
router.get('/orders/mine', authMiddleware, attachRoleContext, listMySuppliesOrders);
router.get('/orders/mine/:id', authMiddleware, attachRoleContext, getMySuppliesOrder);

router.get('/orders/admin', authMiddleware, attachRoleContext, adminListSuppliesOrders);
router.get('/orders/admin/:id', authMiddleware, attachRoleContext, adminGetSuppliesOrder);
router.patch('/orders/admin/:id/approve', authMiddleware, attachRoleContext, adminApproveSuppliesOrder);
router.patch('/orders/admin/:id/reject', authMiddleware, attachRoleContext, adminRejectSuppliesOrder);
router.patch('/orders/admin/:id/ship', authMiddleware, attachRoleContext, adminShipSuppliesOrder);
router.patch('/orders/:id/received', authMiddleware, attachRoleContext, markSuppliesOrderReceived);

module.exports = router;
