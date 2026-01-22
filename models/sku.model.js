const mongoose = require('mongoose');

/**
 * SKU Variant (v2 Catalog)
 *
 * Represents the actual sellable unit (metal color/type/size, etc.)
 * and belongs to exactly ONE VendorProduct.
 */

const normalizeKey = (value) => String(value || '').trim().toUpperCase();

const skuSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true },
    skuKey: { type: String, required: true, trim: true, unique: true, index: true },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorProduct',
      required: true,
      index: true,
    },

    metalColor: { type: String, default: '', trim: true },
    metalType: { type: String, default: '', trim: true },
    size: { type: String, default: '', trim: true },

    // Price per SKU (base/tag price)
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', trim: true },

    // Images for the selected SKU (first image typically used for card)
    images: [{ type: String, default: [] }],
    gallery: [{ type: String, default: [] }],

    // Flexible attributes (diamond specs, gender, etc.)
    attributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

skuSchema.pre('validate', function setSkuKey(next) {
  if (this.sku) {
    this.skuKey = normalizeKey(this.sku);
  }
  next();
});

skuSchema.index({ skuKey: 1 }, { unique: true });
skuSchema.index({ productId: 1, metalColor: 1, metalType: 1, size: 1 });

const Sku = mongoose.model('Sku', skuSchema);

module.exports = Sku;


