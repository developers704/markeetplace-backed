const mongoose = require('mongoose');
const StoreToMainTransfer = require('../models/storeToMainTransfer.model');
const Sku = require('../models/sku.model');
const VendorProduct = require('../models/vendorProduct.model');
const SkuInventory = require('../models/skuInventory.model');
const StoreInventory = require('../models/storeInventory.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const { sumSkuInventory, deductSkuInventory } = require('./v2B2B.controller');

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

// ── helpers ──────────────────────────────────────────────────────────────────

function isAdmin(req) {
  const actor = req.b2bActor;
  const role = String(actor?.roleName || '').toLowerCase().trim();
  return (
    actor?.isSuperUser ||
    role === 'admin' ||
    role === 'super admin' ||
    role === 'superuser' ||
    !!req.user?.is_superuser
  );
}

async function incrementSkuInventory({ skuId, warehouseId, quantity, session }) {
  const filter = {
    skuId: new mongoose.Types.ObjectId(String(skuId)),
    warehouse: new mongoose.Types.ObjectId(String(warehouseId)),
    city: null,
  };
  const opts = { upsert: true };
  if (session) opts.session = session;
  await SkuInventory.updateOne(
    filter,
    { $inc: { quantity }, $setOnInsert: { city: null } },
    opts,
  );
}

async function rebuildCaches(skuId) {
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
    console.error('[storeToMain] rebuildCaches', e.message);
  }
}

function populateQuery(q) {
  return q
    .populate('sourceWarehouseId', 'name')
    .populate('destWarehouseId', 'name')
    .populate('requestedBy', 'username userId')
    .populate('approvedBy', 'username userId')
    .populate('items.skuId', 'sku price tagPrice currency images gallery metalColor metalType size attributes')
    .populate('items.vendorProductId', 'vendorModel title brand description');
}

function getItemState(item) {
  if (item.rejectedAt) return 'REJECTED';
  if (item.receivedAt) return 'RECEIVED';
  if (item.inventoryAppliedAt) return 'APPROVED';
  return 'PENDING';
}

function syncOrderStatus(doc, { userId } = {}) {
  const states = doc.items.map(getItemState);
  const now = new Date();
  const allRejected = states.every((s) => s === 'REJECTED');
  const anyPending = states.some((s) => s === 'PENDING');
  const anyApproved = states.some((s) => s === 'APPROVED');
  const actionable = states.filter((s) => s !== 'REJECTED');
  const allActionableReceived =
    actionable.length > 0 && actionable.every((s) => s === 'RECEIVED');

  if (allRejected) {
    doc.status = 'REJECTED';
    if (!doc.rejection?.rejectedAt) {
      doc.rejection = {
        reason: doc.rejection?.reason || '',
        rejectedAt: now,
        rejectedBy: userId || doc.rejection?.rejectedBy || null,
      };
    }
    return;
  }

  if (allActionableReceived) {
    doc.status = 'RECEIVED';
    return;
  }

  if (!anyPending && (anyApproved || states.some((s) => s === 'RECEIVED'))) {
    doc.status = 'APPROVED';
    if (!doc.inventoryAppliedAt) doc.inventoryAppliedAt = now;
    doc.approvedBy = doc.approvedBy || userId || null;
    doc.approvedAt = doc.approvedAt || now;
  }
}

async function applyWalletTransfer({ doc, amount, session, now }) {
  if (amount <= 0) return;

  const destWalletQ = InventoryWallet.findOne({ warehouse: doc.destWarehouseId });
  if (session) destWalletQ.session(session);
  const destWallet = await destWalletQ;
  if (!destWallet) throw new Error('Main store wallet not found');
  if (destWallet.balance < amount) {
    throw new Error(
      `Insufficient main store wallet. Balance: ${destWallet.balance.toFixed(2)}, required: ${amount.toFixed(2)}`,
    );
  }
  destWallet.balance -= amount;
  destWallet.lastTransaction = now;
  await destWallet.save(session ? { session } : {});

  const srcWalletQ = InventoryWallet.findOne({ warehouse: doc.sourceWarehouseId });
  if (session) srcWalletQ.session(session);
  const srcWallet = await srcWalletQ;
  if (!srcWallet) throw new Error('Source store wallet not found');
  srcWallet.balance += amount;
  srcWallet.lastTransaction = now;
  await srcWallet.save(session ? { session } : {});
}

