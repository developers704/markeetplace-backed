const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        maxlength: 150,
        trim: true
    },
    email: {
        type: String,
        unique: true,
        maxlength: 255,
        trim: true,
        sparse: true // Make email optional and allow uniqueness on non-required field
    },
    password: {
        type: String,
        required: true
    },
    phone_number: {
        type: String,
        trim: true,
        required: true,
        unique: true // Phone number is now unique
    },
    // barcode: {
    //     type: String,
    //     unique: true,
    //     required: true
    // },
    date_joined: {
        type: Date,
        required: true,
        default: Date.now
    },
    verified: {
        type: Boolean,
        default: true
    },
    // verificationToken: String,
    otpCode: {
        type: String,
        default: null
    },
    otpExpires: {
        type: Date,
        default: null
    },
    addresses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address'
    }],
    isDeactivated: {
    type: Boolean,
    default: false
  },
  deactivationDate: {
    type: Date,
    default: null
  },
  // Optional fields
  city: {
    type: String,
    trim: true,
    default: null // Optional field with default value
},
date_of_birth: {
    type: Date,
    default: null // Optional field with default value
},
gender: {
    type: String,
    default: null
},
profileImage: {
    type: String, // Store the path or URL of the profile image
    default: null
},

role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserRole',
    required: true
},
warehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        default: null
},
lastLoginDate: {
    type: Date,
    default: Date.now
},
lastProductCheckDate: {
    type: Date,
    default: null
},
department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
},
termsAccepted: {
    type: Boolean,
    default: false
},
termsAcceptedDate: {
    type: Date,
    default: null
},



}, {
    timestamps: true
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
