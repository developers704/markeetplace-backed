const mongoose = require('mongoose');

const bannerImageSchema = new mongoose.Schema({
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

const BannerImage = mongoose.model('BannerImage', bannerImageSchema);

module.exports = BannerImage;
