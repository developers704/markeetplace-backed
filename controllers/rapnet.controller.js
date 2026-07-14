/**
 * RapNet Controller
 * Routes: GET /api/rapnet/products
 *         GET /api/rapnet/products/:id
 *         POST /api/rapnet/order
 *         GET/PATCH customer + admin order endpoints
 */

const { Parser } = require('json2csv');
const rapnetService = require('../services/rapnet.service');
const RapnetOrder = require('../models/RapnetOrder.model');
const Customer = require('../models/customer.model');
const Warehouse = require('../models/warehouse.model');
const mongoose = require('mongoose');
const {
  sendRapnetOrderCreatedEmails,
  sendRapnetOrderStatusEmails,
} = require('../utils/rapnetOrderEmail');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

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

function applyCreatedAtRangeFilter(filter, query = {}) {
  const startDate = String(query.startDate || '').trim();
  const endDate = String(query.endDate || '').trim();
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00.000`);
    if (!Number.isNaN(start.getTime())) {
      filter.createdAt = { ...(filter.createdAt || {}), $gte: start };
    }
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`);
    if (!Number.isNaN(end.getTime())) {
      filter.createdAt = { ...(filter.createdAt || {}), $lte: end };
    }
  }
  return filter;
}

function parseWarehouseIds(warehouseId) {
  const raw = Array.isArray(warehouseId)
    ? warehouseId
    : String(warehouseId || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  return raw.filter(isObjectId).map((id) => new mongoose.Types.ObjectId(String(id)));
}

function buildAdminRapnetOrdersFilter(req) {
  const status = req.query.status;
  const search = String(req.query.search || '').trim();
  const warehouseIds = parseWarehouseIds(req.query.warehouseId);

  const match = {};
  if (status === 'SUBMITTED') {
    match.status = { $in: ['SUBMITTED', 'REQUESTED', 'SUBMITTED_TO_RAPNET'] };
  } else if (status === 'REJECTED') {
    match.status = { $in: ['REJECTED', 'CANCELLED'] };
  } else if (status === 'CONFIRMED') {
    match.status = 'CONFIRMED';
  } else if (status === 'SHIPPED') {
    match.status = 'SHIPPED';
  } else if (status === 'RECEIVED') {
    match.status = 'RECEIVED';
  }

  if (warehouseIds.length === 1) {
    match.storeId = warehouseIds[0];
  } else if (warehouseIds.length > 1) {
    match.storeId = { $in: warehouseIds };
  }

  if (search) {
    if (isObjectId(search)) {
      match.$or = [
        { _id: new mongoose.Types.ObjectId(search) },
        { customerId: new mongoose.Types.ObjectId(search) },
        { rapnetProductId: search },
      ];
    } else {
      match.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { rapnetProductId: { $regex: search, $options: 'i' } },
        { rapnetOrderRef: { $regex: search, $options: 'i' } },
        { shape: { $regex: search, $options: 'i' } },
        { color: { $regex: search, $options: 'i' } },
        { clarity: { $regex: search, $options: 'i' } },
        { lab: { $regex: search, $options: 'i' } },
        { 'productSnapshot.title': { $regex: search, $options: 'i' } },
        { 'productSnapshot.certificateNumber': { $regex: search, $options: 'i' } },
        { 'productSnapshot.lotNum': { $regex: search, $options: 'i' } },
      ];
    }
  }

  applyCreatedAtRangeFilter(match, req.query);
  return match;
}

function resolveRapnetSort(sortBy = 'date_desc') {
  switch (String(sortBy || '').trim()) {
    case 'date_asc':
      return { createdAt: 1 };
    case 'product_asc':
      return { shape: 1, carat: 1, createdAt: -1 };
    case 'product_desc':
      return { shape: -1, carat: -1, createdAt: -1 };
    case 'store_asc':
      return { _storeName: 1, createdAt: -1 };
    case 'store_desc':
      return { _storeName: -1, createdAt: -1 };
    case 'price_asc':
      return { price: 1, createdAt: -1 };
    case 'price_desc':
      return { price: -1, createdAt: -1 };
    default:
      return { createdAt: -1 };
  }
}

function needsStoreNameSort(sortBy) {
  return sortBy === 'store_asc' || sortBy === 'store_desc';
}

