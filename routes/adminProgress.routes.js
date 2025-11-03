const express = require('express');
const router = express.Router();
const adminController = require('../controllers/course.controller');
const authMiddleware = require('../middlewares/authMiddleware');
// const adminMiddleware = require('../middleware/admin.middleware'); // Create this if needed

// 🆕 ADMIN PROGRESS TRACKING ROUTES
router.get('/progress', authMiddleware, adminController.getAllUsersProgress);
router.get('/users/:userId/progress', authMiddleware, adminController.getUserProgressById);
router.get('/courses/:courseId/users-progress', authMiddleware, adminController.getCourseUsersProgress);
router.get('/dashboard/summary', authMiddleware, adminController.getDashboardSummary);

module.exports = router;
