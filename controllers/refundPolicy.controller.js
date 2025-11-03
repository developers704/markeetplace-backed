// controllers/refundPolicy.controller.js
const RefundPolicy = require('../models/RefundPolicy.model');

const createRefundPolicy = async (req, res) => {
  try {
    const { content } = req.body;
    const refundPolicy = new RefundPolicy({ content });
    await refundPolicy.save();
    res.status(201).json({ message: 'Refund Policy created successfully', refundPolicy });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getRefundPolicy = async (req, res) => {
  try {
    const refundPolicy = await RefundPolicy.find();
    res.status(200).json(refundPolicy);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateRefundPolicy = async (req, res) => {
  try {
    const { content } = req.body;
    const refundPolicy = await RefundPolicy.findByIdAndUpdate(req.params.id, { content }, { new: true });
    if (!refundPolicy) {
      return res.status(404).json({ message: 'Refund Policy not found' });
    }
    res.status(200).json({ message: 'Refund Policy updated successfully', refundPolicy });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteRefundPolicy = async (req, res) => {
  try {
    const refundPolicy = await RefundPolicy.findByIdAndDelete(req.params.id);
    if (!refundPolicy) {
      return res.status(404).json({ message: 'Refund Policy not found' });
    }
    res.status(200).json({ message: 'Refund Policy deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createRefundPolicy,
  getRefundPolicy,
  updateRefundPolicy,
  deleteRefundPolicy,
};
