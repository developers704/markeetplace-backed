const mongoose = require('mongoose');

const specialCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['inventory', 'supplies', 'packages-gws', 'marketing', 'tool finding'],
        required: true
    },
    description: {
        type: String,
        trim: true
    },
    image: {
        type: String
    },
    // productCount: {
    //     type: Number,
    //     default: 0
    // }
}, {
    timestamps: true
});

const SpecialCategory = mongoose.model('SpecialCategory', specialCategorySchema);
module.exports = SpecialCategory;
