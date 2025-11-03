const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    location: { type: String },
    capacity: { type: Number },
    isActive: { type: Boolean, default: true },
    description: { type: String }
}, { timestamps: true });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);

module.exports = Warehouse;
