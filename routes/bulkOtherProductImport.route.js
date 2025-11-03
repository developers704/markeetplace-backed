const express = require('express');
const router = express.Router();
const { uploadBulkOtherProductCSV } = require('../middlewares/bulkOtherProductUploadMiddleware');
const { importBulkOtherProducts, getCSVTemplate } = require('../controllers/bulkOtherProductImport.controller');
const authMiddleware  = require('../middlewares/authMiddleware');
const { checkSuperuserOrPermission } = require('../middlewares/checkSuperuserOrPermission');

// Apply authentication and permission middleware
router.use(authMiddleware);
// router.use(checkSuperuserOrPermission('product_management'));

// Route to get CSV template
router.get('/template', getCSVTemplate);

// Route to import bulk other products from CSV
router.post('/import', uploadBulkOtherProductCSV, importBulkOtherProducts);

module.exports = router;
