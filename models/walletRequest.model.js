const mongoose = require('mongoose');

const walletRequestSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  targetWallet: {
    type: String,
    enum: ['personal', 'warehouse', 'inventory', 'supplies'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  selectedWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  adminResponse: {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    responseDate: Date,
    comment: String
  }
}, { timestamps: true });

module.exports = mongoose.model('WalletRequest', walletRequestSchema);
