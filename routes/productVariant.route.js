const express = require('express');
const router = express.Router();
const {
    createVariantName,
    getAllVariantNames,
    updateVariantName,
    bulkDeleteVariantNames,
    createProductVariant,
    getAllProductVariants,
    updateProductVariant,
    deleteProductVariant,
    bulkDeleteProductVariants
} = require('../controllers/productVariant.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');


// Routes for Variant Names
router.post('/variant-names', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), adminLogger(), createVariantName);
router.get('/variant-names', getAllVariantNames);
router.put('/variant-names/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Update'), adminLogger(), updateVariantName);
router.delete('/variant-names/bulk-delete', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), adminLogger(), bulkDeleteVariantNames); // Bulk delete route for variant names

// Routes for Product Variants
router.post('/product-variants', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), adminLogger(), createProductVariant);
router.get('/product-variants', getAllProductVariants);
router.put('/product-variants/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Update'), adminLogger(), updateProductVariant);
router.delete('/product-variants/bulk-delete', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), adminLogger(), bulkDeleteProductVariants); // Bulk delete route for product variants
router.delete('/product-variants/:id', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), adminLogger(), deleteProductVariant);

module.exports = router;