async function applyItemApproval({ doc, item, session, now }) {
  if (item.inventoryAppliedAt) return 0;
  if (item.rejectedAt) {
    throw new Error(`SKU ${item.skuCode || item._id} is already rejected`);
  }

  await deductSkuInventory({
    skuId: item.skuId,
    warehouseId: doc.sourceWarehouseId,
    quantity: item.quantity,
    session,
  });

  await incrementSkuInventory({
    skuId: item.skuId,
    warehouseId: doc.destWarehouseId,
    quantity: item.quantity,
    session,
  });

  const storeOpts = session ? { upsert: true, session } : { upsert: true };
  await StoreInventory.updateOne(
    {
      storeWarehouseId: doc.destWarehouseId,
      storeId: doc.destWarehouseId,
      vendorProductId: item.vendorProductId,
      skuId: item.skuId,
    },
    { $inc: { quantity: item.quantity } },
    storeOpts,
  );

  item.inventoryAppliedAt = now;
  return item.lineTotal || (item.unitPrice || 0) * item.quantity;
}

function resolveItemsByIds(doc, itemIds) {
  const idSet = new Set(itemIds.map((id) => String(id)));
  const matched = doc.items.filter((item) => idSet.has(String(item._id)));
  if (matched.length === 0) throw new Error('No matching items found');
  if (matched.length !== idSet.size) throw new Error('One or more item ids are invalid');
  return matched;
}

async function runWithOptionalTransaction(run) {
  let finalDoc;
  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        finalDoc = await run(session);
      });
    } finally {
      session.endSession();
    }
  } catch (txErr) {
    const msg = String(txErr?.message || '');
    if (msg.includes('Transaction numbers are only allowed') || msg.includes('replica set')) {
      finalDoc = await run(null);
    } else {
      throw txErr;
    }
  }
  return finalDoc;
}

// ── CREATE (batch) ────────────────────────────────────────────────────────────

