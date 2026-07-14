const mongoose = require('mongoose');
const CounterModel = require('./Counter.model');

const STATUSES = ['SUBMITTED', 'APPROVED', 'SHIPPED', 'REJECTED', 'RECEIVED'];

const ovaniCustomOrderSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, index: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    storeWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    brandId: { type: String, default: '', trim: true },
    productTypeId: { type: String, default: '', trim: true },
    laravoProductId: { type: String, required: true, index: true },
    laravoGuid: { type: String, default: '', trim: true },
    productSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    title: { type: String, default: '' },
    modelNumber: { type: String, default: '' },
    brand: { type: String, default: '' },
    productType: { type: String, default: '' },
    price: { type: Number, default: null },
    currency: { type: String, default: 'USD', trim: true },
    availableQty: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    notes: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: STATUSES,
      default: 'SUBMITTED',
      index: true,
    },
    adminNote: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

ovaniCustomOrderSchema.index({ createdAt: -1 });
ovaniCustomOrderSchema.index({ storeWarehouseId: 1, status: 1 });

ovaniCustomOrderSchema.pre('save', async function (next) {
  try {
    if (this.isNew && !this.ticketNumber) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const counter = await CounterModel.findOneAndUpdate(
        { _id: 'OVANI-CUSTOM-ORDER' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.ticketNumber = `OCO-${year}-${month}-${String(counter.seq).padStart(7, '0')}`;
    }
    next();
  } catch (error) {
    next(error);
  }
});

const OvaniCustomOrder = mongoose.model('OvaniCustomOrder', ovaniCustomOrderSchema);

module.exports = OvaniCustomOrder;
module.exports.STATUSES = STATUSES;
