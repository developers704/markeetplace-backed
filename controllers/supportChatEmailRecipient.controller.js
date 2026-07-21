const mongoose = require('mongoose');
const SupportChatEmailRecipient = require('../models/supportChatEmailRecipient.model');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

const listRecipients = async (req, res) => {
  try {
    const recipients = await SupportChatEmailRecipient.find()
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: recipients });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const setRecipients = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'userIds array required' });
    }

    const normalizedIds = userIds
      .map((u) => {
        if (typeof u === 'string') return u;
        if (u?._id) return u._id;
        if (u?.value) return u.value;
        return null;
      })
      .filter((id) => mongoose.isValidObjectId(id));

    if (normalizedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid user IDs provided' });
    }

    await SupportChatEmailRecipient.deleteMany({});

    const docs = normalizedIds.map((id) => ({
      userId: id,
      isActive: true,
    }));

    await SupportChatEmailRecipient.insertMany(docs);

    return res.json({
      success: true,
      message: 'Support chat email recipients updated',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const toggleRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    const rec = await SupportChatEmailRecipient.findById(id);
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

const deleteRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid recipient ID' });
    }

    const rec = await SupportChatEmailRecipient.findByIdAndDelete(id);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recipient not found' });
    }

    return res.json({
      success: true,
      message: 'Recipient removed successfully',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  listRecipients,
  setRecipients,
  toggleRecipient,
  deleteRecipient,
};
