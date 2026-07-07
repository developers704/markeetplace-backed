const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const B2bStoreTransferOrder = require('../models/b2bStoreTransferOrder.model');
const { attachUnreadChatCount, markChatMessagesSeen } = require('../utils/chatUnread');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const StoreInventory = require('../models/storeInventory.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const { sumSkuInventory, deductSkuInventory } = require('./v2B2B.controller');
const { emitB2bStoreTransferChatMessage } = require('../socket/b2bStoreTransferChat.socket');
const { emitAdminChatUnreadChanged } = require('../socket/adminChat.socket');
const { emitCustomerChatUnreadChanged } = require('../socket/customerChat.socket');
const { sendStoreTransferCreatedEmails } = require('../utils/b2bStoreTransferEmail');
const { sendStoreTransferCreatedNotifications } = require('../utils/b2bStoreTransferNotifications');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());
const MAX_REPLY_PREVIEW = 88;

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

function getRequesterId(order) {
  const rb = order.requestedBy;
  if (!rb) return '';
  return String(rb._id || rb);
}

function getOrderDestWarehouseId(order) {
  const dw = order?.destWarehouseId;
  if (!dw) return '';
  return String(dw._id || dw);
}

function canAccessOrder(req, orderLean) {
  if (!orderLean) return false;
  const actor = req.b2bActor;
  const role = String(actor?.roleName || '').toLowerCase().trim();
  if (actor?.isSuperUser || role === 'admin' || role === 'super admin' || role === 'superuser') return true;
  if (req.user?.is_superuser) return true;
  if (getRequesterId(orderLean) === String(req.user._id)) return true;

  const orderDestWarehouseId = getOrderDestWarehouseId(orderLean);
  if (!orderDestWarehouseId) return false;

  const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : '';
  if (selectedWarehouse && selectedWarehouse === orderDestWarehouseId) return true;

  const userWarehouses = Array.isArray(req.user?.warehouse)
    ? req.user.warehouse.map((w) => String(w))
    : [];
  return userWarehouses.includes(orderDestWarehouseId);
}

async function incrementSkuInventoryAtWarehouse({ skuId, warehouseId, quantity, session }) {
  const filter = {
    skuId: new mongoose.Types.ObjectId(String(skuId)),
    warehouse: new mongoose.Types.ObjectId(String(warehouseId)),
    city: null,
  };
  const opts = { upsert: true };
  if (session) opts.session = session;
  await SkuInventory.updateOne(
    filter,
    {
      $inc: { quantity },
      $setOnInsert: { city: null },
    },
    opts
  );
}

async function rebuildInventoryCaches(skuId) {
  try {
    const { rebuildSkuInventoryRedis, rebuildProductInventoryRedis } = require('../services/inventoryRedis.service');
    await rebuildSkuInventoryRedis(skuId);
    const sku = await Sku.findById(skuId).select('productId').lean();
    if (sku?.productId) {
      await rebuildProductInventoryRedis(sku.productId);
      const { scheduleSync } = require('../services/productListingSync.service');
      scheduleSync(sku.productId).catch(() => {});
    }
  } catch (e) {
    console.error('[b2bStoreTransfer] rebuildInventoryCaches', e.message);
  }
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseMulti = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const sortFacetStrings = (arr = []) =>
  [...new Set(arr.map((v) => String(v || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

function resolveUserWarehouseId(req) {
  const selectedWarehouse = req.user?.selectedWarehouse
    ? String(req.user.selectedWarehouse)
    : null;
  const userWarehouses = Array.isArray(req.user?.warehouse)
    ? req.user.warehouse.map((w) => String(w._id || w))
    : [];
  return selectedWarehouse || userWarehouses[0] || null;
}

function buildMyStoreInventoryBasePipeline(warehouseId) {
  return [
    {
      $match: {
        warehouse: new mongoose.Types.ObjectId(warehouseId),
        quantity: { $gt: 0 },
      },
    },
    {
      $lookup: {
        from: 'skus',
        localField: 'skuId',
        foreignField: '_id',
        as: 'skuDoc',
      },
    },
    { $unwind: { path: '$skuDoc', preserveNullAndEmptyArrays: false } },
    {
      $lookup: {
        from: 'vendorproducts',
        localField: 'skuDoc.productId',
        foreignField: '_id',
        as: 'productDoc',
      },
    },
    { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: false } },
  ];
}

function applyMyStoreInventoryFilters(pipeline, query = {}) {
  const metalColors = parseMulti(query.metalColor);
  const metalTypes = parseMulti(query.metalType);
  const brands = parseMulti(query.brand);
  const styles = parseMulti(query.style);
  const stoneTypes = parseMulti(query.stonetype);
  const vendors = parseMulti(query.vendor);

  if (metalColors.length) {
    pipeline.push({ $match: { 'skuDoc.metalColor': { $in: metalColors } } });
  }
  if (metalTypes.length) {
    pipeline.push({ $match: { 'skuDoc.metalType': { $in: metalTypes } } });
  }
  if (brands.length) {
    pipeline.push({ $match: { 'productDoc.brand': { $in: brands } } });
  }
  if (styles.length) {
    pipeline.push({ $match: { 'skuDoc.attributes.style': { $in: styles } } });
  }
  if (stoneTypes.length) {
    pipeline.push({ $match: { 'skuDoc.attributes.stonetype': { $in: stoneTypes } } });
  }
  if (vendors.length) {
    pipeline.push({ $match: { 'skuDoc.attributes.vendor': { $in: vendors } } });
  }

  const search = String(query.search || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'skuDoc.sku': rx },
          { 'productDoc.vendorModel': rx },
          { 'productDoc.title': rx },
          { 'productDoc.brand': rx },
        ],
      },
    });
  }

  return pipeline;
}

