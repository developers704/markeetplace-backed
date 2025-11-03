const mongoose = require('mongoose');

const mobileSliderSchema = new mongoose.Schema({
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

const MobileSlider = mongoose.model('MobileSlider', mobileSliderSchema);

module.exports = MobileSlider;
