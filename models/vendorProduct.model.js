const mongoose = require('mongoose');

const normalizeKey = (value) =>
  String(value || '').trim().toUpperCase();

const vendorProductSchema = new mongoose.Schema(
  {
    vendorModel: { type: String, required: true, trim: true },
    vendorModelKey: { type: String, required: true, trim: true, unique: true, index: true },

    title: { type: String, required: true, trim: true },
    brand: { type: String, required: false, trim: true },

    category: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubCategory',
      default: null,
    },

    subsubcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubSubCategory',
      default: null,
    },

    description: { type: String, default: '', trim: true },

    defaultSku: { type: mongoose.Schema.Types.ObjectId, ref: 'Sku', default: null },

    skuIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sku',
        default:[]
      },
    ],
  },
  { timestamps: true }
);

/* =========================
   INDEXES
========================= */
vendorProductSchema.index({ brand: 1 });
vendorProductSchema.index({ category: 1 });
vendorProductSchema.index({ subcategory: 1 });
vendorProductSchema.index({ subsubcategory: 1 });

/* =========================
   NORMALIZE KEY
========================= */
vendorProductSchema.pre('validate', function (next) {
  if (this.vendorModel) {
    this.vendorModelKey = normalizeKey(this.vendorModel);
  }
  next();
});

/* =========================
   IMPORT SERVICE (SAFE LOAD)
========================= */
const getSyncService = () => {
  try {
    return require('../services/productListingSync.service');
  } catch (e) {
    return null;
  }
};

/* =========================
   SAFE SYNC CALLER
   (important for bulk jobs)
========================= */
const triggerSync = (productId) => {
  const service = getSyncService();
  if (!service?.scheduleSync) return;

  // don't crash main thread
  setImmediate(() => {
    try {
      service.scheduleSync(productId);
    } catch (err) {
      console.error('[ProductListing] sync error:', err.message);
    }
  });
};

/* =========================
   HOOK: CREATE / SAVE
========================= */
vendorProductSchema.post('save', function (doc) {
  if (!doc?._id) return;
  triggerSync(doc._id);
});

/* =========================
   HOOK: DELETE
========================= */
vendorProductSchema.post('findOneAndDelete', async function (doc) {
  if (!doc?._id) return;

  try {
    const ProductListing = require('../models/productListing.model');
    await ProductListing.deleteOne({ productId: doc._id });
  } catch (err) {
    console.error('[ProductListing] delete error:', err.message);
  }
});

/* =========================
   HOOK: UPDATE (IMPORTANT FIX)
   ⚠️ NOTE: bulk operations bypass this
========================= */
vendorProductSchema.post('findOneAndUpdate', function (doc) {
  if (!doc?._id) return;
  triggerSync(doc._id);
});

/* =========================
   MODEL EXPORT
========================= */
const VendorProduct = mongoose.model('VendorProduct', vendorProductSchema);

module.exports = VendorProduct;