async function queryAdminRapnetOrders({ filter, sortBy, skip = 0, limit = 30 }) {
  const sort = resolveRapnetSort(sortBy);
  if (needsStoreNameSort(sortBy)) {
    const [rows, total] = await Promise.all([
      RapnetOrder.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'warehouses',
            localField: 'storeId',
            foreignField: '_id',
            as: '_store',
          },
        },
        {
          $addFields: {
            _storeName: { $ifNull: [{ $arrayElemAt: ['$_store.name', 0] }, ''] },
          },
        },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'customers',
            localField: 'customerId',
            foreignField: '_id',
            as: '_customer',
          },
        },
        {
          $addFields: {
            customerId: { $arrayElemAt: ['$_customer', 0] },
            storeId: { $arrayElemAt: ['$_store', 0] },
          },
        },
        { $project: { _store: 0, _customer: 0 } },
      ]),
      RapnetOrder.countDocuments(filter),
    ]);
    return { orders: rows, total };
  }

  const [orders, total] = await Promise.all([
    RapnetOrder.find(filter)
      .populate('customerId', 'username email phone_number')
      .populate('storeId', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    RapnetOrder.countDocuments(filter),
  ]);
  return { orders, total };
}

const CSV_FIELDS = [
  'Ticket Number',
  'Created At',
  'Status',
  'Store',
  'Customer',
  'Customer Email',
  'Diamond',
  'Shape',
  'Carat',
  'Color',
  'Clarity',
  'Lab',
  'Certificate',
  'RapNet ID',
  'Supplier Ref',
  'Quantity',
  'Price',
  'Notes',
  'Admin Note',
  'Confirmed At',
  'Shipped At',
  'Rejected At',
  'Received At',
];

function csvDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function diamondLabel(order) {
  const snap = order.productSnapshot || {};
  return [
    order.shape || snap.shape,
    order.carat != null ? `${order.carat}ct` : null,
    order.color || snap.color,
    order.clarity || snap.clarity,
  ]
    .filter(Boolean)
    .join(' ') || snap.title || '';
}

function rapnetOrderToCsvRow(order) {
  const snap = order.productSnapshot || {};
  const storeName = typeof order.storeId === 'object' ? order.storeId?.name : '';
  const customer = typeof order.customerId === 'object' ? order.customerId : null;

  return {
    'Ticket Number': order.ticketNumber || '',
    'Created At': csvDate(order.createdAt),
    Status: order.status || '',
    Store: storeName || '',
    Customer: customer?.username || '',
    'Customer Email': customer?.email || '',
    Diamond: diamondLabel(order),
    Shape: order.shape || snap.shape || '',
    Carat: order.carat ?? snap.carat ?? '',
    Color: order.color || snap.color || '',
    Clarity: order.clarity || snap.clarity || '',
    Lab: order.lab || snap.lab || '',
    Certificate: snap.certificateNumber || snap.raw?.certificate_number || '',
    'RapNet ID': order.rapnetProductId || '',
    'Supplier Ref': order.rapnetOrderRef || '',
    Quantity: order.quantity ?? '',
    Price: order.price != null ? Number(order.price).toFixed(2) : '',
    Notes: order.notes || '',
    'Admin Note': order.adminNote || '',
    'Confirmed At': csvDate(order.confirmedAt),
    'Shipped At': csvDate(order.shippedAt),
    'Rejected At': csvDate(order.rejectedAt),
    'Received At': csvDate(order.receivedAt),
  };
}

async function fetchAllAdminRapnetOrdersForExport({ filter, sortBy }) {
  const sort = resolveRapnetSort(sortBy);
  if (needsStoreNameSort(sortBy)) {
    return RapnetOrder.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'warehouses',
          localField: 'storeId',
          foreignField: '_id',
          as: '_store',
        },
      },
      {
        $addFields: {
          _storeName: { $ifNull: [{ $arrayElemAt: ['$_store.name', 0] }, ''] },
        },
      },
      { $sort: sort },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: '_customer',
        },
      },
      {
        $addFields: {
          customerId: { $arrayElemAt: ['$_customer', 0] },
          storeId: { $arrayElemAt: ['$_store', 0] },
        },
      },
      { $project: { _store: 0, _customer: 0 } },
    ]);
  }

  return RapnetOrder.find(filter)
    .populate('customerId', 'username email phone_number')
    .populate('storeId', 'name')
    .sort(sort)
    .lean();
}

