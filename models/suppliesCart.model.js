const mongoose = require('mongoose');

const suppliesCartItemSchema = new mongoose.Schema(
  {
    specialProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SpecialProduct',
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    productName: { type: String, default: '' },
    sku: { type: String, default: '' },
    image: { type: String, default: '' },
  },
  { _id: true },
);

const suppliesCartSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [suppliesCartItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

suppliesCartSchema.methods.calculateSubtotal = function calc() {
  this.subtotal = this.items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
  return this.subtotal;
};

const SuppliesCart = mongoose.model('SuppliesCart', suppliesCartSchema);

module.exports = SuppliesCart;
