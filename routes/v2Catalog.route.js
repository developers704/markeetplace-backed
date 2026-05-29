const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const authMiddleware = require('../middlewares/authMiddleware');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');

const { uploadVendorCatalogCSV } = require('../middlewares/bulkVendorCatalogUploadMiddleware');
const { uploadSkuInventoryCSV } = require('../middlewares/bulkSkuInventoryUploadMiddleware');

const {
  importVendorCatalog,
  getVendorImportJobStatus,
  importSkuInventory,
} = require('../controllers/v2CatalogImport.controller');
const {
  listVendorProducts,
  getVendorProductById,
  getSkuById,
  updateVendorProduct,
  deleteSku,
  deleteVendorProduct,
  deleteAllVendorData,
  downloadVendorCatalogTemplate,
  downloadSkuInventoryTemplate,
  exportVendorProductsCsv,
  // Category management
  getV2Categories,
  getV2SubcategoriesByCategory,
  getV2SubSubcategoriesBySubCategory,
  getV2CategoriesWithSubcategories,
  listVendorProductsAdmin,
} = require('../controllers/v2Catalog.controller');

/**
 * v2 Catalog Routes
 *
 * NOTE:
 * - We are NOT replacing the legacy `/api/products` routes yet.
 * - These endpoints implement the Vendor-Model → SKU → SKU Inventory architecture.
 */

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader ? authHeader.replace('Bearer ', '') : '';
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let user = await Customer.findById(decoded.id);
    if (!user) user = await User.findById(decoded.id);
    if (user) {
      user = user.toObject({ getters: true });
      user.selectedWarehouse = decoded.warehouse || null;
      req.user = user;
    }
  } catch (_) {}
  next();
};

// Public/read routes
router.get('/products/admin', listVendorProductsAdmin);
router.get('/products/export', authMiddleware, exportVendorProductsCsv);
router.get('/products', listVendorProducts);
router.get('/products/:id', getVendorProductById);
router.get('/skus/:skuId', getSkuById);

// Category management routes (public)
router.get('/categories', optionalAuthMiddleware, getV2Categories);
router.get('/categories/with-subcategories', optionalAuthMiddleware, getV2CategoriesWithSubcategories);
router.get('/categories/:categoryId/subcategories', optionalAuthMiddleware, getV2SubcategoriesByCategory);
router.get('/subcategories/:subCategoryId/subsubcategories', optionalAuthMiddleware, getV2SubSubcategoriesBySubCategory);

// Template downloads (public)
router.get('/templates/vendor-catalog', downloadVendorCatalogTemplate);
router.get('/templates/sku-inventory', downloadSkuInventoryTemplate);

// Admin/import routes (protected)
router.post('/bulk/vendor-catalog/import', authMiddleware, uploadVendorCatalogCSV, importVendorCatalog);
router.get('/bulk/vendor-catalog/import/jobs/:jobId', authMiddleware, getVendorImportJobStatus);
router.get('/bulk/sku-inventory/import/jobs/:jobId', authMiddleware, getVendorImportJobStatus);
router.post('/bulk/sku-inventory/import', authMiddleware, uploadSkuInventoryCSV, importSkuInventory);

// Admin/CRUD routes (protected)
router.put('/products/:id', authMiddleware, updateVendorProduct);
router.delete('/skus/:skuId', authMiddleware, deleteSku);
router.delete('/products/all', authMiddleware, deleteAllVendorData);
router.delete('/products/:id', authMiddleware, deleteVendorProduct);

module.exports = router;


