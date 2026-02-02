const express = require('express');
const router = express.Router();
const navigationController = require('../controllers/navigation.controller');
const authMiddleware = require('../middlewares/authMiddleware');


router.post('/:courseId/chapters/:chapterId/sections/:sectionId/content/:contentId/progress', authMiddleware, navigationController.updateContentProgress);

// Manual section completion (for sections with no content and no quiz)
router.post('/:courseId/chapters/:chapterId/sections/:sectionId/manual-complete', authMiddleware, navigationController.manualCompleteSection);

router.get("/sidebar", authMiddleware, navigationController.getDashboardSidebar);
router.get("/:courseId/next", authMiddleware, navigationController.getNextContent);


//new Routes:
// get customer statistics:
router.get('/dashboard', authMiddleware, navigationController.getCustomerDashboard);
router.get('/recomended-course', authMiddleware, navigationController.getRecommendedShortCourses)
router.get('/avaliable-course-status', authMiddleware, navigationController.getAvailableCoursesWithStatus) 
module.exports = router;
