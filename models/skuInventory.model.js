const mongoose = require('mongoose');

/**
 * Inventory (v2 Catalog)
 *
 * Linked to SKU (NOT VendorProduct)
 * Warehouse & city based quantity control.
 */

const skuInventorySchema = new mongoose.Schema(
  {
    skuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sku',
      required: true,
      index: true,
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: false,
      default: null,
      index: true,
    },
    quantity: { type: Number, required: true, min: 0 },

    // Optional operational fields (kept similar to legacy Inventory)
    stockAlertThreshold: { type: Number, default: 10 },
    lastRestocked: { type: Date, default: null },
    locationWithinWarehouse: { type: String, default: '' },
    batchId: { type: String, default: '' },
    expiryDate: { type: Date, default: null },
    barcode: { type: String, default: '' },
    vat: { type: Number, default: 0 },
    expiryDateThreshold: { type: Number, default: 30 },
  },
  { timestamps: true }
);

// Prevent duplicate inventory rows per SKU per (warehouse, city)
skuInventorySchema.index({ skuId: 1, warehouse: 1, city: 1 }, { unique: true });

skuInventorySchema.post('save', function () {
  const Sku = mongoose.model('Sku');
  Sku.findById(this.skuId).select('productId').lean()
    .then((sku) => {
      if (sku && sku.productId) {
        const { scheduleSync } = require('../services/productListingSync.service');
        scheduleSync(sku.productId).catch((err) => console.error('[ProductListing] sync', err.message));
      }
    })
    .catch(() => {});
});

skuInventorySchema.post('findOneAndDelete', function (doc) {
  if (!doc) return;
  const Sku = mongoose.model('Sku');
  Sku.findById(doc.skuId).select('productId').lean()
    .then((sku) => {
      if (sku?.productId) {
        const { scheduleSync } = require('../services/productListingSync.service');
        scheduleSync(sku.productId);
      }
    })
    .catch(() => {});
});


skuInventorySchema.post('findOneAndUpdate', function (doc) {
  if (!doc) return;
  try {
    const Sku = mongoose.model('Sku');
    Sku.findById(doc.skuId).select('productId').lean()
      .then((sku) => {
        if (sku?.productId) {
          const { scheduleSync } = require('../services/productListingSync.service');
          scheduleSync(sku.productId);
        }
      })
      .catch(() => {});
  } catch (err) {
    console.error('[ProductListing] Inventory update sync error', err.message);
  }
});



const SkuInventory = mongoose.model('SkuInventory', skuInventorySchema);

module.exports = SkuInventory;


