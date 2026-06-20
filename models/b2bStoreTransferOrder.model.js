const mongoose = require('mongoose');

/**
 * Store / vendor → store transfer requests ("Request to Admin" from marketplace B2B).
 * Lifecycle: SUBMITTED → WIP | TRANSFER → APPROVED (inventory + wallet) → DELIVERED → RECEIVED
 */

const STATUSES = [
  'SUBMITTED',
  'WIP',
  'TRANSFER',
  'APPROVED',
  'REJECTED',
  'DELIVERED',
  'RECEIVED',
];

const b2bStoChatSeenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userModel: { type: String, enum: ['Customer', 'User'], required: true },
    seenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const b2bStoChatMessageSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, maxlength: 4000 },
    attachments: { type: [String], default: [] },
    role: { type: String, enum: ['user', 'admin'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    senderName: { type: String, default: '' },
    replyToMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    replyToText: { type: String, default: '' },
    replyToSenderName: { type: String, default: '' },
    seenBy: { type: [b2bStoChatSeenSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const b2bStoreTransferOrderSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, sparse: true, index: true },
    receiptNumber: { type: String, default: '', trim: true, index: true },
    note: { type: String, default: '', trim: true },
    confirmedByUserId: { type: String, default: '', trim: true },
    vendorProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorProduct',
      required: true,
      index: true,
    },
    skuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sku', required: true, index: true },
    /** Warehouse stock is deducted from (vendor / source) */
    sourceWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    /** Buyer store warehouse (wallet + destination SkuInventory) */
    destWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', trim: true },
    eta: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: STATUSES,
      default: 'SUBMITTED',
      index: true,
    },

    /** Set when APPROVED applies inventory + wallet (idempotent guard) */
    inventoryAppliedAt: { type: Date, default: null },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, refPath: 'requestedByModel', },
    requestedByModel: { type: String, enum: ['Customer', 'User'], required: true },
    chatMessages: { type: [b2bStoChatMessageSchema], default: [] },

    rejection: {
      reason: { type: String, default: '' },
      rejectedAt: { type: Date, default: null },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      rejectedByModel: { type: String, enum: ['Customer', 'User'], default: null },
    },

    deliveredAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

b2bStoreTransferOrderSchema.index({ destWarehouseId: 1, status: 1, createdAt: -1 });
b2bStoreTransferOrderSchema.index({ createdAt: -1 });

b2bStoreTransferOrderSchema.pre('save', async function ticketPre(next) {
  if (this.isNew && !this.ticketNumber) {
    try {
      const count = await mongoose.model('B2bStoreTransferOrder').countDocuments();
      const year = new Date().getFullYear();
      this.ticketNumber = `B2B-ST-${year}-${String(count + 1).padStart(5, '0')}`;
    } catch (e) {
      return next(e);
    }
  }
  next();
});

const B2bStoreTransferOrder = mongoose.model('B2bStoreTransferOrder', b2bStoreTransferOrderSchema);

module.exports = B2bStoreTransferOrder;
module.exports.STATUSES = STATUSES;
