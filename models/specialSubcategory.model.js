const mongoose = require('mongoose');

const specialSubCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    image: {
        type: String
    },
    productCount: {
        type: Number,
        default: 0
    },
    parentCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpecialCategory',
        required: true
    },
    type: {
        type: String,
        enum: ['inventory', 'supplies', 'packages', 'gws'],
        required: true
    }
}, {
    timestamps: true
});

const SpecialSubCategory = mongoose.model('SpecialSubCategory', specialSubCategorySchema);
module.exports = SpecialSubCategory;
