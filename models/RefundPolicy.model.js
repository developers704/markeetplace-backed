// models/RefundPolicy.model.js
const mongoose = require('mongoose');

const refundPolicySchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

const RefundPolicy = mongoose.model('RefundPolicy', refundPolicySchema);
module.exports = RefundPolicy;
