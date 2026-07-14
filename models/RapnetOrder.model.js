const mongoose = require('mongoose');
const CounterModel = require('./Counter.model');

const STATUSES = ['SUBMITTED', 'CONFIRMED', 'SHIPPED', 'REJECTED', 'RECEIVED'];

/**
 * RapnetOrder — Outsource Loose Stone inquiries submitted through the marketplace.
 * Product data is snapshotted at order time so records stay accurate if RapNet listings change.
 */
const RapnetOrderSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, sparse: true, index: true },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },

    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
      index: true,
    },

    rapnetProductId: {
      type: String,
      required: true,
      index: true,
    },

    supplierId: {
      type: String,
      default: null,
    },

    productSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    shape: { type: String, default: null },
    carat: { type: Number, default: null },
    color: { type: String, default: null },
    clarity: { type: String, default: null },
    lab: { type: String, default: null },
    price: { type: Number, default: null },

    quantity: { type: Number, default: 1, min: 1 },
    notes: { type: String, default: '' },

    rapnetResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    rapnetOrderRef: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: STATUSES,
      default: 'SUBMITTED',
      index: true,
    },

    adminNote: { type: String, default: null },
    confirmedAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

RapnetOrderSchema.index({ createdAt: -1 });
RapnetOrderSchema.index({ storeId: 1, status: 1 });

RapnetOrderSchema.pre('save', async function (next) {
  try {
    if (this.isNew && !this.ticketNumber) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const counter = await CounterModel.findOneAndUpdate(
        { _id: 'RAPNET-ORDER' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.ticketNumber = `OLS-${year}-${month}-${String(counter.seq).padStart(7, '0')}`;
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('RapnetOrder', RapnetOrderSchema);
module.exports.STATUSES = STATUSES;
