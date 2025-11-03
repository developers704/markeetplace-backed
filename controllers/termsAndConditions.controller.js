// controllers/termsAndConditions.controller.js
const TermsAndConditions = require('../models/TermsAndConditions.model');

const createTermsAndConditions = async (req, res) => {
  try {
    const { content, isActive } = req.body;
    const terms = new TermsAndConditions({ content , isActive });
    await terms.save();
    res.status(201).json({ message: 'Terms and Conditions created successfully', terms });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getTermsAndConditions = async (req, res) => {
  try {
    const terms = await TermsAndConditions.find();
    res.status(200).json(terms);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// get by id:
const getTermsAndConditionsById = async (req, res) => {
  try {
    const terms = await TermsAndConditions.findById(req.params.id);
    if (!terms) {
      return res.status(404).json({ message: 'Terms and Conditions not found' });
    }
    res.status(200).json(terms);

  }catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateTermsAndConditions = async (req, res) => {
  try {
    const { content , isActive } = req.body;
    const terms = await TermsAndConditions.findByIdAndUpdate(req.params.id, { content , isActive}, { new: true });
    console.log('Updated Terms:', terms);
    if (!terms) {
      return res.status(404).json({ message: 'Terms and Conditions not found' });
    }
    res.status(200).json({ message: 'Terms and Conditions updated successfully', terms });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteTermsAndConditions = async (req, res) => {
  try {
    const terms = await TermsAndConditions.findByIdAndDelete(req.params.id);
    if (!terms) {
      return res.status(404).json({ message: 'Terms and Conditions not found' });
    }
    res.status(200).json({ message: 'Terms and Conditions deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createTermsAndConditions,
  getTermsAndConditionsById,
  getTermsAndConditions,
  updateTermsAndConditions,
  deleteTermsAndConditions,
};
