const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'productModel',
        required: true
    },
    productModel: {
        type: String,
        required: true,
        enum: ['Product', 'VendorProduct'],
        default: 'Product'
    },
    sku: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sku',
        required: false // Optional for backward compatibility
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    content: {
        type: String
    },
    isVerifiedPurchase: {
        type: Boolean,
        default: false
    },
    isApproved: {
        type: Boolean,
        default: false // Admin must approve reviews before they show
    },
    votes: [{
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer'
        },
        isHelpful: Boolean
    }],
    images: [{ type: String }],
  sellerResponse: {
    content: String,
    respondedAt: Date
  }
}, {
    timestamps: true
});

// Index for SKU-based queries
reviewSchema.index({ sku: 1, isApproved: 1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