const createStoreTransferOrder = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const {
      vendorProductId,
      skuId,
      sku: skuCode,
      skuCode: skuCodeAlt,
      quantity,
      sourceWarehouseId,
      destWarehouseId,
      receiptNumber,
      note,
      eta,
      confirmedByUserId,
      confirmedBy,

    } = req.body || {};

    const receipt = String(receiptNumber || '').trim();

    if (!isObjectId(sourceWarehouseId)) {
      return res.status(400).json({ success: false, message: 'Source store is required' });
    }

    let resolvedSkuId = isObjectId(skuId) ? String(skuId) : null;
    let resolvedVendorProductId = isObjectId(vendorProductId) ? String(vendorProductId) : null;

    const skuInput = String(skuCode || skuCodeAlt || '').trim();
    if (!resolvedSkuId && skuInput) {
      const skuDoc = await Sku.findOne({
        $or: [
          { skuKey: skuInput.toUpperCase() },
          { sku: new RegExp(`^${escapeRegex(skuInput)}$`, 'i') },
        ],
      })
        .select('_id sku productId price currency')
        .lean();
      if (!skuDoc) {
        return res.status(404).json({ success: false, message: `SKU not found: ${skuInput}` });
      }
      resolvedSkuId = String(skuDoc._id);
      resolvedVendorProductId = String(skuDoc.productId);
    }

    if (!resolvedSkuId || !resolvedVendorProductId) {
      return res.status(400).json({
        success: false,
        message: 'SKU is required (enter SKU code or provide skuId)',
      });
    }

    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    const destWh = destWarehouseId ? String(destWarehouseId) : selectedWarehouse || userWarehouses[0] || null;

    if (!destWh || !isObjectId(destWh)) {
      return res.status(400).json({
        success: false,
        message: 'No destination store warehouse. Select a warehouse first.',
      });
    }

    const ownsStore =
      (selectedWarehouse && selectedWarehouse === destWh) || userWarehouses.includes(destWh);
    if (!actor?.isSuperUser && !ownsStore) {
      return res.status(403).json({ success: false, message: 'You cannot request for this warehouse' });
    }

    const qtyStr = String(quantity ?? '').trim();
    let finalQty = 1;
    if (qtyStr !== '') {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a whole number of at least 1',
        });
      }
      finalQty = qty;
    }

    const [vendorProduct, sku] = await Promise.all([
      VendorProduct.findById(resolvedVendorProductId).select('_id vendorModel title').lean(),
      Sku.findById(resolvedSkuId).select('_id sku productId price currency').lean(),
    ]);

    if (!vendorProduct) return res.status(404).json({ success: false, message: 'Product not found' });
    if (!sku) return res.status(404).json({ success: false, message: 'SKU not found' });
    if (String(sku.productId) !== String(vendorProduct._id)) {
      return res.status(400).json({ success: false, message: 'SKU does not belong to this product' });
    }

    const available = await sumSkuInventory(sku._id, sourceWarehouseId, null);
    if (available < finalQty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock at source warehouse. Available=${available}, requested=${finalQty}`,
      });
    }

    const unitPrice = Number(sku.price) || 0;
    const lineTotal = unitPrice * finalQty;
    const inventoryWallet = await InventoryWallet.findOne({ warehouse: destWh }).lean();
    const walletBalance = inventoryWallet?.balance || 0;
    if (lineTotal > 0 && walletBalance < lineTotal) {
      return res.status(400).json({
        success: false,
        message: `Insufficient store wallet. Available: ${walletBalance.toFixed(2)}, required: ${lineTotal.toFixed(2)}`,
      });
    }

    const order = await B2bStoreTransferOrder.create({
      vendorProductId: vendorProduct._id,
      skuId: sku._id,
      sourceWarehouseId,
      destWarehouseId: destWh,
      quantity: finalQty,
      unitPrice,
      currency: sku.currency || 'USD',
      receiptNumber: receipt,
      note: String(note || '').trim(),
      confirmedByUserId: String(confirmedByUserId || confirmedBy || '').trim(),
      eta: String(eta || '').trim(),  
      status: 'SUBMITTED',
      requestedBy: actor.id,
      requestedByModel: actor.model,
    });

    const populated = await B2bStoreTransferOrder.findById(order._id)
      .populate('vendorProductId', 'vendorModel title brand')
      .populate('skuId', 'sku price currency metalColor metalType size images attributes')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .lean();

    sendStoreTransferCreatedEmails({
      order,
      populated,
      requester: req.user,
      destWarehouseId: destWh,
    }).catch((err) => console.error('[b2bStoreTransfer] email error:', err));

    sendStoreTransferCreatedNotifications({
      order,
      populated,
      requester: req.user,
      destWarehouseId: destWh,
    }).catch((err) => console.error('[b2bStoreTransfer] notification error:', err));

    return res.status(201).json({
      success: true,
      message: 'Transfer request submitted',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Create failed' });
  }
};

const listMyStoreTransferOrders = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const scope = String(req.query?.scope || 'mine').toLowerCase() === 'store' ? 'store' : 'mine';
    const filter = {};

    if (scope === 'store') {
      const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : '';
      const userWarehouses = Array.isArray(req.user?.warehouse)
        ? req.user.warehouse.map((w) => String(w))
        : [];
      const scopeWarehouseIds = selectedWarehouse ? [selectedWarehouse] : userWarehouses;

      if (scopeWarehouseIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
      filter.destWarehouseId = { $in: scopeWarehouseIds };
    } else {
      filter.requestedBy = actor.id;
    }

    const rows = await B2bStoreTransferOrder.find(filter)
      .sort({ createdAt: -1 })
      .populate('vendorProductId', 'vendorModel title')
      .populate('skuId', 'sku price images')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .populate('requestedBy', 'username userId')
      .lean();

    const viewerModel = req.b2bActor?.model || 'Customer';
    const data = attachUnreadChatCount(rows, req.user._id, viewerModel);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const CSV_BASE_FIELDS = [
  
  'Ticket Number',
  'Status',
  'Vendor Model',
  'SKU',
  'Description',
  'Quantity',
  'Unit Price',
  'Total',
  // 'Currency',
  'Source Warehouse',
  'Destination Warehouse',
  'Requested By',
  'Requester Email',
  'Requested By Model',
  'Rejection Reason',
  'Rejected At',
  'Inventory Applied At',
  'Shipped At',
  'Received At',
  'Created At',
  'Updated At',
  'Attributes Summary',
];

function csvDate(value) {
  if (!value) return '';

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// function buildAttributesSummary(attr) {
//   if (!attr || typeof attr !== 'object') return '';
//   return Object.entries(attr)
//     .filter(([, v]) => v != null && String(v).trim() !== '')
//     .map(([k, v]) => `${k}: ${v}`)
//     .join(' | ');
// }

function storeTransferOrderToCsvRow(order) {
  const attr = order.skuId?.attributes || {};
  const qty = Number(order.quantity) || 0;
  const unitPrice = Number(order.unitPrice) || 0;

  const row = {
    'Ticket Number': order.ticketNumber || '',
    Status: order.status || '',
    'Vendor Model': order.vendorProductId?.vendorModel || order.vendorProductId?.title || '',
    SKU: order.skuId?.sku || '',
    Description: attr.descriptionname != null ? String(attr.descriptionname) : '',
    Quantity: qty,
    'Cp-Price': unitPrice,
    'Total': qty * unitPrice,
    'Source Warehouse': order.sourceWarehouseId?.name || '',
    'Destination Warehouse': order.destWarehouseId?.name || '',
    'Requested By': order.requestedBy?.username || '-',
    'Requester Email': order.requestedBy?.email || '-',
    'Requested By Model': order.requestedByModel || '-',
    'Rejection Reason': order.rejection?.reason || '-',
    'Rejected At': csvDate(order.rejection?.rejectedAt),
    'Inventory Applied At': csvDate(order.inventoryAppliedAt),
    'Shipped At': csvDate(order.deliveredAt),
    'Received At': csvDate(order.receivedAt),
    'Created At': csvDate(order.createdAt),
    'Updated At': csvDate(order.updatedAt),
    // 'Attributes Summary': buildAttributesSummary(attr),
  };

  Object.entries(attr).forEach(([key, value]) => {
    if (value == null || String(value).trim() === '') return;
    row[key] = String(value);
  });

  return row;
}

const exportAdminStoreTransferOrdersCsv = async (req, res) => {
  try {
    const status = req.query.status;
    const receiptNumber = req.query.receiptNumber;
    const filter = {};
    if (status && String(status).trim()) {
      filter.status = String(status).trim().toUpperCase();
    }
    if (receiptNumber !== undefined) {
      const receipt = String(receiptNumber).trim();
      const normalized = receipt.toLowerCase();
      if (normalized === 'has' || normalized === 'nonempty') {
        filter.receiptNumber = { $nin: ['', null] };
      } else if (normalized === '' || normalized === 'empty' || normalized === 'none') {
        filter.receiptNumber = { $in: ['', null] };
      } else {
        filter.receiptNumber = receipt;
      }
    }
    applyCreatedAtRangeFilter(filter, req.query);

    const rows = await B2bStoreTransferOrder.find(filter)
      .sort({ createdAt: -1 })
      .populate('vendorProductId', 'vendorModel title')
      .populate('skuId', 'sku price attributes')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .populate('requestedBy', 'username email')
      .lean();

    const csvRows = rows.map(storeTransferOrderToCsvRow);
    const fieldSet = new Set(CSV_BASE_FIELDS);
    csvRows.forEach((row) => {
      Object.keys(row).forEach((key) => fieldSet.add(key));
    });
    const attrFields = [...fieldSet]
  .filter((f) => !CSV_BASE_FIELDS.includes(f))
  .sort((a, b) => a.localeCompare(b));

    const fields = [...CSV_BASE_FIELDS, ...attrFields];

    const parser = new Parser({ fields });
    const csv = parser.parse(csvRows.length ? csvRows : [{}]);
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = filter.status ? `-${filter.status.toLowerCase()}` : '';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=store-to-store-transfers${suffix}-${stamp}.csv`,
    );
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to export store transfers',
    });
  }
};

