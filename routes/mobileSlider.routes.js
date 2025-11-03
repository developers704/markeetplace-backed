const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const { uploadMobileSliderImages, getMobileSliderImages, deleteMobileSliderImage, updateSortOrder } = require('../controllers/mobileSlider.controller');
const uploadMiddleware = require('../middlewares/imageMiddleware');
const adminLogger = require('../middlewares/adminLogger');


const router = express.Router();

// Route to upload new mobile slider images (superuser or users with 'Create' permission on 'Mobile Slider' page)
router.post('/upload', authMiddleware, checkSuperuserOrPermission('Banners', 'Create'), uploadMiddleware, adminLogger(), uploadMobileSliderImages);

// Route to get all mobile slider images
router.get('/public', getMobileSliderImages);

// Route to get all mobile slider images (with permissions)
router.get('/', authMiddleware, checkSuperuserOrPermission('Banners', 'View'), getMobileSliderImages);

router.patch('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Update'), adminLogger(), updateSortOrder);

// Route to delete a mobile slider image by ID (superuser or users with 'Delete' permission on 'Mobile Slider' page)
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Delete'), adminLogger(), deleteMobileSliderImage);

module.exports = router;
