const mongoose = require('mongoose');
const B2bStoreTransferEmailRecipient = require('../models/b2bStoreTransferEmailRecipient.model');
const {
  listWarehouseRecipients,
  syncWarehouseEmailRecipients,
} = require('../services/b2bStoreTransferEmailRecipient.service');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

const normalizeUserIds = (userIds = []) =>
  userIds
    .map((u) => {
      if (typeof u === 'string') return u;
      if (u?._id) return u._id;
      if (u?.value) return u.value;
      return null;
    })
    .filter((id) => isObjectId(id));

/**
 * GET /api/b2b-sto-email/admin-users
 */
const listAdminUsers = async (req, res) => {
  try {
    const User = require('../models/user.model');
    const admins = await User.find({ isAdmin: true })
      .select('_id username email isAdmin role')
      .populate('role', 'role_name')
      .sort({ username: 1 })
      .lean();

    return res.json({
      success: true,
      data: admins.map((u) => ({
        _id: u._id,
        username: u.username,
        email: u.email,
        isAdmin: true,
        role: u.role ? { _id: u.role._id, role_name: u.role.role_name } : null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/b2b-sto-email/:warehouseId
 */
const getWarehouseRecipients = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    if (!isObjectId(warehouseId)) {
      return res.status(400).json({ success: false, message: 'Invalid warehouse ID' });
    }

    const data = await listWarehouseRecipients(warehouseId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/b2b-sto-email/:id/toggle
 */
const toggleRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid recipient ID' });
    }

    const rec = await B2bStoreTransferEmailRecipient.findById(id);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recipient not found' });
    }

    rec.isActive = !rec.isActive;
    await rec.save();

    return res.json({
      success: true,
      message: 'Recipient status updated',
      data: rec,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/b2b-sto-email/:warehouseId/add
 * body: { role: 'ADMIN' | 'ADDITIONAL', userIds: [] }
 */
const addRecipients = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const { role, userIds } = req.body || {};

    if (!isObjectId(warehouseId)) {
      return res.status(400).json({ success: false, message: 'Invalid warehouse ID' });
    }
    if (!['ADMIN', 'ADDITIONAL'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role must be ADMIN or ADDITIONAL' });
    }

    const ids = normalizeUserIds(userIds);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'userIds array required' });
    }

    if (role === 'ADMIN') {
      const User = require('../models/user.model');
      const adminCount = await User.countDocuments({ _id: { $in: ids }, isAdmin: true });
      if (adminCount !== ids.length) {
        return res.status(400).json({
          success: false,
          message: 'Only users with isAdmin=true can be added as ADMIN recipients',
        });
      }
    }

    const docs = ids.map((userId) => ({
      warehouseId,
      role,
      userId,
      userModel: 'User',
      isActive: true,
      isAdmin: role === 'ADMIN',
    }));

    for (const doc of docs) {
      await B2bStoreTransferEmailRecipient.findOneAndUpdate(
        { warehouseId: doc.warehouseId, role: doc.role, userId: doc.userId },
        { $set: { isActive: true, isAdmin: doc.isAdmin, userModel: 'User' } },
        { upsert: true, new: true }
      );
    }

    const data = await listWarehouseRecipients(warehouseId);
    return res.json({
      success: true,
      message: 'Recipients added',
      data,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ success: false, message: 'One or more users already exist for this store' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/b2b-sto-email/:id
 */
const deleteRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid recipient ID' });
    }

    const rec = await B2bStoreTransferEmailRecipient.findById(id);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recipient not found' });
    }

    if (!['ADMIN', 'ADDITIONAL'].includes(rec.role)) {
      return res.status(400).json({
        success: false,
        message: 'Only admin or additional users can be removed',
      });
    }

    await B2bStoreTransferEmailRecipient.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Recipient removed' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/b2b-sto-email/:warehouseId/sync
 */
const syncRecipients = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    if (!isObjectId(warehouseId)) {
      return res.status(400).json({ success: false, message: 'Invalid warehouse ID' });
    }

    await syncWarehouseEmailRecipients(warehouseId);
    const data = await listWarehouseRecipients(warehouseId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  listAdminUsers,
  getWarehouseRecipients,
  toggleRecipient,
  addRecipients,
  deleteRecipient,
  syncRecipients,
};
