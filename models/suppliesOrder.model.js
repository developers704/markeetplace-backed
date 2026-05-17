const mongoose = require('mongoose');

const suppliesOrderItemSchema = new mongoose.Schema(
  {
    specialProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SpecialProduct',
      required: true,
    },
    name: { type: String, default: '' },
    sku: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    image: { type: String, default: '' },
  },
  { _id: false },
);

const suppliesOrderSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    requestedByModel: { type: String, enum: ['Customer'], default: 'Customer' },
    items: { type: [suppliesOrderItemSchema], default: [] },
    totalAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['PENDING_ADMIN', 'APPROVED', 'REJECTED'],
      default: 'PENDING_ADMIN',
      index: true,
    },
    rejection: {
      reason: { type: String, default: '' },
      rejectedAt: { type: Date, default: null },
    },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

suppliesOrderSchema.index({ customer: 1, createdAt: -1 });

const SuppliesOrder = mongoose.model('SuppliesOrder', suppliesOrderSchema);

module.exports = SuppliesOrder;
