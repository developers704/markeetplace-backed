const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } = require('../controllers/notification.controller');

router.get('/', authMiddleware, getNotifications);
router.put('/mark-all-read', authMiddleware, markAllNotificationsAsRead);
router.put('/:id/read', authMiddleware, markNotificationAsRead);

module.exports = router;
