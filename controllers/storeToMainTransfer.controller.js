const mongoose = require('mongoose');
const StoreToMainTransfer = require('../models/storeToMainTransfer.model');
const Sku = require('../models/sku.model');
const VendorProduct = require('../models/vendorProduct.model');
const SkuInventory = require('../models/skuInventory.model');
const StoreInventory = require('../models/storeInventory.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const { sumSkuInventory, deductSkuInventory } = require('./v2B2B.controller');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

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

// ── CREATE (batch) ────────────────────────────────────────────────────────────

const createBatchOrders = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { items, destWarehouseId, receiptNumber, note } = req.body || {};

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    if (!isObjectId(destWarehouseId))
      return res.status(400).json({ success: false, message: 'Destination warehouse is required' });

    const selectedWarehouse = req.user?.selectedWarehouse
      ? String(req.user.selectedWarehouse)
      : null;
    const userWarehouses = Array.isArray(req.user?.warehouse)
      ? req.user.warehouse.map((w) => String(w._id || w))
      : [];
    const sourceWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!sourceWarehouseId || !isObjectId(sourceWarehouseId))
      return res.status(400).json({ success: false, message: 'No source store warehouse selected.' });
    if (String(sourceWarehouseId) === String(destWarehouseId))
      return res.status(400).json({ success: false, message: 'Source and destination warehouses must differ.' });

    const resolvedItems = [];
    const errors = [];

    for (const item of items) {
      try {
        const skuIdRaw = String(item.skuId || '').trim();
        if (!isObjectId(skuIdRaw)) { errors.push({ item, error: 'Invalid SKU ID' }); continue; }

        const qty = parseInt(item.quantity ?? item.qty, 10);
        if (!Number.isFinite(qty) || qty < 1) { errors.push({ skuId: skuIdRaw, error: 'Qty must be ≥ 1' }); continue; }

        const sku = await Sku.findById(skuIdRaw).select('_id sku productId price currency').lean();
        if (!sku) { errors.push({ skuId: skuIdRaw, error: 'SKU not found' }); continue; }

        const product = await VendorProduct.findById(sku.productId).select('_id vendorModel title').lean();
        if (!product) { errors.push({ skuId: skuIdRaw, sku: sku.sku, error: 'Product not found' }); continue; }

        const available = await sumSkuInventory(sku._id, sourceWarehouseId, null);
        if (available < qty) {
          errors.push({ skuId: skuIdRaw, sku: sku.sku, error: `Insufficient stock. Available: ${available}, requested: ${qty}` });
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
      } catch (e) {
        errors.push({ skuId: item?.skuId, error: e.message });
      }
    }

    if (resolvedItems.length === 0)
      return res.status(400).json({ success: false, message: 'No valid items', errors });

    const totalAmount = resolvedItems.reduce((s, i) => s + i.lineTotal, 0);

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
    return res.status(500).json({ success: false, message: error.message || 'Create failed' });
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
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });

    const { status, page = 1, limit = 25, sourceWarehouseId, search } = req.query;
    const skip = (Math.max(1, +page) - 1) * Math.min(100, Math.max(1, +limit));
    const lim = Math.min(100, Math.max(1, +limit));

    const filter = {};
    if (status) filter.status = String(status).toUpperCase();
    if (sourceWarehouseId && isObjectId(sourceWarehouseId))
      filter.sourceWarehouseId = new mongoose.Types.ObjectId(sourceWarehouseId);
    if (search) {
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ ticketNumber: rx }, { receiptNumber: rx }];
    }

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

// ── PATCH STATUS (admin) ──────────────────────────────────────────────────────

const patchStatus = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
    const { id } = req.params;
    const { status } = req.body || {};
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const { STATUSES } = require('../models/storeToMainTransfer.model');
    const valid = STATUSES.filter((s) => s !== 'APPROVED' && s !== 'REJECTED');
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
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin only' });
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const run = async (session) => {
      const q = StoreToMainTransfer.findById(id);
      if (session) q.session(session);
      const doc = await q;
      if (!doc) throw new Error('Transfer not found');
      if (doc.inventoryAppliedAt || doc.status === 'APPROVED')
        throw new Error('Already approved');
      if (doc.status === 'REJECTED')
        throw new Error('Cannot approve a rejected transfer');

      const now = new Date();
      let grandTotal = 0;

      for (const item of doc.items) {
        if (item.inventoryAppliedAt) continue; // idempotent per item

        // 1. Deduct from source (user's store)
        await deductSkuInventory({
          skuId: item.skuId,
          warehouseId: doc.sourceWarehouseId,
          quantity: item.quantity,
          session,
        });

        // 2. Add to destination (main store) SkuInventory
        await incrementSkuInventory({
          skuId: item.skuId,
          warehouseId: doc.destWarehouseId,
          quantity: item.quantity,
          session,
        });

        // 3. Add to destination StoreInventory
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
        grandTotal += item.lineTotal || (item.unitPrice || 0) * item.quantity;
      }

      // 4. Wallet: DEST (main store) pays SOURCE (user's store)
      if (grandTotal > 0) {
        const destWalletQ = InventoryWallet.findOne({ warehouse: doc.destWarehouseId });
        if (session) destWalletQ.session(session);
        const destWallet = await destWalletQ;
        if (!destWallet) throw new Error('Main store wallet not found');
        if (destWallet.balance < grandTotal)
          throw new Error(`Insufficient main store wallet. Balance: ${destWallet.balance.toFixed(2)}, required: ${grandTotal.toFixed(2)}`);
        destWallet.balance -= grandTotal;
        destWallet.lastTransaction = now;
        await destWallet.save(session ? { session } : {});

        const srcWalletQ = InventoryWallet.findOne({ warehouse: doc.sourceWarehouseId });
        if (session) srcWalletQ.session(session);
        const srcWallet = await srcWalletQ;
        if (!srcWallet) throw new Error('Source store wallet not found');
        srcWallet.balance += grandTotal;
        srcWallet.lastTransaction = now;
        await srcWallet.save(session ? { session } : {});
      }

      doc.status = 'APPROVED';
      doc.inventoryAppliedAt = now;
      doc.approvedBy = req.user?._id || null;
      doc.approvedAt = now;
      await doc.save(session ? { session } : {});
      return doc;
    };

    let finalDoc;
    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => { finalDoc = await run(session); });
      } finally {
        session.endSession();
      }
    } catch (txErr) {
      const msg = String(txErr?.message || '');
      if (msg.includes('Transaction numbers are only allowed') || msg.includes('replica set')) {
        finalDoc = await run(null);
      } else throw txErr;
    }

    // rebuild Redis caches for all affected SKUs
    for (const item of finalDoc.items) {
      await rebuildCaches(item.skuId).catch(() => {});
    }

    const populated = await populateQuery(StoreToMainTransfer.findById(finalDoc._id)).lean();
    return res.status(200).json({ success: true, message: 'Approved — stock and wallet updated', data: populated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Approve failed' });
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
    if (['APPROVED', 'REJECTED'].includes(doc.status))
      return res.status(400).json({ success: false, message: `Cannot reject — status is ${doc.status}` });

    doc.status = 'REJECTED';
    doc.rejection = {
      reason: String(reason || '').trim(),
      rejectedAt: new Date(),
      rejectedBy: req.user?._id || null,
    };
    await doc.save();

    return res.status(200).json({ success: true, message: 'Rejected', data: doc });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createBatchOrders,
  listMyOrders,
  listAdminOrders,
  getOrder,
  patchStatus,
  approveOrder,
  rejectOrder,
};
