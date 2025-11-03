const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    amount: { type: Number, required: true },
    salePrice: { type: Number }
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
    description: { type: String, trim: true },
    isBestSeller: { type: Boolean, default: false },
    isShopByPet: { type: Boolean, default: false }, //use as selected just for you in pet shop
    isNewArrival: { type: Boolean, default: false },
    sku: { type: String, unique: true, required: true }, // Made SKU required and removed auto-generation
    prices: [priceSchema],
    currency: { type: String },
    category: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    subcategory: [{ type: mongoose.Schema.Types.ObjectId, ref: "SubCategory" }],
    subsubcategory: [
      { type: mongoose.Schema.Types.ObjectId, ref: "SubSubCategory" },
    ],
    image: { type: String },
    variationId: { type: String }, // Can be unique or non-unique based on source
    gallery: [{ type: String }],
    videoLink: { type: String },
    variants: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant" }],
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }], // Added reference to Tag model
    lifecycleStage: {
      type: String,
      enum: ["active", "discontinued", "upcoming", "archived"],
      default: "active",
    },
    releaseDate: { type: Date },
    dealOfTheDay: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DealOfTheDay",
      },
    ],
    discounts: [
      {
        discountId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Discount",
          required: true,
        },
        cityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "City" }], // City-specific discount
      },
    ],
    inventory: [{ type: mongoose.Schema.Types.ObjectId, ref: "Inventory" }], // Updated to an array of references
    meta_title: { type: String, trim: true },
    meta_description: { type: String, trim: true },
    image_alt_text: { type: String, trim: true },
    product_url: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);


const Product = mongoose.model('Product', productSchema);

module.exports = Product;