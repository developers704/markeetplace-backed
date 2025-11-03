const mongoose = require('mongoose');

const dealOfTheDaySchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    startDateTime: {
        type: Date,
        required: true
    },
    endDateTime: {
        type: Date,
        required: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true
    },
    cities: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City'
    }]
}, { timestamps: true });

const DealOfTheDay = mongoose.model('DealOfTheDay', dealOfTheDaySchema);

module.exports = DealOfTheDay;
