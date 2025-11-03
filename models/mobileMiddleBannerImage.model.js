const mongoose = require('mongoose');

const mobileMiddleBannerImageSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true
    },
    linkOne: {
        type: String,
        default: null
    },
    linkTwo: {
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

const MobileMiddleBannerImage = mongoose.model('MobileMiddleBannerImage', mobileMiddleBannerImageSchema);

module.exports = MobileMiddleBannerImage;
