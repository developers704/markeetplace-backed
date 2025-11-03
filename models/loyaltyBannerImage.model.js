const mongoose = require('mongoose');

const loyaltyBannerImageSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true
    },
    link: {
        type: String,
        default: null
    },
    sortOrder: {
        type: Number,
        default: null
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

const LoyaltyBannerImage = mongoose.model('LoyaltyBannerImage', loyaltyBannerImageSchema);

module.exports = LoyaltyBannerImage;
