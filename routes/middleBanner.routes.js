const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const { uploadMiddleBannerImages, getMiddleBannerImages, deleteMiddleBannerImage, updateSortOrder } = require('../controllers/middleBannerImage.controller');
const uploadMiddleware = require('../middlewares/imageMiddleware');
const adminLogger = require('../middlewares/adminLogger');


const router = express.Router();

// Route to upload new middle banner images
router.post('/upload', authMiddleware, checkSuperuserOrPermission('Banners', 'Create'), uploadMiddleware, adminLogger(), uploadMiddleBannerImages);

// Route to get all middle banner images
router.get('/public', getMiddleBannerImages);

// Route to get all middle banner images (with permissions)
router.get('/', authMiddleware, checkSuperuserOrPermission('Banners', 'View'), getMiddleBannerImages);

router.patch('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Update'), adminLogger(), updateSortOrder);

// Route to delete a middle banner image by ID
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Delete'), adminLogger(), deleteMiddleBannerImage);

module.exports = router;
