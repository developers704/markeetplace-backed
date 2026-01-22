const mongoose = require('mongoose');

/**
 * StoreInventory (v2 B2B)
 *
 * Represents inventory owned by a store (warehouse) after admin-approved B2B purchase requests.
 * This is separate from vendor SKU inventories (SkuInventory).
 */

const storeInventorySchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
    storeWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },

    vendorProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProduct', required: true, index: true },
    skuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sku', required: true, index: true },

    quantity: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

// One row per Store + VendorProduct + SKU
storeInventorySchema.index({ storeWarehouseId: 1, vendorProductId: 1, skuId: 1 }, { unique: true });

const StoreInventory = mongoose.model('StoreInventory', storeInventorySchema);

module.exports = StoreInventory;


