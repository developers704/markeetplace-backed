const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const { uploadMobileMiddleBannerImages, getMobileMiddleBannerImages, deleteMobileMiddleBannerImage, updateSortOrder } = require('../controllers/mobileMiddleBannerImage.controller');
const uploadMiddleware = require('../middlewares/imageMiddleware');
const adminLogger = require('../middlewares/adminLogger');

const router = express.Router();

router.post('/upload', authMiddleware, checkSuperuserOrPermission('Banners', 'Create'), uploadMiddleware, adminLogger(), uploadMobileMiddleBannerImages);

router.get('/public', getMobileMiddleBannerImages);

router.get('/', authMiddleware, checkSuperuserOrPermission('Banners', 'View'), getMobileMiddleBannerImages);

router.patch('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Update'), adminLogger(), updateSortOrder);

router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Delete'), adminLogger(), deleteMobileMiddleBannerImage);

module.exports = router;
