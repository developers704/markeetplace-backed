const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');

const { uploadVendorCatalogCSV } = require('../middlewares/bulkVendorCatalogUploadMiddleware');
const { uploadSkuInventoryCSV } = require('../middlewares/bulkSkuInventoryUploadMiddleware');

const { importVendorCatalog, importSkuInventory } = require('../controllers/v2CatalogImport.controller');
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
} = require('../controllers/v2Catalog.controller');

/**
 * v2 Catalog Routes
 *
 * NOTE:
 * - We are NOT replacing the legacy `/api/products` routes yet.
 * - These endpoints implement the Vendor-Model → SKU → SKU Inventory architecture.
 */

// Public/read routes
router.get('/products', listVendorProducts);
router.get('/products/:id', getVendorProductById);
router.get('/skus/:skuId', getSkuById);

// Template downloads (public)
router.get('/templates/vendor-catalog', downloadVendorCatalogTemplate);
router.get('/templates/sku-inventory', downloadSkuInventoryTemplate);

// Admin/import routes (protected)
router.post('/bulk/vendor-catalog/import', authMiddleware, uploadVendorCatalogCSV, importVendorCatalog);
router.post('/bulk/sku-inventory/import', authMiddleware, uploadSkuInventoryCSV, importSkuInventory);

// Admin/CRUD routes (protected)
router.put('/products/:id', authMiddleware, updateVendorProduct);
router.delete('/skus/:skuId', authMiddleware, deleteSku);
router.delete('/products/:id', authMiddleware, deleteVendorProduct);
router.delete('/products/all', authMiddleware, deleteAllVendorData);

module.exports = router;


