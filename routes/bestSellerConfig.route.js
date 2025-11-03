const express = require('express');
const router = express.Router();
const { getBestSellerConfig, updateBestSellerConfig } = require('../controllers/bestSellerConfig.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');

router.get('/', getBestSellerConfig);
router.put('/', authMiddleware, checkSuperuserOrPermission('Best Seller', 'Update'), adminLogger(), updateBestSellerConfig);

module.exports = router;
