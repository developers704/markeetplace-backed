const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "productType",
    },
    productType: {
      type: String,
      enum: ['Product', 'SpecialProduct'],
      required: true
    },
   warehouse: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Warehouse',
  }],
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true }, // City-specific inventory
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    stockAlertThreshold: {
      type: Number, // New field for stock alert
      default: 10, // Default value if not provided
    },
    locationWithinWarehouse: {
      type: String, // exact location of a product within a warehouse.
    },
    lastRestocked: {
      type: Date,
    },
    batchId: {
      type: String
    },
    expiryDate: {
      type: Date, // Optional expiry date
    },
    barcode: {
      type: String, // Optional barcode
    },
    vat: { type: Number, default: 0 }, // VAT field added
    expiryDateThreshold: {
      type: Number,
      default: 30, // Days before expiry to trigger notification
    }
  },
  {
    timestamps: true,
  }
);

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;