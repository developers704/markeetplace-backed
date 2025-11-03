const express = require('express');
const router = express.Router();
const {
    bulkUploadImages,
    getAllImages,
    bulkDeleteImages,
    updateImage,
    syncProductImages
} = require('../controllers/productImage.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');

router.post('/bulk-upload', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), bulkUploadImages);
router.get('/', getAllImages);
router.delete('/bulk-delete', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), bulkDeleteImages);
router.put('/sync-images', syncProductImages );
router.put('/:sku', authMiddleware, checkSuperuserOrPermission('Products', 'Update'), updateImage);

module.exports = router;
