const express = require('express');
const router = express.Router();
const {
    createProduct,
    bulkUploadProducts,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProducts,
    createSampleCsvTemplate,
    getPublicProducts,
    updateProductLifecycle,
    getFilteredProducts,
    getSidebarFilters,
    getLandingPageData,
    getProductFiltersAndProducts,
    getNewArrivalProducts,
    getBestSellerProducts,
    getShopByPetProducts,
    downloadProductsData,
    bulkUpdateProducts,
    getProductsByCategory,
    getProductsByCategoryId,
    searchProducts,
    getNewProducts,
    getAllProductsForSearch
} = require('../controllers/product.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });
const adminLogger = require('../middlewares/adminLogger');


router.post('/', authMiddleware, uploadMiddleware, adminLogger(), createProduct);
router.post('/bulk-delete', authMiddleware,deleteProducts);
router.get('/sample-csv', authMiddleware, createSampleCsvTemplate);
router.get('/search', authMiddleware,searchProducts);
router.get('/search-all', authMiddleware,getAllProductsForSearch);
router.get('/new-products', authMiddleware,getNewProducts);
router.get('/filters', authMiddleware, getProductFiltersAndProducts)
router.post('/bulk-upload', authMiddleware, bulkUploadProducts);
router.post('/filter', getFilteredProducts);
router.get("/category/:categoryId/subcategory/:subCategoryId?", getProductsByCategory)
router.get('/', authMiddleware,getAllProducts);
router.get('/public', getPublicProducts);
router.get('/new-arrival', getNewArrivalProducts);
router.get('/best-seller', getBestSellerProducts);
router.get('/shop-by-pets', getShopByPetProducts);
router.get('/download-data', downloadProductsData);
router.get('/sidebar-filters', getSidebarFilters);
router.get('/filter', getFilteredProducts);
router.get('/landing-page', getLandingPageData);
router.get('/:id', getProductById);
router.get('/category/:categoryId', getProductsByCategoryId);
router.put('/bulk-update', authMiddleware, bulkUpdateProducts);
router.put('/:id', authMiddleware, uploadMiddleware, adminLogger(), updateProduct);
router.patch('/:id/lifecycle', authMiddleware, adminLogger(), updateProductLifecycle);



module.exports = router;