const createBatchOrders = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { items, destWarehouseId, receiptNumber, note } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item is required',
      });
    }

    if (!isObjectId(destWarehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'Destination warehouse is required',
      });
    }

    const selectedWarehouse = req.user?.selectedWarehouse
      ? String(req.user.selectedWarehouse?._id || req.user.selectedWarehouse)
      : null;

    const userWarehouses = Array.isArray(req.user?.warehouse)
      ? req.user.warehouse.map((w) => String(w?._id || w))
      : [];

    const sourceWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!sourceWarehouseId || !isObjectId(sourceWarehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'No source store warehouse selected.',
      });
    }

    if (String(sourceWarehouseId) === String(destWarehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'Source and destination warehouses must differ.',
      });
    }

    const errors = [];
    const normalizedItems = [];

    for (const item of items) {
      const skuIdRaw = String(item?.skuId || '').trim();
      const qty = parseInt(item?.quantity ?? item?.qty, 10);

      if (!isObjectId(skuIdRaw)) {
        errors.push({ item, error: 'Invalid SKU ID' });
        continue;
      }

      if (!Number.isFinite(qty) || qty < 1) {
        errors.push({ skuId: skuIdRaw, error: 'Qty must be ≥ 1' });
        continue;
      }

      normalizedItems.push({
        skuId: skuIdRaw,
        quantity: qty,
      });
    }

    if (normalizedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items',
        errors,
      });
    }

    // Merge duplicate SKU quantities
    const qtyBySkuId = new Map();

    normalizedItems.forEach((item) => {
      qtyBySkuId.set(
        item.skuId,
        (qtyBySkuId.get(item.skuId) || 0) + Number(item.quantity || 0)
      );
    });

    const skuIds = Array.from(qtyBySkuId.keys());

    // Bulk fetch SKUs
    const skus = await Sku.find({
      _id: { $in: skuIds },
    })
      .select('_id sku productId price currency')
      .lean();

    const skuMap = new Map(skus.map((s) => [String(s._id), s]));

    // Missing SKUs
    skuIds.forEach((skuId) => {
      if (!skuMap.has(String(skuId))) {
        errors.push({
          skuId,
          error: 'SKU not found',
        });
      }
    });

    const validSkus = skus.filter((sku) => sku?.productId);

    // Bulk fetch products
    const productIds = [
      ...new Set(validSkus.map((sku) => String(sku.productId)).filter(Boolean)),
    ];

    const products = productIds.length
      ? await VendorProduct.find({
          _id: { $in: productIds },
        })
          .select('_id vendorModel title')
          .lean()
      : [];

    const productMap = new Map(products.map((p) => [String(p._id), p]));

    // Bulk fetch inventory for selected source warehouse
    const inventories = await SkuInventory.find({
      skuId: { $in: skuIds },
      warehouse: sourceWarehouseId,
    })
      .select('skuId quantity')
      .lean();

    const inventoryMap = new Map();

    inventories.forEach((inv) => {
      const key = String(inv.skuId);
      inventoryMap.set(key, (inventoryMap.get(key) || 0) + Number(inv.quantity || 0));
    });

    const resolvedItems = [];

    for (const skuId of skuIds) {
      const sku = skuMap.get(String(skuId));
      if (!sku) continue;

      const product = productMap.get(String(sku.productId));

      if (!product) {
        errors.push({
          skuId,
          sku: sku.sku,
          error: 'Product not found',
        });
        continue;
      }

      const qty = Number(qtyBySkuId.get(String(skuId)) || 0);
      const available = Number(inventoryMap.get(String(skuId)) || 0);

      if (available < qty) {
        errors.push({
          skuId,
          sku: sku.sku,
          error: `Insufficient stock. Available: ${available}, requested: ${qty}`,
        });
        continue;
      }

      const unitPrice = Number(sku.price) || 0;

      resolvedItems.push({
        skuId: sku._id,
        vendorProductId: product._id,
        skuCode: sku.sku,
        vendorModel: product.vendorModel || '',
        quantity: qty,
        unitPrice,
        currency: sku.currency || 'USD',
        lineTotal: unitPrice * qty,
      });
    }

    if (resolvedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items',
        errors,
      });
    }

    const totalAmount = resolvedItems.reduce(
      (sum, item) => sum + Number(item.lineTotal || 0),
      0
    );

    const transfer = await StoreToMainTransfer.create({
      sourceWarehouseId,
      destWarehouseId,
      items: resolvedItems,
      totalAmount,
      receiptNumber: String(receiptNumber || '').trim(),
      note: String(note || '').trim(),
      status: 'SUBMITTED',
      requestedBy: actor.id,
      requestedByModel: actor.model,
    });

    return res.status(201).json({
      success: true,
      message: `Transfer request submitted${errors.length ? `, ${errors.length} items skipped` : ''}`,
      data: {
        _id: transfer._id,
        ticketNumber: transfer.ticketNumber,
        totalAmount,
        itemCount: resolvedItems.length,
      },
      errors,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Create failed',
    });
  }
};

// ── LIST (user's own) ─────────────────────────────────────────────────────────

