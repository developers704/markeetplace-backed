const express = require('express');
const router = express.Router();
const notificationCenterController = require('../controllers/notificationCenter.controller');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/send-notifications', authMiddleware,notificationCenterController.sendNotifications);
router.get('/:roleId', authMiddleware,notificationCenterController.getCustomersByRole);

module.exports = router;