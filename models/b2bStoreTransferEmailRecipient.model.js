const mongoose = require('mongoose');

const ROLES = ['DM', 'CM', 'ADMIN', 'REQUESTER', 'STORE_EMAIL', 'ADDITIONAL'];

const b2bStoreTransferEmailRecipientSchema = new mongoose.Schema(
  {
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'userModel',
      default: null,
    },
    userModel: {
      type: String,
      enum: ['User', 'Customer', null],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

b2bStoreTransferEmailRecipientSchema.index(
  { warehouseId: 1, role: 1, userId: 1 },
  { unique: true }
);

const B2bStoreTransferEmailRecipient = mongoose.model(
  'B2bStoreTransferEmailRecipient',
  b2bStoreTransferEmailRecipientSchema
);

module.exports = B2bStoreTransferEmailRecipient;
module.exports.ROLES = ROLES;
