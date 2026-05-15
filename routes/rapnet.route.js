/**
 * RapNet API Routes
 * Base path registered in indexRoute.js: /api/rapnet
 *
 * GET  /api/rapnet/products        — search diamonds with filters (public with optional auth)
 * GET  /api/rapnet/products/:id    — single diamond detail
 * POST /api/rapnet/order           — place inquiry (auth required)
 * GET  /api/rapnet/orders          — customer's inquiry history (auth required)
 */

const express       = require('express');
const router        = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  getProducts,
  getProductById,
  placeOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAdminOrders,
  updateOrderStatus,
} = require('../controllers/rapnet.controller');

// Diamond search — no auth required
router.get('/products',     getProducts);
router.get('/products/:id', getProductById);

// Customer order routes — auth required
router.post('/order',               authMiddleware, placeOrder);
router.get('/orders',               authMiddleware, getMyOrders);
router.get('/orders/:id',           authMiddleware, getOrderById);
router.patch('/orders/:id/cancel',  authMiddleware, cancelOrder);

// ── Admin routes ─────────────────────────────────────────────────────────────
// GET  /api/rapnet/admin/orders                — list all orders (admin)
// PATCH /api/rapnet/admin/orders/:id/status   — approve / reject / update status
router.get('/admin/orders',              authMiddleware, getAdminOrders);
router.patch('/admin/orders/:id/status', authMiddleware, updateOrderStatus);

module.exports = router;