const listMyOrders = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { status, page = 1, limit = 25 } = req.query;
    const skip = (Math.max(1, +page) - 1) * Math.min(100, Math.max(1, +limit));
    const lim = Math.min(100, Math.max(1, +limit));

    const filter = { requestedBy: actor.id };
    if (status) filter.status = String(status).toUpperCase();

    const [rows, total] = await Promise.all([
      populateQuery(StoreToMainTransfer.find(filter))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      StoreToMainTransfer.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: { total, page: +page, limit: lim, totalPages: Math.ceil(total / lim), hasNextPage: skip + lim < total },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── LIST (admin) ──────────────────────────────────────────────────────────────

const listAdminOrders = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { status, page = 1, limit = 25, sourceWarehouseId, search } = req.query;
    const skip = (Math.max(1, +page) - 1) * Math.min(100, Math.max(1, +limit));
    const lim = Math.min(100, Math.max(1, +limit));

    const filter = {};

    if (status) filter.status = String(status).toUpperCase();

    if (sourceWarehouseId && isObjectId(sourceWarehouseId)) {
      filter.sourceWarehouseId = new mongoose.Types.ObjectId(sourceWarehouseId);
    }

    if (search) {
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ ticketNumber: rx }, { receiptNumber: rx }];
    }
    applyCreatedAtRangeFilter(filter, req.query);

    const [rows, total] = await Promise.all([
      StoreToMainTransfer.find(filter)
        .select('ticketNumber sourceWarehouseId destWarehouseId requestedBy requestedByModel totalAmount status createdAt items')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .populate('sourceWarehouseId', 'name')
        .populate('destWarehouseId', 'name')
        .populate('requestedBy', 'username userId')
        .lean(),

      StoreToMainTransfer.countDocuments(filter),
    ]);

    const data = rows.map((row) => ({
      _id: row._id,
      ticketNumber: row.ticketNumber,
      sourceWarehouseId: row.sourceWarehouseId,
      destWarehouseId: row.destWarehouseId,
      requestedBy: row.requestedBy,
      totalAmount: row.totalAmount,
      status: row.status,
      createdAt: row.createdAt,
      itemCount: Array.isArray(row.items) ? row.items.length : 0,
    }));

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page: +page,
        limit: lim,
        totalPages: Math.ceil(total / lim),
        hasNextPage: skip + lim < total,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET SINGLE ────────────────────────────────────────────────────────────────

