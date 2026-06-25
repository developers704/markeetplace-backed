const mongoose = require('mongoose');

/**
 * Store → Main Store Transfer (batch).
 * One document = one transfer request with multiple SKU items.
 * Lifecycle: SUBMITTED → WIP (Received) → APPROVED (stock+wallet applied) | REJECTED
 */

const STATUSES = ['SUBMITTED', 'WIP', 'APPROVED', 'REJECTED'];

const transferItemSchema = new mongoose.Schema(
  {
    skuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sku', required: true },
    vendorProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProduct', required: true },
    /** snapshot values at time of request */
    skuCode: { type: String, default: '', trim: true },
    vendorModel: { type: String, default: '', trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', trim: true },
    lineTotal: { type: Number, required: true, min: 0 },
    /** idempotency: set when inventory/wallet applied for this item */
    inventoryAppliedAt: { type: Date, default: null },
  },
  { _id: true },
);

const storeToMainTransferSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, sparse: true, index: true },
    receiptNumber: { type: String, default: '', trim: true, index: true },
    note: { type: String, default: '', trim: true },

    /** User's store (inventory source, wallet receiver) */
    sourceWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    /** Main store (inventory destination, wallet payer) */
    destWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },

    items: { type: [transferItemSchema], required: true },

    /** Computed total of all items (unitPrice × qty) */
    totalAmount: { type: Number, default: 0 },

    status: { type: String, enum: STATUSES, default: 'SUBMITTED', index: true },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      refPath: 'requestedByModel',
    },
    requestedByModel: { type: String, enum: ['Customer', 'User'], required: true },

    /** Set when APPROVED applies inventory + wallet (idempotent guard) */
    inventoryAppliedAt: { type: Date, default: null },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },

    rejection: {
      reason: { type: String, default: '' },
      rejectedAt: { type: Date, default: null },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  },
  { timestamps: true },
);

storeToMainTransferSchema.index({ sourceWarehouseId: 1, status: 1, createdAt: -1 });
storeToMainTransferSchema.index({ createdAt: -1 });

storeToMainTransferSchema.pre('save', async function (next) {
  if (this.isNew && !this.ticketNumber) {
    try {
      const count = await mongoose.model('StoreToMainTransfer').countDocuments();
      const year = new Date().getFullYear();
      this.ticketNumber = `STM-${year}-${String(count + 1).padStart(5, '0')}`;
    } catch (e) {
      return next(e);
    }
  }
  next();
});

const StoreToMainTransfer = mongoose.model('StoreToMainTransfer', storeToMainTransferSchema);
module.exports = StoreToMainTransfer;
module.exports.STATUSES = STATUSES;
