const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const { uploadBannerImages, getBannerImages, deleteBannerImage, updateSortOrder } = require('../controllers/bannerImage.controller');
const uploadMiddleware = require('../middlewares/imageMiddleware');
const adminLogger = require('../middlewares/adminLogger');

const router = express.Router();

// Route to upload new slideshow banner images (superuser or users with 'Create' permission on 'Banner Slider' page)
router.post('/upload', authMiddleware, checkSuperuserOrPermission('Banners', 'Create'), uploadMiddleware, adminLogger(), uploadBannerImages);

// Route to get all banner images
router.get('/public', getBannerImages);

// Route to get all banner images (with permissions)
router.get('/', authMiddleware, checkSuperuserOrPermission('Banners', 'View'), getBannerImages);

router.patch('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Update'), adminLogger(), updateSortOrder);

// Route to delete a banner image by ID (superuser or users with 'Delete' permission on 'Banner Slider' page)
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Delete'), adminLogger(), deleteBannerImage);

module.exports = router;
