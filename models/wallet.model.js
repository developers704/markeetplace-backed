const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer', // Assuming the user model is called 'User'
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0, // Initial wallet balance
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
