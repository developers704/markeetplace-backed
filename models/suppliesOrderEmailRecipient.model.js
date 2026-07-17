const mongoose = require('mongoose');

const ROLES = ['DM', 'CM', 'ADMIN', 'REQUESTER', 'STORE_EMAIL', 'ADDITIONAL'];

const suppliesOrderEmailRecipientSchema = new mongoose.Schema(
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
  { timestamps: true },
);

suppliesOrderEmailRecipientSchema.index(
  { warehouseId: 1, role: 1, userId: 1 },
  { unique: true },
);

const SuppliesOrderEmailRecipient = mongoose.model(
  'SuppliesOrderEmailRecipient',
  suppliesOrderEmailRecipientSchema,
);

module.exports = SuppliesOrderEmailRecipient;
module.exports.ROLES = ROLES;
