const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const { uploadLoyaltyBannerImages, getLoyaltyBannerImages, deleteLoyaltyBannerImage, updateSortOrder } = require('../controllers/loyaltyBannerImage.controller');
const uploadMiddleware = require('../middlewares/imageMiddleware');
const adminLogger = require('../middlewares/adminLogger');


const router = express.Router();

// Route to upload new loyalty banner images
router.post('/upload', authMiddleware, checkSuperuserOrPermission('Banners', 'Create'), uploadMiddleware, adminLogger(), uploadLoyaltyBannerImages);

// Route to get all loyalty banner images
router.get('/public', getLoyaltyBannerImages);

// Route to get all loyalty banner images (with permissions)
router.get('/', authMiddleware, checkSuperuserOrPermission('Banners', 'View'), getLoyaltyBannerImages);

router.patch('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Update'), adminLogger(), updateSortOrder);

// Route to delete a loyalty banner image by ID
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Banners', 'Delete'), adminLogger(), deleteLoyaltyBannerImage);

module.exports = router;
