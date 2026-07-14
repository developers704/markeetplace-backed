const express = require('express');
const router = express.Router();
const {
  getActiveData,
  getBrandProducts,
  getBrandProductTypeProducts,
  getProductById,
} = require('../controllers/laravo.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  placeOrder,
  getMyOrders,
  getOrderById,
  getAdminOrders,
  getAdminOrderById,
  exportAdminOvaniOrdersCsv,
  updateOrderStatus,
  markOrderReceived,
} = require('../controllers/ovaniCustomOrder.controller');

router.get('/active-data', getActiveData);
router.get('/brands/:brandId/products/:productId', getProductById);
router.get('/brands/:brandId/products', getBrandProducts);
router.get('/brands/:brandId/product-types/:productTypeId/products', getBrandProductTypeProducts);

router.post('/orders', authMiddleware, placeOrder);
router.get('/orders', authMiddleware, getMyOrders);
router.get('/admin/orders/export/csv', authMiddleware, exportAdminOvaniOrdersCsv);
router.get('/admin/orders', authMiddleware, getAdminOrders);
router.get('/admin/orders/:id', authMiddleware, getAdminOrderById);
router.patch('/admin/orders/:id/status', authMiddleware, updateOrderStatus);
router.patch('/orders/:id/received', authMiddleware, markOrderReceived);
router.get('/orders/:id', authMiddleware, getOrderById);

module.exports = router;