const listAdminStoreTransferOrders = async (req, res) => {
  try {
    const status = req.query.status;
    const receiptNumber = req.query.receiptNumber;
    const filter = {};
    if (status && String(status).trim()) {
      filter.status = String(status).trim().toUpperCase();
    }
    if (receiptNumber !== undefined) {
      const receipt = String(receiptNumber).trim();
      const normalized = receipt.toLowerCase();
      if (normalized === 'has' || normalized === 'nonempty') {
        filter.receiptNumber = { $nin: ['', null] };
      } else if (normalized === '' || normalized === 'empty' || normalized === 'none') {
        filter.receiptNumber = { $in: ['', null] };
      } else {
        filter.receiptNumber = receipt;
      }
    }
    applyCreatedAtRangeFilter(filter, req.query);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      B2bStoreTransferOrder.countDocuments(filter),
      B2bStoreTransferOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path:'vendorProductId',
          select: 'vendorModel subcategory category',
          populate: [
            {path: 'category', select: 'name'},
            {path: 'subcategory', select: 'name'},
          ]

        })
        // .populate('vendorProductId', 'vendorModel subcategory category ')
        .populate('skuId', 'sku price attributes')
        .populate('sourceWarehouseId', 'name')
        .populate('destWarehouseId', 'name')
        .populate('requestedBy', 'username email')
        .lean(),
    ]);

    const viewerModel = req.b2bActor?.model || 'User';
    const data = attachUnreadChatCount(rows, req.user._id, viewerModel);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
        hasNextPage: page * limit < total,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getStoreTransferOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await B2bStoreTransferOrder.findById(id)
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size images attributes')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .populate('requestedBy', 'username userId')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canAccessOrder(req, order)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const patchStoreTransferStatus = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      actor.isSuperUser ||
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superuser' ||
      role === 'Super User' ||
      !!req.user?.is_superuser;
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const nextStatus = String(req.body?.status || '').trim().toUpperCase();
    const reason = String(req.body?.reason || '').trim();

    const order = await B2bStoreTransferOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    const closed = order.status === 'RECEIVED' || order.status === 'REJECTED';
    if (closed && !isAdmin) {
      return res.status(400).json({ success: false, message: 'Order is closed' });
    }

    /** Admin-only reopen from terminal states (inventory correction is manual / exceptional). */
    if (closed && isAdmin) {
      const fromRejected = ['WIP', 'TRANSFER', 'SUBMITTED'];
      const fromReceived = ['WIP', 'TRANSFER', 'SUBMITTED', 'DELIVERED'];
      const ok =
        order.status === 'REJECTED' ? fromRejected.includes(nextStatus) : fromReceived.includes(nextStatus);
      if (!ok) {
        return res.status(400).json({
          success: false,
          message:
            order.status === 'REJECTED'
              ? `From REJECTED, admin can set: ${fromRejected.join(', ')}`
              : `From RECEIVED, admin can set: ${fromReceived.join(', ')}`,
        });
      }
      if (order.status === 'REJECTED') {
        order.rejection = { reason: '', rejectedAt: null, rejectedBy: null, rejectedByModel: null };
      }
      if (order.status === 'RECEIVED') {
        order.receivedAt = null;
        if (nextStatus !== 'DELIVERED') {
          order.deliveredAt = null;
        }
      }
      order.status = nextStatus;
      await order.save();

      const populated = await B2bStoreTransferOrder.findById(order._id)
        .populate('vendorProductId', 'vendorModel title')
        .populate('skuId', 'sku price')
        .populate('sourceWarehouseId', 'name')
        .populate('destWarehouseId', 'name')
        .lean();

      return res.status(200).json({ success: true, data: populated });
    }

    const allowed = ['SUBMITTED' , 'WIP', 'TRANSFER', 'DELIVERED', 'REJECTED'];
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: `Invalid status. Use one of: ${allowed.join(', ')}` });
    }

    if (nextStatus === 'REJECTED') {
      if (order.status === 'APPROVED' || order.inventoryAppliedAt) {
        return res.status(400).json({ success: false, message: 'Cannot reject after approval / inventory applied' });
      }
      order.status = 'REJECTED';
      order.rejection = {
        reason,
        rejectedAt: new Date(),
        rejectedBy: actor.id,
        rejectedByModel: actor.model === 'User' ? 'User' : 'Customer',
      };
      await order.save();
    } else if (nextStatus === 'DELIVERED') {
      if (order.status !== 'APPROVED') {
        return res.status(400).json({ success: false, message: 'Mark delivered only after APPROVED' });
      }
      order.status = 'DELIVERED';
      order.deliveredAt = new Date();
      await order.save();
    } else {
      if (['REJECTED', 'RECEIVED', 'DELIVERED'].includes(order.status)) {
        return res.status(400).json({ success: false, message: 'Invalid transition from current status' });
      }
      if (order.status === 'APPROVED') {
        return res.status(400).json({ success: false, message: 'Use Delivered after approval' });
      }
      order.status = nextStatus;
      await order.save();
    }

    const populated = await B2bStoreTransferOrder.findById(order._id)
      .populate('vendorProductId', 'vendorModel title')
      .populate('skuId', 'sku price')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .lean();

    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveStoreTransferOrder = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      actor.isSuperUser ||
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superuser' ||
      role === 'Super User' ||
      !!req.user?.is_superuser;
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const run = async (session) => {
      const q = B2bStoreTransferOrder.findById(id);
      if (session) q.session(session);
      const doc = await q;
      if (!doc) throw new Error('Not found');
      if (doc.inventoryAppliedAt || doc.status === 'APPROVED') {
        throw new Error('Already approved / inventory applied');
      }
      if (['REJECTED', 'RECEIVED', 'DELIVERED'].includes(doc.status)) {
        throw new Error('Invalid state for approval');
      }

      const available = await sumSkuInventory(doc.skuId, doc.sourceWarehouseId, session);
      if (available < doc.quantity) {
        throw new Error(`Insufficient vendor stock at approval. Available=${available}`);
      }

      await deductSkuInventory({
        skuId: doc.skuId,
        warehouseId: doc.sourceWarehouseId,
        quantity: doc.quantity,
        session,
      });

      await incrementSkuInventoryAtWarehouse({
        skuId: doc.skuId,
        warehouseId: doc.destWarehouseId,
        quantity: doc.quantity,
        session,
      });

      const storeInvOpts = session ? { upsert: true, session } : { upsert: true };
      await StoreInventory.updateOne(
        {
          storeWarehouseId: doc.destWarehouseId,
          storeId: doc.destWarehouseId,
          vendorProductId: doc.vendorProductId,
          skuId: doc.skuId,
        },
        { $inc: { quantity: doc.quantity } },
        storeInvOpts
      );

      const itemTotal = (doc.unitPrice || 0) * doc.quantity;
      const now = new Date();
      if (itemTotal > 0) {
        const destWalletQ = InventoryWallet.findOne({ warehouse: doc.destWarehouseId });
        if (session) destWalletQ.session(session);
        const destWallet = await destWalletQ;
        if (!destWallet) throw new Error('Destination inventory wallet not found');
        if (destWallet.balance < itemTotal) throw new Error('Insufficient wallet at approval time');
        destWallet.balance -= itemTotal;
        destWallet.lastTransaction = now;
        await destWallet.save(session ? { session } : {});

        const srcWalletQ = InventoryWallet.findOne({ warehouse: doc.sourceWarehouseId });
        console.log("warehouse walletsssss",  srcWalletQ)
        if (session) srcWalletQ.session(session);
        const srcWallet = await srcWalletQ;
        console.log("warehouse walletsssss check",  srcWallet)
        if (!srcWallet) throw new Error('Source inventory wallet not found');
        srcWallet.balance += itemTotal;
        srcWallet.lastTransaction = now;
        await srcWallet.save(session ? { session } : {});
      }

      doc.status = 'APPROVED';
      doc.inventoryAppliedAt = now;
      await doc.save(session ? { session } : {});
    };

    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => run(session));
      } finally {
        session.endSession();
      }
    } catch (txErr) {
      const msg = String(txErr?.message || '');
      if (msg.includes('Transaction numbers are only allowed') || msg.includes('replica set')) {
        await run(null);
      } else {
        throw txErr;
      }
    }

    const order = await B2bStoreTransferOrder.findById(id)
      .populate('vendorProductId', 'vendorModel title')
      .populate('skuId', 'sku price')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .lean();

    const skuRef = order.skuId;
    const skuMongoId = skuRef && typeof skuRef === 'object' && skuRef._id ? skuRef._id : skuRef;
    await rebuildInventoryCaches(skuMongoId);

    return res.status(200).json({ success: true, message: 'Approved — stock moved to store SkuInventory', data: order });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Approve failed' });
  }
};

