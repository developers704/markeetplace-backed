const mongoose = require('mongoose');

const bestSellerConfigSchema = new mongoose.Schema({
    quantityThreshold: { type: Number, required: true }
});

const BestSellerConfig = mongoose.model('BestSellerConfig', bestSellerConfigSchema);

module.exports = BestSellerConfig;

