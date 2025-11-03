const mongoose = require('mongoose');

const middleBannerImageSchema = new mongoose.Schema({
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

const MiddleBannerImage = mongoose.model('MiddleBannerImage', middleBannerImageSchema);

module.exports = MiddleBannerImage;
