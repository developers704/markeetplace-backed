const mongoose = require('mongoose');

/**
 * B2B Cart (v2) - For VendorProduct/SKU based marketplace
 * 
 * Each cart item represents a SKU selection with quantity.
 * All items must belong to the same warehouse (enforced).
 */

const b2bCartItemSchema = new mongoose.Schema(
  {
    vendorProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorProduct',
      required: true,
    },
    skuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sku',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
  },
  { _id: true }
);

const b2bCartSchema = new mongoose.Schema(
  {
    customer: {
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
    items: [b2bCartItemSchema],
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// One cart per customer per warehouse
b2bCartSchema.index({ customer: 1, storeWarehouseId: 1 }, { unique: true });

// Helper method to calculate subtotal
b2bCartSchema.methods.calculateSubtotal = function () {
  this.subtotal = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return this.subtotal;
};

const B2BCart = mongoose.model('B2BCart', b2bCartSchema);

module.exports = B2BCart;

