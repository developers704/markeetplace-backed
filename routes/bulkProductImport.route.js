const express = require('express');
const router = express.Router();
const { uploadBulkProductCSV } = require('../middlewares/bulkProductUploadMiddleware');
const { importBulkProducts, getCSVTemplate } = require('../controllers/bulkProductImport.controller');
const authMiddleware  = require('../middlewares/authMiddleware');
const { checkSuperuserOrPermission } = require('../middlewares/checkSuperuserOrPermission');

// Apply authentication and permission middleware
router.use(authMiddleware);
// router.use(checkSuperuserOrPermission('product_management'));

// Route to get CSV template
router.get('/template', getCSVTemplate);

// Route to import bulk products from CSV
router.post('/import', uploadBulkProductCSV, importBulkProducts);

module.exports = router;
