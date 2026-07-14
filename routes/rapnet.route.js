/**
 * RapNet API Routes
 * Base path registered in indexRoute.js: /api/rapnet
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  getProducts,
  getProductById,
  placeOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  markOrderReceived,
  getAdminOrders,
  exportAdminRapnetOrdersCsv,
  updateOrderStatus,
} = require('../controllers/rapnet.controller');

// Diamond search — no auth required
router.get('/products', getProducts);
router.get('/products/:id', getProductById);

// Customer order routes — auth required
router.post('/order', authMiddleware, placeOrder);
router.get('/orders', authMiddleware, getMyOrders);
router.get('/orders/:id', authMiddleware, getOrderById);
router.patch('/orders/:id/cancel', authMiddleware, cancelOrder);
router.patch('/orders/:id/received', authMiddleware, markOrderReceived);

// Admin routes
router.get('/admin/orders/export/csv', authMiddleware, exportAdminRapnetOrdersCsv);
router.get('/admin/orders', authMiddleware, getAdminOrders);
router.patch('/admin/orders/:id/status', authMiddleware, updateOrderStatus);

module.exports = router;
