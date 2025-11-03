const mongoose = require('mongoose');

const shippingMethodSchema = new mongoose.Schema({
    name: { 
        type: String, 
        trim: true 
    },
    description: { 
        type: String, 
        trim: true 
    },
    price: {
        type: Number,
        required: true
    },
    estimatedDeliveryTime: { 
        type: String
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    freeShippingThreshold: {
        type: Number, // The minimum cart total for free shipping
        default: null
    }
}, { 
    timestamps: true 
});


module.exports = mongoose.model('ShippingMethod', shippingMethodSchema);
