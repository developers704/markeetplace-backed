const express = require('express');
const router = express.Router();
const {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon
} = require('../controllers/coupon.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');

router.post('/', authMiddleware, checkSuperuserOrPermission('Coupons', 'Create'), adminLogger(), createCoupon);
router.get('/', authMiddleware, checkSuperuserOrPermission('Coupons', 'View'), getAllCoupons);
router.get('/:id', authMiddleware, checkSuperuserOrPermission('Coupons', 'View'), getCouponById);
router.put('/:id', authMiddleware, checkSuperuserOrPermission('Coupons', 'Update'), adminLogger(), updateCoupon);
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Coupons', 'Delete'), adminLogger(), deleteCoupon);

module.exports = router;