// ── GET /api/rapnet/products ──────────────────────────────────────────────────
const getProducts = async (req, res) => {
  try {
    const filters = sanitizeFilters(req.query);
    const result = await rapnetService.searchDiamonds(filters);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[RapNet] getProducts error:', err.message);
    const rapnetStatus = err?.statusCode;
    const rapnetBody = err?.rapnetBody;

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
      productSnapshot,
      quantity = 1,
      notes = '',
      storeId,
    } = req.body ?? {};

    if (!rapnetProductId) {
      return res.status(400).json({ success: false, message: 'rapnetProductId is required.' });
    }
    if (!productSnapshot || typeof productSnapshot !== 'object') {
      return res.status(400).json({ success: false, message: 'productSnapshot is required.' });
    }
    if (!storeId || !isObjectId(storeId)) {
      return res.status(400).json({ success: false, message: 'Valid storeId (warehouse) is required.' });
    }

    const customerId = req.user?._id ?? req.user?.id;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const warehouse = await Warehouse.findById(storeId).select('_id name isMain').lean();
    if (!warehouse) {
      return res.status(404).json({ success: false, message: 'Store warehouse not found.' });
    }

    const order = new RapnetOrder({
      customerId: new mongoose.Types.ObjectId(String(customerId)),
      storeId: warehouse._id,
      rapnetProductId: String(rapnetProductId),
      supplierId: productSnapshot?.supplierId ?? null,
      productSnapshot,
      shape: productSnapshot?.shape ?? null,
      carat: productSnapshot?.carat ? Number(productSnapshot.carat) : null,
      color: productSnapshot?.color ?? null,
      clarity: productSnapshot?.clarity ?? null,
      lab: productSnapshot?.lab ?? null,
      price: productSnapshot?.price ? Number(productSnapshot.price) : null,
      quantity: Math.max(1, Number(quantity)),
      notes: String(notes).trim(),
      status: 'SUBMITTED',
    });

    await order.save();

    let rapnetResponse = null;
    let rapnetOrderRef = null;

    try {
      rapnetResponse = await rapnetService.submitOrder({
        rapnetId: rapnetProductId,
        quantity: order.quantity,
        notes: order.notes,
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
      order.rapnetResponse = { error: rapnetErr.message };
      order.status = 'SUBMITTED';
      await order.save();

      const requester = await Customer.findById(customerId).select('username email').lean();
      setImmediate(() => {
        sendRapnetOrderCreatedEmails({
          order: order.toObject(),
          requester,
          storeId: warehouse._id,
        }).catch((e) => console.error('[RapNet] email error:', e.message));
      });

      return res.status(502).json({
        success: false,
        message: 'Order saved locally but failed to submit to RapNet. Will retry.',
        orderId: order._id,
        ticketNumber: order.ticketNumber,
        error: rapnetErr.message,
      });
    }

    order.rapnetResponse = rapnetResponse;
    order.rapnetOrderRef = rapnetOrderRef;
    order.status = 'SUBMITTED';
    await order.save();

    const requester = await Customer.findById(customerId).select('username email').lean();
    setImmediate(() => {
      sendRapnetOrderCreatedEmails({
        order: order.toObject(),
        requester,
        storeId: warehouse._id,
      }).catch((e) => console.error('[RapNet] email error:', e.message));
    });

    return res.status(201).json({
      success: true,
      message: 'Order submitted successfully.',
      orderId: order._id,
      ticketNumber: order.ticketNumber,
      rapnetOrderRef,
      status: order.status,
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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const match = { customerId };
    if (status && status !== 'ALL') {
      if (status === 'SUBMITTED') {
        match.status = { $in: ['SUBMITTED', 'REQUESTED', 'SUBMITTED_TO_RAPNET'] };
      } else if (status === 'REJECTED') {
        match.status = { $in: ['REJECTED', 'CANCELLED'] };
      } else {
        match.status = status;
      }
    }

    const [orders, total] = await Promise.all([
      RapnetOrder.find(match)
        .populate('storeId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RapnetOrder.countDocuments(match),
    ]);

    return res.status(200).json({
      success: true,
      data: orders,
      paginatorInfo: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
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
    const order = await RapnetOrder.findOne({ _id: id, customerId })
      .populate('storeId', 'name')
      .lean();
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
    if (['CONFIRMED', 'SHIPPED', 'REJECTED', 'RECEIVED'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled — current status: ${order.status}`,
      });
    }
    order.status = 'REJECTED';
    order.rejectedAt = new Date();
    await order.save();

    if (order.storeId) {
      const requester = await Customer.findById(customerId).select('username email').lean();
      setImmediate(() => {
        sendRapnetOrderStatusEmails({
          order: order.toObject(),
          requester,
          storeId: order.storeId,
          status: 'REJECTED',
        }).catch((e) => console.error('[RapNet] cancel email error:', e.message));
      });
    }

    return res.status(200).json({ success: true, message: 'Order cancelled.', data: order });
  } catch (err) {
    console.error('[RapNet] cancelOrder error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to cancel order.', error: err.message });
  }
};

// ── PATCH /api/rapnet/orders/:id/received ─────────────────────────────────────
const markOrderReceived = async (req, res) => {
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
    if (order.status !== 'SHIPPED') {
      return res.status(400).json({
        success: false,
        message: `Only shipped orders can be marked as received. Current status: ${order.status}`,
      });
    }

    order.status = 'RECEIVED';
    order.receivedAt = new Date();
    await order.save();

    const requester = await Customer.findById(customerId).select('username email').lean();
    if (order.storeId) {
      setImmediate(() => {
        sendRapnetOrderStatusEmails({
          order: order.toObject(),
          requester,
          storeId: order.storeId,
          status: 'RECEIVED',
        }).catch((e) => console.error('[RapNet] received email error:', e.message));
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Order marked as received.',
      data: order,
    });
  } catch (err) {
    console.error('[RapNet] markOrderReceived error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to mark order as received.' });
  }
};

// ── GET /api/rapnet/admin/orders ──────────────────────────────────────────────
const getAdminOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const skip = (page - 1) * limit;
    const sortBy = String(req.query.sortBy || 'date_desc').trim();
    const filter = buildAdminRapnetOrdersFilter(req);

    const { orders, total } = await queryAdminRapnetOrders({ filter, sortBy, skip, limit });

    return res.status(200).json({
      success: true,
      data: orders,
      paginatorInfo: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[RapNet] getAdminOrders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: err.message });
  }
};

// ── GET /api/rapnet/admin/orders/export/csv ───────────────────────────────────
const exportAdminRapnetOrdersCsv = async (req, res) => {
  try {
    const sortBy = String(req.query.sortBy || 'date_desc').trim();
    const filter = buildAdminRapnetOrdersFilter(req);
    const orders = await fetchAllAdminRapnetOrdersForExport({ filter, sortBy });
    const csvRows = orders.map(rapnetOrderToCsvRow);
    const parser = new Parser({ fields: CSV_FIELDS });
    const csv = parser.parse(csvRows.length ? csvRows : [{}]);
    const stamp = new Date().toISOString().slice(0, 10);
    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    const rangeSuffix = startDate && endDate ? `-${startDate}_to_${endDate}` : '';
    const statusParam = String(req.query.status || '').trim();
    const statusSuffix = statusParam && statusParam !== 'ALL' ? `-${statusParam.toLowerCase()}` : '';
    const storeParam = String(req.query.warehouseId || '').trim();
    const storeSuffix = storeParam ? '-store' : '';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=outsource-loose-stone-orders${statusSuffix}${storeSuffix}${rangeSuffix}-${stamp}.csv`,
    );
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (err) {
    console.error('[RapNet] exportAdminRapnetOrdersCsv error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to export Outsource Loose Stone orders',
      error: err.message,
    });
  }
};

// ── PATCH /api/rapnet/admin/orders/:id/status ─────────────────────────────────
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body ?? {};

    const VALID = ['CONFIRMED', 'SHIPPED', 'REJECTED'];
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

    const isSubmitted =
      order.status === 'SUBMITTED' || ['REQUESTED', 'SUBMITTED_TO_RAPNET'].includes(order.status);

    if (status === 'SHIPPED') {
      if (order.status !== 'CONFIRMED') {
        return res.status(400).json({
          success: false,
          message: `Only confirmed orders can be marked as shipped. Current status: ${order.status}`,
        });
      }
    } else if (status === 'CONFIRMED' || status === 'REJECTED') {
      if (!isSubmitted) {
        return res.status(400).json({
          success: false,
          message: `Only submitted orders can be confirmed or rejected. Current status: ${order.status}`,
        });
      }
    }

    const prevStatus = order.status;
    order.status = status;
    if (adminNote) order.adminNote = String(adminNote).trim();
    if (status === 'CONFIRMED') {
      order.confirmedAt = new Date();
      const adminId = req.user?._id ?? req.user?.id;
      if (adminId && isObjectId(adminId)) order.confirmedBy = adminId;
    }
    if (status === 'SHIPPED') order.shippedAt = new Date();
    if (status === 'REJECTED') order.rejectedAt = new Date();

    await order.save();

    if (order.storeId) {
      const requester = await Customer.findById(order.customerId).select('username email').lean();
      setImmediate(() => {
        sendRapnetOrderStatusEmails({
          order: order.toObject(),
          requester,
          storeId: order.storeId,
          status,
        }).catch((e) => console.error('[RapNet] status email error:', e.message));
      });
    }

    const populated = await RapnetOrder.findById(order._id)
      .populate('customerId', 'username email phone_number')
      .populate('storeId', 'name')
      .lean();

    return res.status(200).json({
      success: true,
      message: `Order status updated: ${prevStatus} → ${status}`,
      data: populated,
    });
  } catch (err) {
    console.error('[RapNet] updateOrderStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update order.', error: err.message });
  }
};

module.exports = {
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
};
