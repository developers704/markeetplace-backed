const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { getAdminNotifications, bulkDeleteAdminNotifications, markNotificationAsRead, bulkMarkAsRead } = require('../controllers/adminNotification.controller');

router.get('/', authMiddleware, getAdminNotifications);
router.patch('/bulk-mark-read', authMiddleware, bulkMarkAsRead);
router.patch('/notifications/:notificationId/read', authMiddleware, markNotificationAsRead);
router.delete('/bulk', authMiddleware, bulkDeleteAdminNotifications);


module.exports = router;
