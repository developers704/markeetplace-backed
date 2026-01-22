const mongoose = require('mongoose');

const approvalStepSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: false },
    userModel: { type: String, enum: ['Customer', 'User'], required: false },
    approvedAt: { type: Date, default: null },
  },
  { _id: false }
);

const b2bPurchaseRequestSchema = new mongoose.Schema(
  {
    vendorProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorProduct',
      required: true,
      index: true,
    },
    skuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sku',
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, min: 1 },

    // Store configuration (a "store" is represented by a Warehouse record in this system)
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
    storeWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },

    // Snapshot the expected approvers at request creation for fast filtering + audit
    dmUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    cmUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

    status: {
      type: String,
      enum: ['PENDING_DM', 'PENDING_CM', 'PENDING_ADMIN', 'APPROVED', 'REJECTED'],
      required: true,
      default: 'PENDING_DM',
      index: true,
    },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    requestedByModel: { type: String, enum: ['Customer', 'User'], required: true },

    approvals: {
      dm: { type: approvalStepSchema, default: {} },
      cm: { type: approvalStepSchema, default: {} },
      admin: { type: approvalStepSchema, default: {} },
    },

    rejection: {
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      rejectedByModel: { type: String, enum: ['Customer', 'User'], default: null },
      rejectedAt: { type: Date, default: null },
      reason: { type: String, default: '' },
    },

    // Cart tracking (for wallet deduction on approval)
    cartId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BCart', default: null, index: true },
    cartItemPrice: { type: Number, default: null }, // Price at time of request creation
    cartItemCurrency: { type: String, default: 'USD' },
  },
  { timestamps: true }
);

// Useful compound index for admin dashboards filtering by store + status
b2bPurchaseRequestSchema.index({ storeWarehouseId: 1, status: 1, createdAt: -1 });

const B2BPurchaseRequest = mongoose.model('B2BPurchaseRequest', b2bPurchaseRequestSchema);

module.exports = B2BPurchaseRequest;


