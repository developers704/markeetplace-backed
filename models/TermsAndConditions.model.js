// models/TermsAndConditions.model.js
const mongoose = require('mongoose');

const termsAndConditionsSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

const TermsAndConditions = mongoose.model('TermsAndConditions', termsAndConditionsSchema);
module.exports = TermsAndConditions;
