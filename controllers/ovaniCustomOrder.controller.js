const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const OvaniCustomOrder = require('../models/ovaniCustomOrder.model');
const Customer = require('../models/customer.model');
const Warehouse = require('../models/warehouse.model');
const { sendOvaniCustomOrderCreatedEmails, sendOvaniCustomOrderStatusEmails } = require('../utils/ovaniCustomOrderEmail');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

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

function buildAdminOvaniOrdersFilter(req) {
  const status = req.query.status;
  const search = String(req.query.search || '').trim();
  const warehouseIds = parseWarehouseIds(req.query.warehouseId);

  const match = {};
  if (status && status !== 'ALL') match.status = status;
  if (warehouseIds.length === 1) {
    match.storeWarehouseId = warehouseIds[0];
  } else if (warehouseIds.length > 1) {
    match.storeWarehouseId = { $in: warehouseIds };
  }
  if (search) {
    if (isObjectId(search)) {
      match.$or = [
        { _id: new mongoose.Types.ObjectId(search) },
        { customerId: new mongoose.Types.ObjectId(search) },
      ];
    } else {
      match.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { laravoProductId: { $regex: search, $options: 'i' } },
        { laravoGuid: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { modelNumber: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { productType: { $regex: search, $options: 'i' } },
      ];
    }
  }
  applyCreatedAtRangeFilter(match, req.query);
  return match;
}

function resolveOvaniSort(sortBy = 'date_desc') {
  switch (String(sortBy || '').trim()) {
    case 'date_asc':
      return { createdAt: 1 };
    case 'product_asc':
      return { title: 1, modelNumber: 1, createdAt: -1 };
    case 'product_desc':
      return { title: -1, modelNumber: -1, createdAt: -1 };
    case 'store_asc':
      return { _storeName: 1, createdAt: -1 };
    case 'store_desc':
      return { _storeName: -1, createdAt: -1 };
    default:
      return { createdAt: -1 };
  }
}

function needsStoreNameSort(sortBy) {
  return sortBy === 'store_asc' || sortBy === 'store_desc';
}

async function queryAdminOvaniOrders({ filter, sortBy, skip = 0, limit = 30 }) {
  const sort = resolveOvaniSort(sortBy);
  if (needsStoreNameSort(sortBy)) {
    const [rows, total] = await Promise.all([
      OvaniCustomOrder.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'warehouses',
            localField: 'storeWarehouseId',
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
            storeWarehouseId: { $arrayElemAt: ['$_store', 0] },
          },
        },
        { $project: { _store: 0, _customer: 0 } },
      ]),
      OvaniCustomOrder.countDocuments(filter),
    ]);
    return { orders: rows, total };
  }

  const [orders, total] = await Promise.all([
    OvaniCustomOrder.find(filter)
      .populate('customerId', 'username email phone_number')
      .populate('storeWarehouseId', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    OvaniCustomOrder.countDocuments(filter),
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
  'Product',
  'Model Number',
  'GUID',
  'Brand',
  'Product Type',
  'Material',
  'Collection',
  'Quantity',
  'Available Qty',
  'Unit Price',
  'Currency',
  'Line Total',
  'Notes',
  'Admin Note',
  'Approved At',
  'Shipped At',
  'Rejected At',
  'Received At',
];

function csvDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function ovaniOrderToCsvRow(order) {
  const snap = order.productSnapshot || {};
  const storeName =
    typeof order.storeWarehouseId === 'object' ? order.storeWarehouseId?.name : '';
  const customer =
    typeof order.customerId === 'object' ? order.customerId : null;
  const unitPrice = order.price != null ? Number(order.price) : null;
  const qty = Number(order.quantity || 0);
  const lineTotal = unitPrice != null ? unitPrice * qty : null;

  return {
    'Ticket Number': order.ticketNumber || '',
    'Created At': csvDate(order.createdAt),
    Status: order.status || '',
    Store: storeName || '',
    Customer: customer?.username || '',
    'Customer Email': customer?.email || '',
    Product: snap.title || order.title || '',
    'Model Number': order.modelNumber || snap.modelNumber || '',
    GUID: order.laravoGuid || '',
    Brand: order.brand || snap.brand || '',
    'Product Type': order.productType || snap.productType || '',
    Material: snap.material || '',
    Collection: snap.collection || '',
    Quantity: order.quantity ?? '',
    'Available Qty': order.availableQty ?? '',
    'Unit Price': unitPrice != null ? unitPrice.toFixed(2) : '',
    Currency: order.currency || 'USD',
    'Line Total': lineTotal != null ? lineTotal.toFixed(2) : '',
    Notes: order.notes || '',
    'Admin Note': order.adminNote || '',
    'Approved At': csvDate(order.approvedAt),
    'Shipped At': csvDate(order.shippedAt),
    'Rejected At': csvDate(order.rejectedAt),
    'Received At': csvDate(order.receivedAt),
  };
}

async function fetchAllAdminOvaniOrdersForExport({ filter, sortBy }) {
  const sort = resolveOvaniSort(sortBy);
  if (needsStoreNameSort(sortBy)) {
    return OvaniCustomOrder.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'warehouses',
          localField: 'storeWarehouseId',
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
          storeWarehouseId: { $arrayElemAt: ['$_store', 0] },
        },
      },
      { $project: { _store: 0, _customer: 0 } },
    ]);
  }

  return OvaniCustomOrder.find(filter)
    .populate('customerId', 'username email phone_number')
    .populate('storeWarehouseId', 'name')
    .sort(sort)
    .lean();
}

function parseQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

const placeOrder = async (req, res) => {
  try {
    const {
      laravoProductId,
      brandId,
      productTypeId,
      productSnapshot,
      quantity = 1,
      notes = '',
      storeWarehouseId,
      availableQty,
    } = req.body ?? {};

    if (!laravoProductId) {
      return res.status(400).json({ success: false, message: 'laravoProductId is required.' });
    }
    if (!productSnapshot || typeof productSnapshot !== 'object') {
      return res.status(400).json({ success: false, message: 'productSnapshot is required.' });
    }
    if (!storeWarehouseId || !mongoose.isValidObjectId(storeWarehouseId)) {
      return res.status(400).json({ success: false, message: 'Valid storeWarehouseId is required.' });
    }

    const customerId = req.user?._id ?? req.user?.id;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const maxQty = parseQty(
      availableQty ?? productSnapshot?.raw?.qty ?? productSnapshot?.availableQty ?? 0
    );
    const orderQty = Math.max(1, Math.floor(Number(quantity) || 1));

    if (maxQty <= 0) {
      return res.status(400).json({ success: false, message: 'This product is out of stock.' });
    }
    if (orderQty > maxQty) {
      return res.status(400).json({
        success: false,
        message: `Maximum available quantity is ${maxQty}.`,
      });
    }

    const warehouse = await Warehouse.findById(storeWarehouseId).select('_id name isMain').lean();
    if (!warehouse) {
      return res.status(404).json({ success: false, message: 'Store warehouse not found.' });
    }

    const snap = productSnapshot;
    const order = new OvaniCustomOrder({
      customerId: new mongoose.Types.ObjectId(String(customerId)),
      storeWarehouseId: warehouse._id,
      brandId: String(brandId || ''),
      productTypeId: String(productTypeId || ''),
      laravoProductId: String(laravoProductId),
      laravoGuid: String(snap.laravoGuid || snap.guid || snap.raw?.laravo_guid || ''),
      productSnapshot: snap,
      title: String(snap.title || ''),
      modelNumber: String(snap.modelNumber || snap.id || ''),
      brand: String(snap.brand || ''),
      productType: String(snap.productType || ''),
      price: snap.price != null ? Number(snap.price) : null,
      currency: String(snap.currency || 'USD'),
      availableQty: maxQty,
      quantity: orderQty,
      notes: String(notes || '').trim(),
      status: 'SUBMITTED',
    });

    await order.save();

    const requester = await Customer.findById(customerId).select('username email').lean();
    setImmediate(() => {
      sendOvaniCustomOrderCreatedEmails({
        order: order.toObject(),
        requester,
        storeWarehouseId: warehouse._id,
      }).catch((err) => console.error('[ovaniCustomOrder] email error:', err.message));
    });

    return res.status(201).json({
      success: true,
      message: 'Ovani custom order inquiry submitted successfully.',
      data: {
        _id: order._id,
        ticketNumber: order.ticketNumber,
        status: order.status,
      },
    });
  } catch (err) {
    console.error('[ovaniCustomOrder] placeOrder error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit inquiry.', error: err.message });
  }
};

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
    if (status && status !== 'ALL') match.status = status;

    const [orders, total] = await Promise.all([
      OvaniCustomOrder.find(match)
        .populate('storeWarehouseId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      OvaniCustomOrder.countDocuments(match),
    ]);

    return res.status(200).json({
      success: true,
      data: orders,
      paginatorInfo: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[ovaniCustomOrder] getMyOrders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
};

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
    const order = await OvaniCustomOrder.findOne({ _id: id, customerId })
      .populate('storeWarehouseId', 'name')
      .lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    return res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error('[ovaniCustomOrder] getOrderById error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch order.' });
  }
};

const getAdminOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const skip = (page - 1) * limit;
    const sortBy = String(req.query.sortBy || 'date_desc').trim();
    const filter = buildAdminOvaniOrdersFilter(req);

    const { orders, total } = await queryAdminOvaniOrders({ filter, sortBy, skip, limit });

    return res.status(200).json({
      success: true,
      data: orders,
      paginatorInfo: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[ovaniCustomOrder] getAdminOrders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
};

const exportAdminOvaniOrdersCsv = async (req, res) => {
  try {
    const sortBy = String(req.query.sortBy || 'date_desc').trim();
    const filter = buildAdminOvaniOrdersFilter(req);
    const orders = await fetchAllAdminOvaniOrdersForExport({ filter, sortBy });
    const csvRows = orders.map(ovaniOrderToCsvRow);
    const parser = new Parser({ fields: CSV_FIELDS });
    const csv = parser.parse(csvRows.length ? csvRows : [{}]);
    const stamp = new Date().toISOString().slice(0, 10);
    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    const rangeSuffix = startDate && endDate ? `-${startDate}_to_${endDate}` : '';
    const statusParam = String(req.query.status || '').trim();
    const statusSuffix = statusParam && statusParam !== 'ALL' ? `-${statusParam.toLowerCase()}` : '';
    const storeParam = String(req.query.warehouseId || '').trim();
    const storeSuffix = storeParam ? `-store` : '';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=ovani-custom-orders${statusSuffix}${storeSuffix}${rangeSuffix}-${stamp}.csv`,
    );
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (err) {
    console.error('[ovaniCustomOrder] exportAdminOvaniOrdersCsv error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to export Ovani custom orders',
      error: err.message,
    });
  }
};

const getAdminOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id.' });
    }
    const order = await OvaniCustomOrder.findById(id)
      .populate('customerId', 'username email phone_number')
      .populate('storeWarehouseId', 'name storeEmail')
      .lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    return res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error('[ovaniCustomOrder] getAdminOrderById error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch order.' });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body ?? {};
    const VALID = ['APPROVED', 'SHIPPED', 'REJECTED'];
    if (!VALID.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${VALID.join(', ')}`,
      });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id.' });
    }

    const order = await OvaniCustomOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (status === 'SHIPPED') {
      if (order.status !== 'APPROVED') {
        return res.status(400).json({
          success: false,
          message: `Only approved orders can be marked as shipped. Current status: ${order.status}`,
        });
      }
    } else if (status === 'APPROVED' || status === 'REJECTED') {
      if (order.status !== 'SUBMITTED') {
        return res.status(400).json({
          success: false,
          message: `Only submitted orders can be approved or rejected. Current status: ${order.status}`,
        });
      }
    }

    const prevStatus = order.status;
    order.status = status;
    if (adminNote) order.adminNote = String(adminNote).trim();
    if (status === 'APPROVED') {
      order.approvedAt = new Date();
      order.approvedBy = req.user?._id ?? null;
    }
    if (status === 'SHIPPED') order.shippedAt = new Date();
    if (status === 'REJECTED') order.rejectedAt = new Date();
    await order.save();

    const requester = await Customer.findById(order.customerId).select('username email').lean();
    setImmediate(() => {
      sendOvaniCustomOrderStatusEmails({
        order: order.toObject(),
        requester,
        storeWarehouseId: order.storeWarehouseId,
        status,
      }).catch((err) => console.error('[ovaniCustomOrder] status email error:', err.message));
    });

    return res.status(200).json({
      success: true,
      message: `Order status updated: ${prevStatus} → ${status}`,
      data: order,
    });
  } catch (err) {
    console.error('[ovaniCustomOrder] updateOrderStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update order.' });
  }
};

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

    const order = await OvaniCustomOrder.findOne({ _id: id, customerId });
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
    setImmediate(() => {
      sendOvaniCustomOrderStatusEmails({
        order: order.toObject(),
        requester,
        storeWarehouseId: order.storeWarehouseId,
        status: 'RECEIVED',
      }).catch((err) => console.error('[ovaniCustomOrder] received email error:', err.message));
    });

    return res.status(200).json({
      success: true,
      message: 'Order marked as received.',
      data: order,
    });
  } catch (err) {
    console.error('[ovaniCustomOrder] markOrderReceived error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to mark order as received.' });
  }
};

module.exports = {
  placeOrder,
  getMyOrders,
  getOrderById,
  getAdminOrders,
  getAdminOrderById,
  exportAdminOvaniOrdersCsv,
  updateOrderStatus,
  markOrderReceived,
};