const markStoreTransferReceived = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await B2bStoreTransferOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (String(order.requestedBy) !== String(actor.id)) {
      return res.status(403).json({ success: false, message: 'Only the requester can confirm receipt' });
    }
    if (order.status !== 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'Receipt is only available after Delivered' });
    }

    order.status = 'RECEIVED';
    order.receivedAt = new Date();
    await order.save();

    const populated = await B2bStoreTransferOrder.findById(order._id)
      .populate('vendorProductId', 'vendorModel title')
      .populate('skuId', 'sku price')
      .populate('destWarehouseId', 'name')
      .lean();

    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const listStoreTransferChatMessages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await B2bStoreTransferOrder.findById(id)
      .select('requestedBy destWarehouseId chatMessages status')
      .lean();
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canAccessOrder(req, order)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const messages = (order.chatMessages || []).map((m) => ({
      _id: m._id,
      text: m.text,
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
      role: m.role,
      senderId: m.senderId,
      senderName: m.senderName,
      replyToMessageId: m.replyToMessageId || null,
      replyToText: m.replyToText || '',
      replyToSenderName: m.replyToSenderName || '',
      seenBy: Array.isArray(m.seenBy) ? m.seenBy : [],
      createdAt: m.createdAt,
    }));

    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const markStoreTransferChatSeen = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await B2bStoreTransferOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canAccessOrder(req, order.toObject())) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const viewerModel = req.b2bActor?.model || 'User';
    const touched = markChatMessagesSeen(order, req.user._id, viewerModel);
    if (touched) {
      await order.save();
      const destWh = String(order.destWarehouseId || '');
      const requesterId = String(order.requestedBy || '');
      emitAdminChatUnreadChanged({
        channel: 'storeTransfer',
        orderId: String(order._id),
        action: 'seen',
      });
      emitCustomerChatUnreadChanged({
        channel: 'storeTransfer',
        orderId: String(order._id),
        action: 'seen',
        userId: requesterId,
        warehouseId: destWh,
      });
    }

    return res.status(200).json({ success: true, data: { updated: touched } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const postStoreTransferChatMessage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const text = String(req.body?.text || '').trim();
    const replyToMessageIdRaw = req.body?.replyToMessageId;
    const chatFiles = Array.isArray(req.files) ? req.files : [];
    const attachmentPaths = chatFiles.map((f) => `spo/${f.filename}`);

    if (!text && attachmentPaths.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message text or at least one attachment is required',
      });
    }
    if (text.length > 4000) return res.status(400).json({ success: false, message: 'Message too long' });

    const order = await B2bStoreTransferOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canAccessOrder(req, order.toObject())) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const actor = req.b2bActor;
    const rname = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      !!actor?.isSuperUser ||
      !!req.user?.is_superuser ||
      rname === 'admin' ||
      rname === 'super admin' ||
      rname === 'superuser';

    if ((order.status === 'REJECTED' || order.status === 'RECEIVED') && !isAdmin) {
      return res.status(400).json({ success: false, message: 'Chat closed for this order' });
    }
    const role = isAdmin ? 'admin' : 'user';
    const senderName =
      req.user.username || req.user.email || (isAdmin ? 'Admin' : 'User');

    let replyToMessageId = null;
    let replyToText = '';
    let replyToSenderName = '';
    if (replyToMessageIdRaw && isObjectId(replyToMessageIdRaw)) {
      const ref = order.chatMessages.id(replyToMessageIdRaw);
      if (ref) {
        replyToMessageId = ref._id;
        replyToSenderName = ref.senderName || (ref.role === 'admin' ? 'Admin' : 'User');
        const compact = String(ref.text || '').replace(/\s+/g, ' ').trim();
        replyToText =
          compact.length > MAX_REPLY_PREVIEW ? `${compact.slice(0, MAX_REPLY_PREVIEW)}...` : compact;
      }
    }

    const viewerModel = req.b2bActor?.model || 'User';
    order.chatMessages.push({
      text: text || (attachmentPaths.length ? '[attachment]' : ''),
      attachments: attachmentPaths,
      role,
      senderId: req.user._id,
      senderName,
      replyToMessageId,
      replyToText,
      replyToSenderName,
      seenBy: [{ userId: req.user._id, userModel: viewerModel, seenAt: new Date() }],
    });
    await order.save();
    const last = order.chatMessages[order.chatMessages.length - 1];
    const payload = {
      _id: last._id,
      text: last.text,
      attachments: Array.isArray(last.attachments) ? last.attachments : [],
      role: last.role,
      senderId: last.senderId,
      senderName: last.senderName,
      replyToMessageId: last.replyToMessageId || null,
      replyToText: last.replyToText || '',
      replyToSenderName: last.replyToSenderName || '',
      seenBy: Array.isArray(last.seenBy) ? last.seenBy : [],
      createdAt: last.createdAt,
    };

    emitB2bStoreTransferChatMessage(String(order._id), payload);
    const destWh = String(order.destWarehouseId || '');
    const requesterId = String(order.requestedBy || '');
    if (role === 'user') {
      emitAdminChatUnreadChanged({
        channel: 'storeTransfer',
        orderId: String(order._id),
        action: 'message',
      });
    } else if (role === 'admin') {
      emitCustomerChatUnreadChanged({
        channel: 'storeTransfer',
        orderId: String(order._id),
        action: 'message',
        userId: requesterId,
        warehouseId: destWh,
      });
    }

    return res.status(201).json({ success: true, data: payload });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /my-store-inventory
 * Returns SkuInventory (qty > 0) for the logged-in user's selected warehouse,
 * joined with Sku + VendorProduct details. Used for Store-to-Main transfer.
 */
