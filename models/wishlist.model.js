const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  products: [{
    productType: {
      type: String,
      enum: ['regular', 'special', 'vendor'],
      required: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'products.productType',
      required: true
    },
    sellerWarehouseId: {
      type: String,
    },
    isMain:{
      type: String 
    },
    skuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sku',
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    addedByUsername: {
      type: String,
      trim: true,
      default: '',
    },
  }]
}, { timestamps: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);
