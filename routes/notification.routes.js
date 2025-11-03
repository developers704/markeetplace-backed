const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { getNotifications, markNotificationAsRead } = require('../controllers/notification.controller');

router.get('/', authMiddleware, getNotifications);
router.put('/:id/read', authMiddleware, markNotificationAsRead);

module.exports = router;
