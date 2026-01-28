const mongoose = require('mongoose');

const specialProductSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    productVariants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariant'
    }],
    variationId: {
        type: String
    },
    type: {
        type: String,
        enum: ['supplies', 'GWP', 'marketing', 'tool finding'],
        required: true
    },
    unitSize: {
        type: String,
    },
    prices: [{
        city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
        amount: { type: Number, required: true },
        buyPrice: { type: Number },
        salePrice: { type: Number }
    }],
    description: { 
        type: String, 
        trim: true 
    },
    image: { 
        type: String 
    },
    gallery: [{ 
        type: String 
    }],
    sku: { 
        type: String, 
        unique: true, 
        required: true 
    },
    link: {
        type: String
    },
    links: [{
        siteName: { type: String, required: true },
        link: { type: String, required: true },
        price: { type: Number }
    }],
    stock: {
        type: Number,
        default: 0
    },
    specialCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpecialCategory',
        required: true
    },
    specialSubcategory:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpecialSubCategory',
    },
    level: {
        type: String,
    },
    inventory: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Inventory" 
    }],
    status: {
        type: String,
        default: 'active'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const SpecialProduct = mongoose.model('SpecialProduct', specialProductSchema);
module.exports = SpecialProduct;
