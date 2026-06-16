const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    storeEmail: { type: String, trim: true, lowercase: true, default: '' },
    districtManager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            required: true
        },
    corporateManager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            required: true
        },
    location: { type: String },
    capacity: { type: Number },
    isActive: { type: Boolean, default: true },
    description: { type: String },
    isMain: { type: Boolean, default: false },
    // B2B Approval Permission Flags (v2)
    requireDMApproval: { type: Boolean, default: false },
    requireCMApproval: { type: Boolean, default: false },
}, { timestamps: true });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);

module.exports = Warehouse;
