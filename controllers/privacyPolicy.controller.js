// controllers/privacyPolicy.controller.js
const PrivacyPolicy = require('../models/PrivacyPolicy.model');

const createPrivacyPolicy = async (req, res) => {
  try {
    const { content } = req.body;
    const privacyPolicy = new PrivacyPolicy({ content });
    await privacyPolicy.save();
    res.status(201).json({ message: 'Privacy Policy created successfully', privacyPolicy });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getPrivacyPolicy = async (req, res) => {
  try {
    const privacyPolicy = await PrivacyPolicy.find();
    res.status(200).json(privacyPolicy);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updatePrivacyPolicy = async (req, res) => {
  try {
    const { content } = req.body;
    const privacyPolicy = await PrivacyPolicy.findByIdAndUpdate(req.params.id, { content }, { new: true });
    if (!privacyPolicy) {
      return res.status(404).json({ message: 'Privacy Policy not found' });
    }
    res.status(200).json({ message: 'Privacy Policy updated successfully', privacyPolicy });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deletePrivacyPolicy = async (req, res) => {
  try {
    const privacyPolicy = await PrivacyPolicy.findByIdAndDelete(req.params.id);
    if (!privacyPolicy) {
      return res.status(404).json({ message: 'Privacy Policy not found' });
    }
    res.status(200).json({ message: 'Privacy Policy deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createPrivacyPolicy,
  getPrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy,
};