const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await populateQuery(StoreToMainTransfer.findById(id)).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    // access check: admin or requester
    if (!isAdmin(req) && String(order.requestedBy?._id || order.requestedBy) !== String(req.user?._id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getOrderItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    if (!isObjectId(id) || !isObjectId(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const order = await populateQuery(StoreToMainTransfer.findById(id)).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    if (!isAdmin(req) && String(order.requestedBy?._id || order.requestedBy) !== String(req.user?._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const item = (order.items || []).find((it) => String(it._id) === String(itemId));
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PATCH STATUS (admin) ──────────────────────────────────────────────────────

const patchStatus = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
    const { id } = req.params;
    const { status } = req.body || {};
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const { STATUSES } = require('../models/storeToMainTransfer.model');
    const valid = STATUSES.filter((s) => s !== 'APPROVED' && s !== 'REJECTED' && s !== 'RECEIVED');
    if (!valid.includes(String(status || '').toUpperCase()))
      return res.status(400).json({ success: false, message: `Status must be one of: ${valid.join(', ')}` });

    const order = await StoreToMainTransfer.findByIdAndUpdate(
      id,
      { status: String(status).toUpperCase() },
      { new: true },
    );
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── APPROVE ───────────────────────────────────────────────────────────────────

const approveOrder = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { id } = req.params;

    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const now = new Date();
    let approvedSkuIds = [];
    let finalDocId = null;

    const finalDoc = await runWithOptionalTransaction(async (session) => {
      const q = StoreToMainTransfer.findById(id);
      if (session) q.session(session);

      const doc = await q;
      if (!doc) throw new Error('Transfer not found');

      const pending = doc.items.filter((item) => getItemState(item) === 'PENDING');
      if (pending.length === 0) throw new Error('No pending items to approve');

      const walletTotal = pending.reduce((sum, item) => {
        return sum + Number(item.lineTotal || (Number(item.unitPrice || 0) * Number(item.quantity || 0)));
      }, 0);

      const sourceWarehouseId = new mongoose.Types.ObjectId(String(doc.sourceWarehouseId));
      const destWarehouseId = new mongoose.Types.ObjectId(String(doc.destWarehouseId));

      const sourceInventoryOps = [];
      const destInventoryOps = [];
      const storeInventoryOps = [];

      for (const item of pending) {
        if (item.rejectedAt) {
          throw new Error(`SKU ${item.skuCode || item._id} is already rejected`);
        }

        const skuObjectId = new mongoose.Types.ObjectId(String(item.skuId));
        const vendorProductObjectId = new mongoose.Types.ObjectId(String(item.vendorProductId));
        const qty = Number(item.quantity || 0);

        if (!qty || qty < 1) continue;

        sourceInventoryOps.push({
          updateOne: {
            filter: {
              skuId: skuObjectId,
              warehouse: sourceWarehouseId,
              city: null,
              quantity: { $gte: qty },
            },
            update: {
              $inc: { quantity: -qty },
            },
          },
        });

        destInventoryOps.push({
          updateOne: {
            filter: {
              skuId: skuObjectId,
              warehouse: destWarehouseId,
              city: null,
            },
            update: {
              $inc: { quantity: qty },
              $setOnInsert: { city: null },
            },
            upsert: true,
          },
        });

        storeInventoryOps.push({
          updateOne: {
            filter: {
              storeWarehouseId: destWarehouseId,
              storeId: destWarehouseId,
              vendorProductId: vendorProductObjectId,
              skuId: skuObjectId,
            },
            update: {
              $inc: { quantity: qty },
            },
            upsert: true,
          },
        });

        item.inventoryAppliedAt = now;
        approvedSkuIds.push(String(item.skuId));
      }

      if (sourceInventoryOps.length > 0) {
        const sourceResult = await SkuInventory.bulkWrite(
          sourceInventoryOps,
          session ? { session, ordered: true } : { ordered: true }
        );

        const matched =
          sourceResult.modifiedCount ??
          sourceResult.nModified ??
          sourceResult.matchedCount ??
          0;

        if (matched < sourceInventoryOps.length) {
          throw new Error('Insufficient source stock for one or more items');
        }
      }

      if (destInventoryOps.length > 0) {
        await SkuInventory.bulkWrite(
          destInventoryOps,
          session ? { session, ordered: false } : { ordered: false }
        );
      }

      if (storeInventoryOps.length > 0) {
        await StoreInventory.bulkWrite(
          storeInventoryOps,
          session ? { session, ordered: false } : { ordered: false }
        );
      }

      if (walletTotal > 0) {
        const destWalletQ = InventoryWallet.findOne({
          warehouse: doc.destWarehouseId,
          balance: { $gte: walletTotal },
        });
        if (session) destWalletQ.session(session);

        const destWallet = await destWalletQ;
        if (!destWallet) {
          throw new Error(`Insufficient main store wallet. Required: ${walletTotal.toFixed(2)}`);
        }

        await InventoryWallet.updateOne(
          { _id: destWallet._id },
          {
            $inc: { balance: -walletTotal },
            $set: { lastTransaction: now },
          },
          session ? { session } : {}
        );

        await InventoryWallet.updateOne(
          { warehouse: doc.sourceWarehouseId },
          {
            $inc: { balance: walletTotal },
            $set: { lastTransaction: now },
          },
          session ? { session } : {}
        );
      }

      syncOrderStatus(doc, { userId: req.user?._id });
      await doc.save(session ? { session } : {});

      finalDocId = doc._id;
      return doc;
    });

    res.status(200).json({
      success: true,
      message: 'Approved — stock and wallet updated',
      data: {
        _id: finalDoc._id,
        ticketNumber: finalDoc.ticketNumber,
        status: finalDoc.status,
        approvedItems: approvedSkuIds.length,
      },
    });

    setImmediate(() => {
      [...new Set(approvedSkuIds)].forEach((skuId) => {
        rebuildCaches(skuId).catch(() => {});
      });
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Approve failed',
    });
  }
};

const approveItems = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
    const { id } = req.params;
    const { itemIds } = req.body || {};
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ success: false, message: 'itemIds array is required' });
    }

    const finalDoc = await runWithOptionalTransaction(async (session) => {
      const q = StoreToMainTransfer.findById(id);
      if (session) q.session(session);
      const doc = await q;
      if (!doc) throw new Error('Transfer not found');

      const targets = resolveItemsByIds(doc, itemIds);
      const now = new Date();
      let walletTotal = 0;
      for (const item of targets) {
        walletTotal += await applyItemApproval({ doc, item, session, now });
      }

      await applyWalletTransfer({ doc, amount: walletTotal, session, now });
      syncOrderStatus(doc, { userId: req.user?._id });
      await doc.save(session ? { session } : {});
      return doc;
    });

    for (const item of finalDoc.items) {
      if (item.inventoryAppliedAt) await rebuildCaches(item.skuId).catch(() => {});
    }

    const populated = await populateQuery(StoreToMainTransfer.findById(finalDoc._id)).lean();
    return res.status(200).json({
      success: true,
      message: `${itemIds.length} item(s) approved`,
      data: populated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Item approve failed' });
  }
};

// ── REJECT ────────────────────────────────────────────────────────────────────

const rejectOrder = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const doc = await StoreToMainTransfer.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    const pending = doc.items.filter((item) => getItemState(item) === 'PENDING');
    if (pending.length === 0) {
      return res.status(400).json({ success: false, message: 'No pending items to reject' });
    }

    const now = new Date();
    const reasonText = String(reason || '').trim();
    for (const item of pending) {
      item.rejectedAt = now;
      item.rejectionReason = reasonText;
    }

    doc.rejection = {
      reason: reasonText,
      rejectedAt: now,
      rejectedBy: req.user?._id || null,
    };
    syncOrderStatus(doc, { userId: req.user?._id });
    await doc.save();

    const populated = await populateQuery(StoreToMainTransfer.findById(doc._id)).lean();
    return res.status(200).json({ success: true, message: 'Rejected', data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const rejectItems = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
    const { id } = req.params;
    const { itemIds, reason } = req.body || {};
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ success: false, message: 'itemIds array is required' });
    }

    const doc = await StoreToMainTransfer.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    const targets = resolveItemsByIds(doc, itemIds);
    const now = new Date();
    const reasonText = String(reason || '').trim();

    for (const item of targets) {
      if (item.inventoryAppliedAt) {
        throw new Error(`SKU ${item.skuCode || item._id} is already approved`);
      }
      if (item.rejectedAt) continue;
      item.rejectedAt = now;
      item.rejectionReason = reasonText;
    }

    syncOrderStatus(doc, { userId: req.user?._id });
    if (!doc.rejection?.rejectedAt && doc.items.every((item) => getItemState(item) === 'REJECTED')) {
      doc.rejection = {
        reason: reasonText,
        rejectedAt: now,
        rejectedBy: req.user?._id || null,
      };
    }

    await doc.save();
    const populated = await populateQuery(StoreToMainTransfer.findById(doc._id)).lean();
    return res.status(200).json({
      success: true,
      message: `${itemIds.length} item(s) rejected`,
      data: populated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Item reject failed' });
  }
};

