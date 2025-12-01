// const mongoose = require('mongoose');

// const cartItemSchema = new mongoose.Schema({
//   itemType: {
//     type: String,
//     enum: ['Product', 'SpecialProduct'],
//     required: true
//   },
//   productItem: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Product'
//   },
//   specialProductItem: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'SpecialProduct'
//   },
//   quantity: {
//     type: Number,
//     required: true,
//     min: 1
//   },
//   price: {
//     type: Number,
//     required: true,
//     min: 0
//   }
// });


// cartItemSchema.virtual('item').get(function() {
//   return this.itemType === 'Product' ? this.productItem : this.specialProductItem;
// });

// const cartSchema = new mongoose.Schema({
//   customer: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Customer'
//   },
//   sessionId: {
//     type: String
//   },
//   items: [cartItemSchema],
//   total: {
//     type: Number,
//     default: 0,
//     min: 0
//   }
// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true }, // Enable virtuals when converting to JSON
//   toObject: { virtuals: true } // Enable virtuals when converting to object
// });

// module.exports = mongoose.model('Cart', cartSchema);



const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  itemType: {
    type: String,
    enum: ['Product', 'SpecialProduct'],
    required: true
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'itemType' // Dynamic reference based on `itemType`
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  color: {
    type: String,
    default: null
  },
  isMain: {
    type: Boolean,
    default: false
  },
  sellerWarehouseId :{
    type: String
  }
});

const cartSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  sessionId: {
    type: String
  },
  items: [cartItemSchema], // Array of cart items
  total: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Cart', cartSchema);
