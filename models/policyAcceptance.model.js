const mongoose = require('mongoose');

const policyAcceptanceSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    warehouse: {
       type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
    },
    policy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy',
        required: true
    },
    signatureData: {
        type: String,  // Store base64 image data of the signature
    },
    signedDocumentPath:{
        type: String
    },
    photoPath:{
        type: String,
        default: null
    },
    acceptedAt: {
        type: Date,
        default: Date.now
    },
    ipAddress: {
        type: String,
        default: null
    },
    userAgent: {
        type: String,
        default: null
    },
    policyVersion: {
        type: String,  // Store the version of the policy at acceptance time
        required: true
    },
    policySnapshot: {
        type: String,  // Store the content of the policy at acceptance time
        required: true
    }
}, {
    timestamps: true
});

// Compound index to ensure a customer can only accept a specific policy once
// If you want to allow multiple acceptances of different versions, remove this
policyAcceptanceSchema.index({ customer: 1, policy: 1 }, { unique: true });

const PolicyAcceptance = mongoose.model('PolicyAcceptance', policyAcceptanceSchema);

module.exports = PolicyAcceptance;