const markItemsReceived = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
    const { id } = req.params;
    const { itemIds } = req.body || {};
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ success: false, message: 'itemIds array is required' });
    }

    const doc = await StoreToMainTransfer.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    const targets = resolveItemsByIds(doc, itemIds);
    const now = new Date();
    let marked = 0;

    for (const item of targets) {
      if (!item.inventoryAppliedAt) {
        throw new Error(`SKU ${item.skuCode || item._id} must be approved before marking received`);
      }
      if (item.rejectedAt) {
        throw new Error(`SKU ${item.skuCode || item._id} is rejected`);
      }
      if (item.receivedAt) continue;
      item.receivedAt = now;
      marked += 1;
    }

    syncOrderStatus(doc, { userId: req.user?._id });
    await doc.save();

    const populated = await populateQuery(StoreToMainTransfer.findById(doc._id)).lean();
    return res.status(200).json({
      success: true,
      message: `${marked} item(s) marked as inventory received`,
      data: populated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Receive failed' });
  }
};

const receiveAllApproved = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const doc = await StoreToMainTransfer.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    const now = new Date();
    let marked = 0;

    for (const item of doc.items) {
      if (!item.inventoryAppliedAt || item.rejectedAt || item.receivedAt) continue;
      item.receivedAt = now;
      marked += 1;
    }

    if (marked === 0) {
      return res.status(400).json({ success: false, message: 'No approved items awaiting receive' });
    }

    syncOrderStatus(doc, { userId: req.user?._id });
    await doc.save();

    const populated = await populateQuery(StoreToMainTransfer.findById(doc._id)).lean();
    return res.status(200).json({
      success: true,
      message: `${marked} item(s) marked as inventory received`,
      data: populated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Receive failed' });
  }
};

module.exports = {
  createBatchOrders,
  listMyOrders,
  listAdminOrders,
  getOrder,
  getOrderItem,
  patchStatus,
  approveOrder,
  approveItems,
  rejectOrder,
  rejectItems,
  markItemsReceived,
  receiveAllApproved,
};
