const mongoose = require('mongoose');

// ProductVariant schema
const productVariantSchema = new mongoose.Schema({
    variantName: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'VariantName', 
        required: true 
    },
    value: { 
        type: String, 
        required: true 
    }
}, {
    timestamps: true
});

// Add a compound index to enforce unique `value` per `variantName`
productVariantSchema.index({ variantName: 1, value: 1 }, { unique: true });

const ProductVariant = mongoose.model('ProductVariant', productVariantSchema);

module.exports = ProductVariant;
