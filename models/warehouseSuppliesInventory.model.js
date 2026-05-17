const mongoose = require('mongoose');

/**
 * Per-warehouse supplies stock purchased via approved supplies orders.
 * Catalog stock lives on SpecialProduct.stock (admin-managed).
 */
const warehouseSuppliesInventorySchema = new mongoose.Schema(
  {
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    specialProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SpecialProduct',
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    sku: { type: String, default: '' },
    productName: { type: String, default: '' },
    image: { type: String, default: '' },
    lastOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuppliesOrder',
      default: null,
    },
  },
  { timestamps: true },
);

warehouseSuppliesInventorySchema.index(
  { warehouse: 1, specialProductId: 1 },
  { unique: true },
);

module.exports = mongoose.model('WarehouseSuppliesInventory', warehouseSuppliesInventorySchema);
