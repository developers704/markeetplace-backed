const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    version: {
        type: String,
        required: true
    },
    picture: {
        type: String, // Store image path
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    showFirst: {
        type: Boolean,
        default: false // Priority policy that shows first on login
    },
    sequence: {
        type: Number,
        default: 0 // Order in which policies should be displayed
    },
    applicableRoles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserRole'
    }],
    applicableWarehouses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const Policy = mongoose.model('Policy', policySchema);

module.exports = Policy;
