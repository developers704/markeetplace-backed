const mongoose = require('mongoose');

const parentVariantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    }
}, {
    timestamps: true
});

const ParentVariant = mongoose.model('ParentVariant', parentVariantSchema);

module.exports = ParentVariant;
