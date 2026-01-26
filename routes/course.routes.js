const express = require('express');
const router = express.Router();
const controller = require('../controllers/course.controller');
const authMiddleware = require('../middlewares/authMiddleware.js');
const handleUpload = require('../config/courseMulter');
const handleQuillImageUpload = require('../config/quillImageMulter');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');

// React Quill image upload endpoint
router.post('/upload-quill-image', [authMiddleware, handleQuillImageUpload], controller.uploadQuillImage);

router.post('/', [authMiddleware, handleUpload], controller.createCourse);
// Toggle like/dislike content
router.post("/:courseId/chapters/:chapterId/sections/:sectionId/content/:contentId/toggle-reaction", authMiddleware, controller.toggleContentReaction);

router.post('/:courseId/videos/:videoId/rate',controller.updateVideoLikeDislike)
router.post('/history/:courseId', [authMiddleware], controller.getUserCourseHistory);

router.get('/simplified', controller.getAllCoursesSimplified)
// new route:
router.get('/customer-courses', authMiddleware, controller.getCustomerCourses);
// new route by course id to get chapters:
router.get('/:courseId/chapters', authMiddleware, controller.getCourseChaptersAndSections);
// new route by section id to get section details:
router.get('/:courseId/section/:sectionId', authMiddleware, controller.getSectionDetails)

router.get('/course-by-customer', authMiddleware, controller.getAssignedCourses);
router.get('/',controller.getAllCourses);
router.get('/searchCourse', controller.searchCourses)
router.get('/progress', authMiddleware, controller.getUserCourseProgress);
router.get('/available', controller.getAvailableCoursesForUser);
router.get('/:id',controller.getCourseById);
router.get('/:id/details', [authMiddleware], controller.getCourseDetails);
router.get('/user/recent-watches', [authMiddleware, checkSuperuserOrPermission('courses', 'View')], controller.getRecentWatches);
router.get('/:courseId/videos/:videoId', [authMiddleware, checkSuperuserOrPermission('courses', 'View')], controller.getVideoWithProgress);
router.put('/:id', [authMiddleware,  handleUpload], controller.updateCourse);
router.put('/:courseId/videos/:videoId/progress', [authMiddleware, checkSuperuserOrPermission('courses', 'Update')], controller.updateWatchProgress);
router.delete('/bulk-delete', [authMiddleware, checkSuperuserOrPermission('courses', 'Delete')], controller.bulkDeleteCourses);


// course details:


module.exports = router