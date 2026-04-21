const mongoose = require('mongoose');

/**
 * Inventory (v2 Catalog)
 *
 * Linked to SKU (NOT VendorProduct)
 * Warehouse & city based quantity control.
 */

const { isActive: isSkuInventoryBulkImport } = require('../services/skuInventoryBulkImportGuard');

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
  if (isSkuInventoryBulkImport()) return;
  const sid = this.skuId;
  const { rebuildSkuInventoryRedis, rebuildProductInventoryRedis } = require('../services/inventoryRedis.service');
  rebuildSkuInventoryRedis(sid)
    .then(async () => {
      const Sku = mongoose.model('Sku');
      const sku = await Sku.findById(sid).select('productId').lean();
      if (sku?.productId) {
        await rebuildProductInventoryRedis(sku.productId);
        const { scheduleSync } = require('../services/productListingSync.service');
        scheduleSync(sku.productId);
      }
    })
    .catch((err) => console.error('[inventoryRedis] save hook', err.message));
});

skuInventorySchema.post('findOneAndDelete', function (doc) {
  if (isSkuInventoryBulkImport()) return;
  if (!doc) return;
  const sid = doc.skuId;
  const { rebuildSkuInventoryRedis, rebuildProductInventoryRedis } = require('../services/inventoryRedis.service');
  rebuildSkuInventoryRedis(sid)
    .then(async () => {
      const Sku = mongoose.model('Sku');
      const sku = await Sku.findById(sid).select('productId').lean();
      if (sku?.productId) {
        await rebuildProductInventoryRedis(sku.productId);
        const { scheduleSync } = require('../services/productListingSync.service');
        scheduleSync(sku.productId);
      }
    })
    .catch((err) => console.error('[inventoryRedis] delete hook', err.message));
});


skuInventorySchema.post('findOneAndUpdate', function (doc) {
  if (isSkuInventoryBulkImport()) return;
  if (!doc) return;
  const sid = doc.skuId;
  const { rebuildSkuInventoryRedis, rebuildProductInventoryRedis } = require('../services/inventoryRedis.service');
  rebuildSkuInventoryRedis(sid)
    .then(async () => {
      const Sku = mongoose.model('Sku');
      const sku = await Sku.findById(sid).select('productId').lean();
      if (sku?.productId) {
        await rebuildProductInventoryRedis(sku.productId);
        const { scheduleSync } = require('../services/productListingSync.service');
        scheduleSync(sku.productId);
      }
    })
    .catch((err) => console.error('[inventoryRedis] update hook', err.message));
});



const SkuInventory = mongoose.model('SkuInventory', skuInventorySchema);

module.exports = SkuInventory;


