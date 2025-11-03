const mongoose = require('mongoose');

const showcasedProductSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    image: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    }
}, { timestamps: true });

const ShowcasedProduct = mongoose.model('ShowcasedProduct', showcasedProductSchema);

module.exports = ShowcasedProduct;
