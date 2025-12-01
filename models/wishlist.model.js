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
      enum: ['regular', 'special'],
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
  }]
}, { timestamps: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);
