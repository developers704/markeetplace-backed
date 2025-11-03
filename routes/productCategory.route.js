const express = require('express');
const {
    createCategory,
    createSubcategory,
    getAllCategories,
    getAllSubcategories,
    updateCategory,
    updateSubcategory,
    deleteCategory,
    deleteSubcategory,
    getCategoriesWithSubcategories,
    toggleCategoryVisibility,
    deleteCategoriesBulk,
    deleteSubcategoriesBulk,
    bulkUploadCategories,
    bulkUploadSubCategories,
    downloadCategoriesCsvTemplate,
    downloadSubCategoriesCsvTemplate,
    getPublicCategories,
    createSubSubCategory,
    deleteSubSubCategoriesBulk,
    getAllSubSubCategories,
    getSubcategoriesByCategoryId,
    updateSubSubCategory,
    bulkUploadSubSubCategories,
    downloadSubSubCategoriesTemplate,
    getSubSubCategoriesBySubCategoryId
} = require('../controllers/productCategory.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const uploadSingleImage = require('../middlewares/uploadOneImage');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });


const router = express.Router();

router.post('/category', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), uploadSingleImage, createCategory);
router.get('/download-categories-template', downloadCategoriesCsvTemplate);
router.post('/cat/bulk-upload', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), upload.single('file'), bulkUploadCategories);
router.post('/subcategory', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), uploadSingleImage, createSubcategory);
router.get('/download-subcategories-template', downloadSubCategoriesCsvTemplate);
router.get('/download-subsubcategories-template', downloadSubSubCategoriesTemplate);
router.post('/sub/bulk-upload', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), upload.single('file'), bulkUploadSubCategories);
router.post('/subsub/bulk-upload', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), upload.single('file'), bulkUploadSubSubCategories);
router.post('/subsubcategory', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), uploadSingleImage, createSubSubCategory);
router.get('/category', getAllCategories);
router.get('/cat/public', getPublicCategories);
router.get('/subcategory', getAllSubcategories);
router.get('/subsubcategory', getAllSubSubCategories);
router.get('/with-subcategories', getCategoriesWithSubcategories);
router.get('/subcategories/:categoryId', getSubcategoriesByCategoryId);
router.get('/subsubcategories/:subCategoryId', getSubSubCategoriesBySubCategoryId);
router.put('/category/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Update'), uploadSingleImage, updateCategory);
router.put('/subcategory/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Update'), uploadSingleImage, updateSubcategory);
router.put('/subsubcategory/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Update'), uploadSingleImage, updateSubSubCategory);

router.patch('/category/:id/toggle-visibility', authMiddleware, checkSuperuserOrPermission('Products', 'Update'), toggleCategoryVisibility);
router.delete('/categories', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), deleteCategoriesBulk);
router.delete('/subcategories', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), deleteSubcategoriesBulk);
router.delete('/subsubcategories', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), deleteSubSubCategoriesBulk);
router.delete('/category/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), deleteCategory);
router.delete('/subcategory/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), deleteSubcategory);

module.exports = router;
