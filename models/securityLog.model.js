const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  type: {
    type: String,
    enum: ['inactivity'],
    required: true
  },
  details: {
    type: String
  }
}, {
  timestamps: true
});

const SecurityLog = mongoose.model('SecurityLog', securityLogSchema);
module.exports = SecurityLog;
