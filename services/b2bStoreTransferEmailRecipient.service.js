const mongoose = require('mongoose');
const Warehouse = require('../models/warehouse.model');
const B2bStoreTransferEmailRecipient = require('../models/b2bStoreTransferEmailRecipient.model');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

async function upsertSystemRecipient({ warehouseId, role, userId, userModel, isAdmin = false }) {
  const filter = {
    warehouseId,
    role,
    userId: userId || null,
  };

  const existing = await B2bStoreTransferEmailRecipient.findOne(filter).lean();
  if (existing) {
    const updates = {};
    if (userId && String(existing.userId || '') !== String(userId)) {
      updates.userId = userId;
      updates.userModel = userModel || null;
    }
    if (Object.keys(updates).length) {
      await B2bStoreTransferEmailRecipient.updateOne({ _id: existing._id }, { $set: updates });
    }
    return existing;
  }

  return B2bStoreTransferEmailRecipient.create({
    warehouseId,
    role,
    userId: userId || null,
    userModel: userId ? userModel || null : null,
    isActive: true,
    isAdmin,
  });
}

/**
 * Ensure DM, CM, requester, and store-email rows exist for a warehouse.
 * DM/CM default isActive=true when first created.
 */
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

  return B2bStoreTransferEmailRecipient.find({ warehouseId: whId })
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
    email = 'User who submits the transfer';
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
    B2bStoreTransferEmailRecipient.find({ warehouseId, isActive: true }).lean(),
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Same person exists in users + customers with the same email but different _id.
 * Resolve both account IDs by email (case-insensitive).
 */
async function resolveDualAccountsByEmails(emails = []) {
  const User = require('../models/user.model');
  const Customer = require('../models/customer.model');

  const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  const accountMap = new Map();
  normalized.forEach((email) => {
    accountMap.set(email, { email, userId: null, customerId: null });
  });

  if (!normalized.length) return accountMap;

  const emailOr = normalized.map((email) => ({
    email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
  }));

  const [users, customers] = await Promise.all([
    User.find({ $or: emailOr }).select('_id email').lean(),
    Customer.find({ $or: emailOr }).select('_id email').lean(),
  ]);

  users.forEach((u) => {
    const key = normalizeEmail(u.email);
    if (!accountMap.has(key)) accountMap.set(key, { email: key, userId: null, customerId: null });
    accountMap.get(key).userId = String(u._id);
  });

  customers.forEach((c) => {
    const key = normalizeEmail(c.email);
    if (!accountMap.has(key)) accountMap.set(key, { email: key, userId: null, customerId: null });
    accountMap.get(key).customerId = String(c._id);
  });

  return accountMap;
}

module.exports = {
  syncWarehouseEmailRecipients,
  listWarehouseRecipients,
  getActiveRecipientsForOrder,
  formatRecipientRow,
  normalizeEmail,
  resolveDualAccountsByEmails,
};
