const express = require('express');
const { getCartAnalytics, getDetailedCartData, getDetailedCartById, getTopPerformingCustomers, getCustomerActivities,  getCustomerBreakdown, getActivitySummary } = require('../controllers/analytics.controller');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission.js');


router.get('/cart', authMiddleware, getCartAnalytics);
router.get('/cartdetailed-data', authMiddleware, getDetailedCartData);
router.get('/cartdetailed-data/:id', authMiddleware, getDetailedCartById);

// Admin apis:
router.post('/top-performing-customers', authMiddleware, checkSuperuserOrPermission, getTopPerformingCustomers);
router.post('/customer-activities', authMiddleware, checkSuperuserOrPermission, getCustomerActivities);
router.get('/summary', authMiddleware, checkSuperuserOrPermission, getActivitySummary);
router.get('/customer-breakdown', authMiddleware, checkSuperuserOrPermission, getCustomerBreakdown);

module.exports = router;
