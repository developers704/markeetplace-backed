const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
  },
  { timestamps: true }
);

// Index for fast daily count (createdAt >= startOfDay)
loginLogSchema.index({ createdAt: 1 });

const LoginLog = mongoose.model('LoginLog', loginLogSchema);
module.exports = LoginLog;
