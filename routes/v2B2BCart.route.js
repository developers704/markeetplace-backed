const express = require('express');
const router = express.Router();
const {
  getB2BCart,
  addToB2BCart,
  updateB2BCartItem,
  removeFromB2BCart,
  clearB2BCart,
} = require('../controllers/v2B2BCart.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const {   attachRoleContext, requireRoles, } = require('../middlewares/b2bRole.middleware');

// All B2B cart routes require authentication and B2B role check
router.get('/', authMiddleware, attachRoleContext, getB2BCart );
router.post('/add', authMiddleware, attachRoleContext, addToB2BCart);
router.put('/update/:itemId', authMiddleware, attachRoleContext, updateB2BCartItem);
router.delete('/remove/:itemId', authMiddleware, attachRoleContext, removeFromB2BCart);
router.delete('/clear', authMiddleware, attachRoleContext, clearB2BCart);

module.exports = router;