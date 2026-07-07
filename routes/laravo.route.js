const express = require('express');
const router = express.Router();
const {
  getActiveData,
  getBrandProducts,
  getBrandProductTypeProducts,
  getProductById,
} = require('../controllers/laravo.controller');

router.get('/active-data', getActiveData);
router.get('/brands/:brandId/products/:productId', getProductById);
router.get('/brands/:brandId/products', getBrandProducts);
router.get('/brands/:brandId/product-types/:productTypeId/products', getBrandProductTypeProducts);

module.exports = router;
