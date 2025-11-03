const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
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

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
