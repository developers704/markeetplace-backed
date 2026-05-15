/**
 * RapNet Controller
 * Routes: GET /api/rapnet/products
 *         GET /api/rapnet/products/:id
 *         POST /api/rapnet/order
 */

const rapnetService = require('../services/rapnet.service');
const RapnetOrder   = require('../models/RapnetOrder.model');
const mongoose      = require('mongoose');

// ── Allowed filter keys (whitelist to prevent injection) ──────────────────────
const ALLOWED_FILTERS = new Set([
  'shape', 'caratFrom', 'caratTo', 'color', 'clarity', 'cut',
  'polish', 'symmetry', 'fluorescence', 'lab', 'certificate',
  'priceFrom', 'priceTo', 'location', 'sort', 'page', 'limit',
]);

function sanitizeFilters(query = {}) {
  const filters = {};
  for (const [key, val] of Object.entries(query)) {
    if (!ALLOWED_FILTERS.has(key)) continue;
    const v = String(val ?? '').trim();
    if (!v) continue;
    filters[key] = v;
  }
  return filters;
}

// ── GET /api/rapnet/products ──────────────────────────────────────────────────
const getProducts = async (req, res) => {
  try {
    const filters = sanitizeFilters(req.query);
    const result  = await rapnetService.searchDiamonds(filters);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[RapNet] getProducts error:', err.message);
    const rapnetStatus = err?.statusCode;
    const rapnetBody   = err?.rapnetBody;

    if (rapnetStatus === 401) {
      return res.status(502).json({
        success: false,
        message: 'RapNet authentication failed. Token may be invalid.',
        rapnetError: rapnetBody,
      });
    }
    if (rapnetStatus === 403) {
      return res.status(403).json({
        success: false,
        message: 'RapNet returned 403 Forbidden. Possible causes: (1) Instant Inventory subscription not active, (2) Feed not configured in your RapNet account, (3) API credentials do not have "instantInventory" scope.',
        rapnetError: rapnetBody,
        hint: 'Log in to trade.rapnet.com → Settings → API Access and verify your subscription includes Instant Inventory.',
      });
    }
    if (err.message?.includes('RapNet auth failed') || rapnetStatus === 400) {
      return res.status(502).json({ success: false, message: 'RapNet authentication failed. Check CLIENT_ID and CLIENT_SECRET.', rapnetError: rapnetBody });
    }
    return res.status(500).json({ success: false, message: 'Failed to fetch RapNet products.', error: err.message, rapnetError: rapnetBody });
  }
};

// ── GET /api/rapnet/products/:id ──────────────────────────────────────────────
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.trim()) {
      return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }
    const result = await rapnetService.getDiamondById(id.trim());
    if (!result?.data) {
      return res.status(404).json({ success: false, message: 'Diamond not found on RapNet.' });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[RapNet] getProductById error:', err.message);
    const rs = err?.statusCode;
    if (rs === 403) return res.status(403).json({ success: false, message: 'RapNet 403: Instant Inventory not available.', rapnetError: err?.rapnetBody });
    if (rs === 404) return res.status(404).json({ success: false, message: 'Diamond not found on RapNet.' });
    return res.status(500).json({ success: false, message: 'Failed to fetch diamond details.', error: err.message });
  }
};

// ── POST /api/rapnet/order ────────────────────────────────────────────────────
const placeOrder = async (req, res) => {
  try {
    const {
      rapnetProductId,
      productSnapshot,  // normalized diamond data from frontend
      quantity = 1,
      notes    = '',
    } = req.body ?? {};

    // ── Validate inputs ───────────────────────────────────────────────────────
    if (!rapnetProductId) {
      return res.status(400).json({ success: false, message: 'rapnetProductId is required.' });
    }
    if (!productSnapshot || typeof productSnapshot !== 'object') {
      return res.status(400).json({ success: false, message: 'productSnapshot is required.' });
    }

    const customerId = req.user?._id ?? req.user?.id;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    // ── Create local record first (status = REQUESTED) ────────────────────────
    const order = new RapnetOrder({
      customerId:      new mongoose.Types.ObjectId(String(customerId)),
      rapnetProductId: String(rapnetProductId),
      supplierId:      productSnapshot?.supplierId ?? null,
      productSnapshot,
      shape:    productSnapshot?.shape   ?? null,
      carat:    productSnapshot?.carat   ? Number(productSnapshot.carat)  : null,
      color:    productSnapshot?.color   ?? null,
      clarity:  productSnapshot?.clarity ?? null,
      lab:      productSnapshot?.lab     ?? null,
      price:    productSnapshot?.price   ? Number(productSnapshot.price)  : null,
      quantity: Math.max(1, Number(quantity)),
      notes:    String(notes).trim(),
      status:   'REQUESTED',
    });

    await order.save();

    // ── Submit to RapNet ──────────────────────────────────────────────────────
    let rapnetResponse = null;
    let rapnetOrderRef = null;
    let finalStatus    = 'SUBMITTED_TO_RAPNET';

    try {
      rapnetResponse = await rapnetService.submitOrder({
        rapnetId:  rapnetProductId,
        quantity:  order.quantity,
        notes:     order.notes,
        buyerInfo: {
          customerId: String(customerId),
        },
      });
      rapnetOrderRef = rapnetResponse?.order_id
        ?? rapnetResponse?.id
        ?? rapnetResponse?.reference
        ?? null;
    } catch (rapnetErr) {
      console.error('[RapNet] submitOrder to RapNet failed:', rapnetErr.message);
      // Update record to reflect failure but don't delete — keep for retry/audit
      order.rapnetResponse = { error: rapnetErr.message };
      order.status         = 'REQUESTED';
      await order.save();
      return res.status(502).json({
        success:  false,
        message:  'Order saved locally but failed to submit to RapNet. Will retry.',
        orderId:  order._id,
        error:    rapnetErr.message,
      });
    }

    // ── Save final state ──────────────────────────────────────────────────────
    order.rapnetResponse = rapnetResponse;
    order.rapnetOrderRef = rapnetOrderRef;
    order.status         = finalStatus;
    await order.save();

    return res.status(201).json({
      success:       true,
      message:       'Order submitted to RapNet successfully.',
      orderId:       order._id,
      rapnetOrderRef,
      status:        order.status,
    });
  } catch (err) {
    console.error('[RapNet] placeOrder error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to place order.', error: err.message });
  }
};

