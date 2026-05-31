const mongoose = require('mongoose');

/**
 * RapnetOrder — stores every inquiry/order submitted to RapNet through our marketplace.
 * Product data is snapshotted at order time so records remain accurate even if the
 * live RapNet listing changes or disappears.
 */
const RapnetOrderSchema = new mongoose.Schema(
  {
    // Customer who placed the inquiry
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },

    // Optional: warehouse / store context
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
    },

    // RapNet lot/inventory ID returned by their API
    rapnetProductId: {
      type: String,
      required: true,
      index: true,
    },

    // RapNet seller/supplier ID
    supplierId: {
      type: String,
      default: null,
    },

    // Full diamond details at time of inquiry (raw + normalized)
    productSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Normalized fields for quick querying without parsing snapshot
    shape:    { type: String, default: null },
    carat:    { type: Number, default: null },
    color:    { type: String, default: null },
    clarity:  { type: String, default: null },
    lab:      { type: String, default: null },
    price:    { type: Number, default: null },

    quantity: { type: Number, default: 1, min: 1 },

    notes: { type: String, default: '' },

    // Raw response from RapNet after we submitted the order
    rapnetResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // RapNet-assigned order reference (if returned)
    rapnetOrderRef: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ['SUBMITTED', 'CONFIRMED', 'REJECTED'],
      default: 'SUBMITTED',
      index: true,
    },

    // Admin action fields
    adminNote:   { type: String, default: null },
    confirmedAt: { type: Date,   default: null },
    rejectedAt:  { type: Date,   default: null },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model('RapnetOrder', RapnetOrderSchema);
