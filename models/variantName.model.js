const mongoose = require('mongoose');

// VariantName schema
const variantNameSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        unique: true
    },
    parentVariant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ParentVariant',
    }
}, {
    timestamps: true
});

const VariantName = mongoose.model('VariantName', variantNameSchema);

module.exports = VariantName;
