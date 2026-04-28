const mongoose = require('mongoose');
const SheetCategory = require('../models/sheetCategory.model');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

function isSuperUser(req) {
  return !!req.user?.is_superuser;
}

function normalizeUserIds(input) {
  if (!Array.isArray(input)) return [];
  const uniq = new Set();
  input.forEach((id) => {
    const value = String(id || '').trim();
    if (isObjectId(value)) uniq.add(value);
  });
  return Array.from(uniq);
}

function canAccessSheetDoc(req, sheet) {
  if (!sheet) return false;

  const uid = String(req.user?._id || '');

  return (sheet.allowedUsers || []).some((x) =>
    String(x?._id || x) === uid
  );
}

const createSheetCategory = async (req, res) => {
  try {
    if (!isSuperUser(req)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const title = String(req.body?.title || '').trim();
    const googleSheetUrl = String(req.body?.googleSheetUrl || '').trim();
    const allowedUsers = normalizeUserIds(req.body?.allowedUsers);
   
    if (!title || !googleSheetUrl) {
      return res.status(400).json({
        success: false,
        message: 'title and googleSheetUrl are required',
      });
    }

    const created = await SheetCategory.create({
      title,
      googleSheetUrl,
      allowedUsers,
      createdBy: req.user._id,
    });

    const row = await SheetCategory.findById(created._id)
      .populate('allowedUsers', 'username email')
      .populate('createdBy', 'username email')
      .lean();

    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create sheet category',
      error: error.message,
    });
  }
};

const listAdminSheets = async (req, res) => {
  try {
    if (!isSuperUser(req)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const rows = await SheetCategory.find()
      .populate('allowedUsers', 'username email')
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load sheet categories',
      error: error.message,
    });
  }
};

const listMySheets = async (req, res) => {
  try {
    const uid = String(req.user?._id || '');
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const filter = isSuperUser(req) ? {} : { allowedUsers: uid };
    const rows = await SheetCategory.find(filter)
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load assigned sheets',
      error: error.message,
    });
  }
};

const getSheetById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const row = await SheetCategory.findById(id)
      .populate('allowedUsers', 'username email')
      .populate('createdBy', 'username email')
      .lean();
    if (!row) return res.status(404).json({ success: false, message: 'Sheet not found' });

    if (!canAccessSheetDoc(req, row)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sheet',
      error: error.message,
    });
  }
};

const updateSheetCategory = async (req, res) => {
  try {
    if (!isSuperUser(req)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const patch = {};
    if (req.body?.title != null) patch.title = String(req.body.title).trim();
    if (req.body?.googleSheetUrl != null) patch.googleSheetUrl = String(req.body.googleSheetUrl).trim();
    if (req.body?.allowedUsers != null) patch.allowedUsers = normalizeUserIds(req.body.allowedUsers);

    if (patch.title === '' || patch.googleSheetUrl === '') {
      return res.status(400).json({
        success: false,
        message: 'title and googleSheetUrl cannot be empty',
      });
    }

    const row = await SheetCategory.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    })
      .populate('allowedUsers', 'username email')
      .populate('createdBy', 'username email')
      .lean();

    if (!row) return res.status(404).json({ success: false, message: 'Sheet not found' });
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update sheet',
      error: error.message,
    });
  }
};

const deleteSheetCategory = async (req, res) => {
  try {
    if (!isSuperUser(req)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });
    const deleted = await SheetCategory.findByIdAndDelete(id).lean();
    if (!deleted) return res.status(404).json({ success: false, message: 'Sheet not found' });
    return res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete sheet',
      error: error.message,
    });
  }
};

module.exports = {
  createSheetCategory,
  listAdminSheets,
  listMySheets,
  getSheetById,
  updateSheetCategory,
  deleteSheetCategory,
};
