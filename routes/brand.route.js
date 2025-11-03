const express = require('express');
const router = express.Router();
const {
  createBrand,
  getAllBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  bulkDeleteBrands,
  bulkUploadBrands,
  downloadBrandsCsvTemplate,
  getBrandsSorted,
  downloadBrandsData
} = require('../controllers/brand.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const uploadOneImage = require('../middlewares/uploadOneImage');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });
const adminLogger = require('../middlewares/adminLogger');


// Create a new brand (admin/superuser only)
router.post('/', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), uploadOneImage, adminLogger(), createBrand);

router.get('/download-brand-template', downloadBrandsCsvTemplate); //can be use for city and tags
router.get('/download-data', downloadBrandsData);

router.post('/bulk-upload', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), upload.single('file'), bulkUploadBrands);

// Get all brands
router.get('/', getAllBrands);

router.get('/sorted', getBrandsSorted);


// Get a brand by ID
router.get('/:id', getBrandById);

// Update a brand (admin/superuser only)
router.put('/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Update'), uploadOneImage, adminLogger(), updateBrand);

router.delete('/bulk-delete', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), adminLogger(), bulkDeleteBrands);

// Delete a brand (admin/superuser only)
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), adminLogger(), deleteBrand);

module.exports = router;
