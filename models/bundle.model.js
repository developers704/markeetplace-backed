// models/bundle.model.js
const mongoose = require('mongoose');

const bundleSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    products: [{ 
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true, default: 1 }
    }],
    price: {
        amount: { type: Number },
        currency: { type: String }
    },
    discountPercentage: { type: Number, min: 0, max: 100 },
    image: { type: String },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

const Bundle = mongoose.model('Bundle', bundleSchema);

module.exports = Bundle;