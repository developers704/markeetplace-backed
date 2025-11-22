const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    // policy type: terms, privacy, refund, nda, etc.
    policyType: {
        type: String,
        enum: ['terms', 'privacy', 'refund', 'nda'],
        default: 'terms',
        required: true
    },
    content: {
        type: String,
        required: true
    },
    // numeric versioning for easy comparison and auto-incrementing
    version: {
        type: Number,
        required: true,
        default: 1
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
    // Admin can force specific users to re-accept a policy
    forceForUsers: [
        {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
            forcedAt: { type: Date, default: Date.now }
        }
    ],
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
