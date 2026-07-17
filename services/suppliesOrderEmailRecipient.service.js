const mongoose = require('mongoose');
const Warehouse = require('../models/warehouse.model');
const SuppliesOrderEmailRecipient = require('../models/suppliesOrderEmailRecipient.model');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

async function upsertSystemRecipient({ warehouseId, role, userId, userModel, isAdmin = false }) {
  const filter = {
    warehouseId,
    role,
    userId: userId || null,
  };

  const existing = await SuppliesOrderEmailRecipient.findOne(filter).lean();
  if (existing) {
    const updates = {};
    if (userId && String(existing.userId || '') !== String(userId)) {
      updates.userId = userId;
      updates.userModel = userModel || null;
    }
    if (Object.keys(updates).length) {
      await SuppliesOrderEmailRecipient.updateOne({ _id: existing._id }, { $set: updates });
    }
    return existing;
  }

  return SuppliesOrderEmailRecipient.create({
    warehouseId,
    role,
    userId: userId || null,
    userModel: userId ? userModel || null : null,
    isActive: true,
    isAdmin,
  });
}

async function syncWarehouseEmailRecipients(warehouseId) {
  if (!isObjectId(warehouseId)) return [];

  const warehouse = await Warehouse.findById(warehouseId)
    .select('name storeEmail districtManager corporateManager')
    .lean();
  if (!warehouse) return [];

  const whId = warehouse._id;

  await upsertSystemRecipient({
    warehouseId: whId,
    role: 'REQUESTER',
    userId: null,
  });

  if (warehouse.districtManager) {
    await upsertSystemRecipient({
      warehouseId: whId,
      role: 'DM',
      userId: warehouse.districtManager,
      userModel: 'Customer',
    });
  }

  if (warehouse.corporateManager) {
    await upsertSystemRecipient({
      warehouseId: whId,
      role: 'CM',
      userId: warehouse.corporateManager,
      userModel: 'Customer',
    });
  }

  if (String(warehouse.storeEmail || '').trim()) {
    await upsertSystemRecipient({
      warehouseId: whId,
      role: 'STORE_EMAIL',
      userId: null,
    });
  }

  return SuppliesOrderEmailRecipient.find({ warehouseId: whId })
    .populate('userId', 'username email')
    .sort({ role: 1, createdAt: 1 })
    .lean();
}

function formatRecipientRow(rec, warehouse) {
  const user = rec.userId && typeof rec.userId === 'object' ? rec.userId : null;
  let name = user?.username || '-';
  let email = user?.email || '-';

  if (rec.role === 'REQUESTER') {
    name = 'Order Requester';
    email = 'User who submits the supplies order';
  } else if (rec.role === 'STORE_EMAIL') {
    name = 'Store Email';
    email = warehouse?.storeEmail || '-';
  } else if (rec.role === 'DM') {
    name = user?.username ? `DM — ${user.username}` : 'District Manager';
  } else if (rec.role === 'CM') {
    name = user?.username ? `CM — ${user.username}` : 'Corporate Manager';
  } else if (rec.role === 'ADMIN') {
    name = user?.username ? `Admin — ${user.username}` : 'Admin';
  }

  return {
    _id: rec._id,
    warehouseId: String(rec.warehouseId),
    role: rec.role,
    userId: user?._id ? String(user._id) : rec.userId ? String(rec.userId) : null,
    name,
    email,
    isActive: rec.isActive,
    isAdmin: rec.isAdmin,
    isSystem: ['DM', 'CM', 'REQUESTER', 'STORE_EMAIL'].includes(rec.role),
  };
}

async function listWarehouseRecipients(warehouseId) {
  const warehouse = await Warehouse.findById(warehouseId)
    .select('name storeEmail districtManager corporateManager')
    .lean();
  if (!warehouse) return null;

  const rows = await syncWarehouseEmailRecipients(warehouseId);
  return {
    warehouse: {
      _id: String(warehouse._id),
      name: warehouse.name,
      storeEmail: warehouse.storeEmail || '',
    },
    recipients: rows.map((r) => formatRecipientRow(r, warehouse)),
  };
}

async function getActiveRecipientsForOrder(warehouseId) {
  if (!isObjectId(warehouseId)) return { warehouse: null, recipients: [] };

  await syncWarehouseEmailRecipients(warehouseId);

  const [warehouse, recipients] = await Promise.all([
    Warehouse.findById(warehouseId)
      .select('name storeEmail districtManager corporateManager')
      .lean(),
    SuppliesOrderEmailRecipient.find({ warehouseId, isActive: true }).lean(),
  ]);

  const userIdsByModel = { User: [], Customer: [] };
  recipients.forEach((r) => {
    if (!r.userId || !r.userModel) return;
    if (userIdsByModel[r.userModel]) userIdsByModel[r.userModel].push(r.userId);
  });

  const User = require('../models/user.model');
  const Customer = require('../models/customer.model');

  const [users, customers] = await Promise.all([
    userIdsByModel.User.length
      ? User.find({ _id: { $in: userIdsByModel.User } }).select('email username').lean()
      : [],
    userIdsByModel.Customer.length
      ? Customer.find({ _id: { $in: userIdsByModel.Customer } }).select('email username').lean()
      : [],
  ]);

  const userMap = new Map();
  users.forEach((u) => userMap.set(`User:${u._id}`, u));
  customers.forEach((c) => userMap.set(`Customer:${c._id}`, c));

  const enriched = recipients.map((r) => {
    const key = r.userModel && r.userId ? `${r.userModel}:${r.userId}` : null;
    const user = key ? userMap.get(key) : null;
    return {
      ...r,
      userEmail: user?.email || null,
      userName: user?.username || null,
    };
  });

  return { warehouse, recipients: enriched };
}

module.exports = {
  syncWarehouseEmailRecipients,
  listWarehouseRecipients,
  getActiveRecipientsForOrder,
  formatRecipientRow,
};
