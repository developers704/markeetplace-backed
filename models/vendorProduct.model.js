const mongoose = require('mongoose');

/**
 * Vendor-Model Parent Product (v2 Catalog)
 *
 * IMPORTANT:
 * - This is intentionally NOT the legacy `Product` model (which is SKU-centric in this codebase).
 * - This model represents ONE vendor model used for listings (parent/umbrella product).
 */

const normalizeKey = (value) => String(value || '').trim().toUpperCase();

const vendorProductSchema = new mongoose.Schema(
  {
    vendorModel: { type: String, required: true, trim: true },
    vendorModelKey: { type: String, required: true, trim: true, unique: true, index: true },

    title: { type: String, required: true, trim: true },
    brand: { type: String, required: false, trim: true },
    // Support both string (legacy) and ObjectId (new) for backward compatibility
    category: { 
      type: mongoose.Schema.Types.Mixed,
      required: true,
      // Can be String or ObjectId reference
    },
    subcategory: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'SubCategory',
      default: null 
    },
    subsubcategory: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'SubSubCategory',
      default: null 
    },
    description: { type: String, default: '', trim: true },

    // Default SKU (variant) for listing card selection
    defaultSku: { type: mongoose.Schema.Types.ObjectId, ref: 'Sku', default: null },

    // Cached list of SKU ids (variants) belonging to this vendor product.
    // NOTE: This is redundant to `Sku.productId` but helps with quick lookups/aggregation.
    skuIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sku', default: [] }],
  },
  { timestamps: true }
);

vendorProductSchema.pre('validate', function setVendorModelKey(next) {
  if (this.vendorModel) {
    this.vendorModelKey = normalizeKey(this.vendorModel);
  }
  next();
});

vendorProductSchema.index({ vendorModelKey: 1 }, { unique: true });
vendorProductSchema.index({ brand: 1 });
vendorProductSchema.index({ category: 1 });
vendorProductSchema.index({ subcategory: 1 });
vendorProductSchema.index({ subsubcategory: 1 });

const VendorProduct = mongoose.model('VendorProduct', vendorProductSchema);

module.exports = VendorProduct;


