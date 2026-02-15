/**
 * READ MODEL: Precomputed product listing (one doc per VendorProduct).
 * Kept in sync by productListingSync.service. No $lookup at read time.
 */

const mongoose = require('mongoose');

const productListingSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorProduct',
      required: true,
    },
    vendorModel: { type: String, trim: true, default: '' },
    vendorModelKey: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    brand: { type: String, trim: true, default: '' },
    brandKey: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },

    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    categoryDoc: { type: mongoose.Schema.Types.Mixed, default: null },
    subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory', default: null },
    subcategoryDoc: { type: mongoose.Schema.Types.Mixed, default: null },
    subsubcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubSubCategory', default: null },
    subsubcategoryDoc: { type: mongoose.Schema.Types.Mixed, default: null },

    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    totalInventory: { type: Number, default: 0 },
    skuCount: { type: Number, default: 0 },

    defaultSku: {
      _id: mongoose.Schema.Types.ObjectId,
      sku: String,
      price: Number,
      currency: String,
      images: [String],
      gallery: [String],
      metalColor: String,
      metalType: String,
      size: String,
      attributes: mongoose.Schema.Types.Mixed,
    },

    metalColorKeys: [{ type: String, trim: true }],
    metalTypeKeys: [{ type: String, trim: true }],
    sizeKeys: [{ type: String, trim: true }],
    searchText: { type: String, default: '' },
  },
  { timestamps: true, _id: true }
);

productListingSchema.index({ productId: 1 }, { unique: true });
productListingSchema.index({ brandKey: 1, categoryId: 1, updatedAt: -1, _id: 1 });
productListingSchema.index({ brandKey: 1 });
productListingSchema.index({ categoryId: 1 });
productListingSchema.index({ subcategoryId: 1 });
productListingSchema.index({ subsubcategoryId: 1 });
productListingSchema.index({ categoryId: 1, subcategoryId: 1, subsubcategoryId: 1 });
productListingSchema.index({ updatedAt: -1, _id: 1 });
productListingSchema.index({ createdAt: -1, _id: 1 });
productListingSchema.index({ totalInventory: -1, _id: 1 });
productListingSchema.index({ minPrice: 1, _id: 1 });
productListingSchema.index({ maxPrice: 1, _id: 1 });
productListingSchema.index({ metalColorKeys: 1 });
productListingSchema.index({ metalTypeKeys: 1 });
productListingSchema.index({ sizeKeys: 1 });
productListingSchema.index({ searchText: 'text' }, { weights: { searchText: 10 } });

const ProductListing = mongoose.model('ProductListing', productListingSchema);
module.exports = ProductListing;