const getMyStoreInventory = async (req, res) => {
  try {
    const warehouseId = resolveUserWarehouseId(req);

    if (!warehouseId || !isObjectId(warehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'No store warehouse selected. Please select a warehouse first.',
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    let pipeline = buildMyStoreInventoryBasePipeline(warehouseId);
    pipeline = applyMyStoreInventoryFilters(pipeline, req.query);

    pipeline.push({
      $addFields: {
        daysInStore: {
          $floor: {
            $divide: [{ $subtract: [new Date(), '$createdAt'] }, 86400000],
          },
        },
      },
    });

    const sortBy = String(req.query.sortBy || 'daysDesc');
    const minDays = Math.max(0, parseInt(req.query.minDays, 10) || 0);
    if (minDays > 0) {
      pipeline.push({ $match: { daysInStore: { $gte: minDays } } });
    }

    let sortStage;
    switch (sortBy) {
      case 'daysAsc':
        sortStage = { daysInStore: 1, 'skuDoc.sku': 1 };
        break;
      case 'sku':
        sortStage = { 'skuDoc.sku': 1 };
        break;
      case 'daysDesc':
      default:
        sortStage = { daysInStore: -1, 'skuDoc.sku': 1 };
        break;
    }

    const [countResult] = await SkuInventory.aggregate([...pipeline, { $count: 'total' }]);
    const total = countResult?.total || 0;

    pipeline = [
      ...pipeline,
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          availableQty: '$quantity',
          createdAt: 1,
          daysInStore: 1,
          skuId: '$skuDoc._id',
          sku: '$skuDoc.sku',
          price: '$skuDoc.price',
          tagPrice: '$skuDoc.tagPrice',
          currency: '$skuDoc.currency',
          metalColor: '$skuDoc.metalColor',
          metalType: '$skuDoc.metalType',
          size: '$skuDoc.size',
          images: '$skuDoc.images',
          gallery: '$skuDoc.gallery',
          attributes: '$skuDoc.attributes',
          productId: '$productDoc._id',
          vendorModel: '$productDoc.vendorModel',
          title: '$productDoc.title',
          brand: '$productDoc.brand',
          description: '$productDoc.description',
        },
      },
    ];

    const inventory = await SkuInventory.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      data: inventory,
      warehouseId,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
        hasNextPage: page * limit < total,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch store inventory',
    });
  }
};

