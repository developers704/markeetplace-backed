const mongoose = require('mongoose');
const B2bStoreTransferOrder = require('../models/b2bStoreTransferOrder.model');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const StoreInventory = require('../models/storeInventory.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const { sumSkuInventory, deductSkuInventory } = require('./v2B2B.controller');
const { emitB2bStoreTransferChatMessage } = require('../socket/b2bStoreTransferChat.socket');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());
const MAX_REPLY_PREVIEW = 88;

function getRequesterId(order) {
  const rb = order.requestedBy;
  if (!rb) return '';
  return String(rb._id || rb);
}

function canAccessOrder(req, orderLean) {
  if (!orderLean) return false;
  const actor = req.b2bActor;
  const role = String(actor?.roleName || '').toLowerCase().trim();
  if (actor?.isSuperUser || role === 'admin' || role === 'super admin' || role === 'superuser') return true;
  if (req.user?.is_superuser) return true;
  return getRequesterId(orderLean) === String(req.user._id);
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

const createStoreTransferOrder = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { vendorProductId, skuId, quantity, sourceWarehouseId, destWarehouseId } = req.body || {};

    if (!isObjectId(vendorProductId) || !isObjectId(skuId) || !isObjectId(sourceWarehouseId)) {
      return res.status(400).json({ success: false, message: 'vendorProductId, skuId, and sourceWarehouseId are required' });
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

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    const [vendorProduct, sku] = await Promise.all([
      VendorProduct.findById(vendorProductId).select('_id vendorModel title').lean(),
      Sku.findById(skuId).select('_id sku productId price currency').lean(),
    ]);

    if (!vendorProduct) return res.status(404).json({ success: false, message: 'Product not found' });
    if (!sku) return res.status(404).json({ success: false, message: 'SKU not found' });
    if (String(sku.productId) !== String(vendorProduct._id)) {
      return res.status(400).json({ success: false, message: 'SKU does not belong to this product' });
    }

    const available = await sumSkuInventory(sku._id, sourceWarehouseId, null);
    if (available < qty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock at source warehouse. Available=${available}, requested=${qty}`,
      });
    }

    const unitPrice = Number(sku.price) || 0;
    const lineTotal = unitPrice * qty;
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
      quantity: qty,
      unitPrice,
      currency: sku.currency || 'USD',
      status: 'SUBMITTED',
      requestedBy: actor.id,
      requestedByModel: actor.model,
    });

    const populated = await B2bStoreTransferOrder.findById(order._id)
      .populate('vendorProductId', 'vendorModel title brand')
      .populate('skuId', 'sku price currency metalColor metalType size images')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .lean();

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
    const rows = await B2bStoreTransferOrder.find({ requestedBy: actor.id })
      .sort({ createdAt: -1 })
      .populate('vendorProductId', 'vendorModel title')
      .populate('skuId', 'sku price images')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .lean();

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const listAdminStoreTransferOrders = async (req, res) => {
  try {
    const status = req.query.status;
    const filter = {};
    if (status && String(status).trim()) {
      filter.status = String(status).trim().toUpperCase();
    }

    const rows = await B2bStoreTransferOrder.find(filter)
      .sort({ createdAt: -1 })
      .populate('vendorProductId', 'vendorModel title brand')
      .populate('skuId', 'sku price currency metalColor metalType size')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .populate('requestedBy', 'username email')
      .lean();

    return res.status(200).json({ success: true, data: rows });
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
    const isAdmin = actor.isSuperUser || role === 'admin' || role === 'super admin';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const nextStatus = String(req.body?.status || '').trim().toUpperCase();
    const reason = String(req.body?.reason || '').trim();
    const allowed = ['WIP', 'TRANSFER', 'DELIVERED', 'REJECTED'];
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: `Invalid status. Use one of: ${allowed.join(', ')}` });
    }

    const order = await B2bStoreTransferOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    if (order.status === 'RECEIVED' || order.status === 'REJECTED') {
      return res.status(400).json({ success: false, message: 'Order is closed' });
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
    const isAdmin = actor.isSuperUser || role === 'admin' || role === 'super admin';
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

    const order = await B2bStoreTransferOrder.findById(id).select('requestedBy chatMessages status').lean();
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canAccessOrder(req, order)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.status(200).json({ success: true, data: order.chatMessages || [] });
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
    if (!text) return res.status(400).json({ success: false, message: 'Message required' });
    if (text.length > 4000) return res.status(400).json({ success: false, message: 'Message too long' });

    const order = await B2bStoreTransferOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canAccessOrder(req, order.toObject())) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (order.status === 'REJECTED' || order.status === 'RECEIVED') {
      return res.status(400).json({ success: false, message: 'Chat closed for this order' });
    }

    const actor = req.b2bActor;
    const rname = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      !!actor?.isSuperUser ||
      !!req.user?.is_superuser ||
      rname === 'admin' ||
      rname === 'super admin' ||
      rname === 'superuser';
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

    order.chatMessages.push({
      text,
      role,
      senderId: req.user._id,
      senderName,
      replyToMessageId,
      replyToText,
      replyToSenderName,
    });
    await order.save();
    const last = order.chatMessages[order.chatMessages.length - 1];
    const payload = {
      _id: last._id,
      text: last.text,
      role: last.role,
      senderId: last.senderId,
      senderName: last.senderName,
      replyToMessageId: last.replyToMessageId || null,
      replyToText: last.replyToText || '',
      replyToSenderName: last.replyToSenderName || '',
      createdAt: last.createdAt,
    };

    emitB2bStoreTransferChatMessage(String(order._id), payload);

    return res.status(201).json({ success: true, data: payload });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createStoreTransferOrder,
  listMyStoreTransferOrders,
  listAdminStoreTransferOrders,
  getStoreTransferOrder,
  patchStoreTransferStatus,
  approveStoreTransferOrder,
  markStoreTransferReceived,
  listStoreTransferChatMessages,
  postStoreTransferChatMessage,
};
