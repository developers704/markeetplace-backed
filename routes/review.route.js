const express = require('express');
const router = express.Router();
const { createReview, getProductReviews, updateReview, deleteReview, deleteReviewByAdmin, voteReview, getReviewSummary, getUserReviews, respondToReview, getTopProductReviews, getAllReviews, bulkDeleteReviews, updateReviewByAdmin, approveReview } = require('../controllers/review.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const uploadReviewImagesMiddleware = require('../middlewares/uploadReviewImages');
const adminLogger = require('../middlewares/adminLogger');



// Static routes first
router.post('/', authMiddleware, uploadReviewImagesMiddleware, createReview);
router.get('/top-reviews', getTopProductReviews);
router.get('/user', authMiddleware, getUserReviews);
router.get('/admin/all-reviews', authMiddleware, checkSuperuserOrPermission('Reviews', 'View'), getAllReviews);
router.delete('/admin/bulk-delete', authMiddleware, checkSuperuserOrPermission('Reviews', 'Delete'), adminLogger(), bulkDeleteReviews);

// Dynamic routes with parameters after
router.get('/product/:productId', getProductReviews);
router.get('/summary/:productId', getReviewSummary);

// Admin approve/reject review route
router.put('/admin/approve/:id', authMiddleware, checkSuperuserOrPermission('Reviews', 'Update'), adminLogger(), approveReview);

// Admin delete single review route
router.delete('/admin/:id', authMiddleware, checkSuperuserOrPermission('Reviews', 'Delete'), adminLogger(), deleteReviewByAdmin);

// Admin update route (make sure image middleware is here)
router.put('/admin/update/:id', authMiddleware, checkSuperuserOrPermission('Reviews', 'Update'), adminLogger(), uploadReviewImagesMiddleware, updateReviewByAdmin);

// Regular update route
router.put('/:id', authMiddleware, uploadReviewImagesMiddleware, updateReview);

// Regular delete route (user can only delete their own reviews)
router.delete('/:id', authMiddleware, deleteReview);
router.post('/:id/vote', authMiddleware, voteReview);
router.post('/:reviewId/respond', authMiddleware, checkSuperuserOrPermission('Reviews', 'Create'), respondToReview);





module.exports = router;