// ── GET /api/rapnet/orders (customer's own orders) ────────────────────────────
const getMyOrders = async (req, res) => {
  try {
    const customerId = req.user?._id ?? req.user?.id;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      RapnetOrder.find({ customerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RapnetOrder.countDocuments({ customerId }),
    ]);

    return res.status(200).json({
      success: true,
      data:    orders,
      paginatorInfo: {
        total, page, limit,
        totalPages:  Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[RapNet] getMyOrders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: err.message });
  }
};

// ── GET /api/rapnet/orders/:id ────────────────────────────────────────────────
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user?._id ?? req.user?.id;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id.' });
    }
    const order = await RapnetOrder.findOne({ _id: id, customerId }).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    return res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error('[RapNet] getOrderById error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch order.', error: err.message });
  }
};

// ── PATCH /api/rapnet/orders/:id/cancel ───────────────────────────────────────
const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user?._id ?? req.user?.id;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id.' });
    }
    const order = await RapnetOrder.findOne({ _id: id, customerId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (['CONFIRMED', 'CANCELLED'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled — current status: ${order.status}`,
      });
    }
    order.status = 'CANCELLED';
    await order.save();
    return res.status(200).json({ success: true, message: 'Order cancelled.', data: order });
  } catch (err) {
    console.error('[RapNet] cancelOrder error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to cancel order.', error: err.message });
  }
};

// ── GET /api/rapnet/admin/orders ──────────────────────────────────────────────
const getAdminOrders = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const skip   = (page - 1) * limit;
    const status = req.query.status;
    const search = String(req.query.search || '').trim();

    const match = {};
    if (status && ['REQUESTED','SUBMITTED_TO_RAPNET','CONFIRMED','REJECTED','CANCELLED'].includes(status)) {
      match.status = status;
    }
    if (search) {
      if (mongoose.isValidObjectId(search)) {
        match.$or = [
          { _id: new mongoose.Types.ObjectId(search) },
          { customerId: new mongoose.Types.ObjectId(search) },
          { rapnetProductId: search },
        ];
      } else {
        match.$or = [
          { rapnetProductId: { $regex: search, $options: 'i' } },
          { rapnetOrderRef:  { $regex: search, $options: 'i' } },
          { 'productSnapshot.title':             { $regex: search, $options: 'i' } },
          { 'productSnapshot.certificateNumber': { $regex: search, $options: 'i' } },
          { 'productSnapshot.lotNum':            { $regex: search, $options: 'i' } },
        ];
      }
    }

    const [orders, total] = await Promise.all([
      RapnetOrder.find(match)
        .populate('customerId', 'username email phone_number')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RapnetOrder.countDocuments(match),
    ]);

    return res.status(200).json({
      success: true,
      data:    orders,
      paginatorInfo: {
        total, page, limit,
        totalPages:  Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[RapNet] getAdminOrders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: err.message });
  }
};

// ── PATCH /api/rapnet/admin/orders/:id/status ─────────────────────────────────
const updateOrderStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const { status, adminNote } = req.body ?? {};

    const VALID = ['SUBMITTED_TO_RAPNET', 'CONFIRMED', 'REJECTED', 'CANCELLED'];
    if (!VALID.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${VALID.join(', ')}`,
      });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id.' });
    }

    const order = await RapnetOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (order.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot update a cancelled order.' });
    }

    const prevStatus   = order.status;
    order.status       = status;
    if (adminNote)     order.adminNote = String(adminNote).trim();
    if (status === 'CONFIRMED') order.confirmedAt = new Date();
    if (status === 'REJECTED')  order.rejectedAt  = new Date();

    await order.save();

    return res.status(200).json({
      success: true,
      message: `Order status updated: ${prevStatus} → ${status}`,
      data:    { _id: order._id, status: order.status },
    });
  } catch (err) {
    console.error('[RapNet] updateOrderStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update order.', error: err.message });
  }
};

module.exports = { getProducts, getProductById, placeOrder, getMyOrders, getOrderById, cancelOrder, getAdminOrders, updateOrderStatus };