/**
 * GET /my-store-inventory/facets
 * Distinct filter values for the user's store inventory.
 */
const getMyStoreInventoryFacets = async (req, res) => {
  try {
    const warehouseId = resolveUserWarehouseId(req);

    if (!warehouseId || !isObjectId(warehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'No store warehouse selected. Please select a warehouse first.',
      });
    }

    const pipeline = [
      ...buildMyStoreInventoryBasePipeline(warehouseId),
      {
        $facet: {
          metalColors: [
            { $match: { 'skuDoc.metalColor': { $nin: [null, ''] } } },
            { $group: { _id: '$skuDoc.metalColor' } },
            { $sort: { _id: 1 } },
          ],
          metalTypes: [
            { $match: { 'skuDoc.metalType': { $nin: [null, ''] } } },
            { $group: { _id: '$skuDoc.metalType' } },
            { $sort: { _id: 1 } },
          ],
          brands: [
            { $match: { 'productDoc.brand': { $nin: [null, ''] } } },
            { $group: { _id: '$productDoc.brand' } },
            { $sort: { _id: 1 } },
          ],
          styles: [
            { $match: { 'skuDoc.attributes.style': { $nin: [null, ''] } } },
            { $group: { _id: '$skuDoc.attributes.style' } },
            { $sort: { _id: 1 } },
          ],
          stoneTypes: [
            { $match: { 'skuDoc.attributes.stonetype': { $nin: [null, ''] } } },
            { $group: { _id: '$skuDoc.attributes.stonetype' } },
            { $sort: { _id: 1 } },
          ],
          vendors: [
            { $match: { 'skuDoc.attributes.vendor': { $nin: [null, ''] } } },
            { $group: { _id: '$skuDoc.attributes.vendor' } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ];

    const [facet] = await SkuInventory.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      data: {
        metalColors: sortFacetStrings((facet?.metalColors || []).map((x) => x?._id)),
        metalTypes: sortFacetStrings((facet?.metalTypes || []).map((x) => x?._id)),
        brands: sortFacetStrings((facet?.brands || []).map((x) => x?._id)),
        styles: sortFacetStrings((facet?.styles || []).map((x) => x?._id)),
        stoneTypes: sortFacetStrings((facet?.stoneTypes || []).map((x) => x?._id)),
        vendors: sortFacetStrings((facet?.vendors || []).map((x) => x?._id)),
      },
      warehouseId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch inventory facets',
    });
  }
};

/**
 * POST /batch
 * @deprecated — Redirects to the dedicated StoreToMain controller.
 * Kept for backward-compatibility; real logic now in storeToMainTransfer.controller.js
 */
const createBatchStoreTransferOrders = async (req, res) => {
  try {
    // Delegate to the new dedicated controller
    const { createBatchOrders } = require('./storeToMainTransfer.controller');
    return createBatchOrders(req, res);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Batch create failed' });
  }
};

const _createBatchStoreTransferOrders_LEGACY = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { items, destWarehouseId, receiptNumber, note } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    }
    if (!isObjectId(destWarehouseId)) {
      return res.status(400).json({ success: false, message: 'Destination warehouse is required' });
    }

    const selectedWarehouse = req.user?.selectedWarehouse
      ? String(req.user.selectedWarehouse)
      : null;
    const userWarehouses = Array.isArray(req.user?.warehouse)
      ? req.user.warehouse.map((w) => String(w._id || w))
      : [];
    const sourceWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!sourceWarehouseId || !isObjectId(sourceWarehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'No source store warehouse. Select a warehouse first.',
      });
    }
    if (String(sourceWarehouseId) === String(destWarehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'Source and destination warehouses must be different.',
      });
    }

    const created = [];
    const errors = [];

    for (const item of items) {
      try {
        const skuIdRaw = String(item.skuId || '').trim();
        if (!isObjectId(skuIdRaw)) {
          errors.push({ item, error: 'Invalid SKU ID' });
          continue;
        }
        const qty = parseInt(item.quantity ?? item.qty, 10);
        if (!Number.isFinite(qty) || qty < 1) {
          errors.push({ skuId: skuIdRaw, error: 'Quantity must be at least 1' });
          continue;
        }

        const sku = await Sku.findById(skuIdRaw).select('_id sku productId price currency').lean();
        if (!sku) {
          errors.push({ skuId: skuIdRaw, error: 'SKU not found' });
          continue;
        }

        const vendorProduct = await VendorProduct.findById(sku.productId)
          .select('_id vendorModel title')
          .lean();
        if (!vendorProduct) {
          errors.push({ skuId: skuIdRaw, sku: sku.sku, error: 'Product not found' });
          continue;
        }

        const available = await sumSkuInventory(sku._id, sourceWarehouseId, null);
        if (available < qty) {
          errors.push({
            skuId: skuIdRaw,
            sku: sku.sku,
            error: `Insufficient stock. Available: ${available}, requested: ${qty}`,
          });
          continue;
        }

        const unitPrice = Number(sku.price) || 0;
        const order = await B2bStoreTransferOrder.create({
          vendorProductId: vendorProduct._id,
          skuId: sku._id,
          sourceWarehouseId,
          destWarehouseId,
          quantity: qty,
          unitPrice,
          currency: sku.currency || 'USD',
          receiptNumber: String(receiptNumber || '').trim(),
          note: String(note || '').trim(),
          status: 'SUBMITTED',
          requestedBy: actor.id,
          requestedByModel: actor.model,
        });

        created.push({
          _id: order._id,
          ticketNumber: order.ticketNumber,
          sku: sku.sku,
          vendorModel: vendorProduct.vendorModel,
          quantity: qty,
          unitPrice,
          lineTotal: unitPrice * qty,
        });
      } catch (itemErr) {
        errors.push({ skuId: item?.skuId, error: itemErr.message });
      }
    }

    if (created.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No orders could be created',
        errors,
      });
    }

    return res.status(201).json({
      success: true,
      message: `${created.length} transfer request(s) submitted${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
      data: created,
      errors,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Batch create failed' });
  }
};

module.exports = {
  createStoreTransferOrder,
  listMyStoreTransferOrders,
  listAdminStoreTransferOrders,
  exportAdminStoreTransferOrdersCsv,
  getStoreTransferOrder,
  patchStoreTransferStatus,
  approveStoreTransferOrder,
  markStoreTransferReceived,
  listStoreTransferChatMessages,
  postStoreTransferChatMessage,
  markStoreTransferChatSeen,
  getMyStoreInventory,
  getMyStoreInventoryFacets,
  createBatchStoreTransferOrders,
};
