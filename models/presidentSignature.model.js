const mongoose = require('mongoose');

const presidentSignatureSchema = new mongoose.Schema({
  presidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Admin/President user
    required: true,
    unique: true // Ek president ka ek hi signature
  },
  signaturePath: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PresidentSignature', presidentSignatureSchema);
