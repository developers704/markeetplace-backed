const mongoose = require('mongoose');

const inventoryTransferSchema = new mongoose.Schema({
    sourceWarehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },
    destinationWarehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    date: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const InventoryTransfer = mongoose.model('InventoryTransfer', inventoryTransferSchema);

module.exports = InventoryTransfer;
