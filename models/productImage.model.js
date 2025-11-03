const mongoose = require('mongoose');

const productImageSchema = new mongoose.Schema({
    sku: {
        type: String,
        required: true,
        unique: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    status: {
        type: String, // Status will be a simple string
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('ProductImage', productImageSchema);
