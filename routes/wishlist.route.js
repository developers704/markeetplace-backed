const express = require('express');
const router = express.Router();
const {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  clearWishlist,
  toggleWishlistProduct
} = require('../controllers/wishlist.controller');
const authMiddleware = require("../middlewares/authMiddleware");

router.post('/', authMiddleware,addToWishlist);
router.post('/toggle', toggleWishlistProduct);
router.delete('/clear', authMiddleware,clearWishlist);
router.delete('/:productId/:productType', authMiddleware,removeFromWishlist);
router.get('/', getWishlist);




module.exports = router;


