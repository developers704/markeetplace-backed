const mongoose = require('mongoose');

const suppliesWalletSchema = new mongoose.Schema({
    warehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0
    },
    lastTransaction: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('SuppliesWallet', suppliesWalletSchema);
