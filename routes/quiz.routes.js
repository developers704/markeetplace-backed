const controller = require('../controllers/quiz.controller.js');
const express = require('express');
const router = express.Router()
const authMiddleware = require('../middlewares/authMiddleware.js')


router.post('/create', authMiddleware, controller.createQuiz);
router.post('/start/:quizId', authMiddleware, controller.startQuizAttempt);
router.post('/:quizId/submit', authMiddleware, controller.submitQuizAttempt);
router.get('/', authMiddleware, controller.getAllQuizzes);
router.get('/:courseId', authMiddleware, controller.getQuizzesByCourse);
router.get('/:courseId/grades', authMiddleware, controller.getCourseGrades);
router.get('/logged-user', authMiddleware, controller.getUserCoursesProgress);
router.get('/by-quizID/:quizId', authMiddleware, controller.getQuizById);
router.put('/:quizId', authMiddleware, controller.updateQuiz);
router.delete('/bulk', authMiddleware, controller.bulkDeleteQuizzes );


module.exports = router;
