// models/discount.model.js
const mongoose = require('mongoose');

const discountSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
      },
    value: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    code: {
        type: String,
        unique: true,  // Ensure discount code is unique
        required: true,
        trim: true,
        index: true // Optional: Make it indexed for faster searching
    }
    }, {
    timestamps: true
});

const Discount = mongoose.model('Discount', discountSchema);

module.exports = Discount;
