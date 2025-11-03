const mongoose = require('mongoose');

// Define the schema for the User model
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        maxlength: 150,
        trim: true // Trim whitespace from the input
    },
    email: {
        type: String,
        required: true,
        unique: true,
        maxlength: 255,
        trim: true // Trim whitespace from the input
    },
    password: {
        type: String,
        required: true
    },
    phone_number: {
        type: String,
        trim: true, // Trim whitespace from the input
        required: true // Validate format 
    },
    date_joined: {
        type: Date,
        required: true,
        default: Date.now
    },
    is_superuser: {
        type: Boolean,
        required: true,
        default: false
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
    otpCode: {
        type: String,
        default: null
    },
    otpExpires: {
        type: Date,
        default: null
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
    }

}, {
    timestamps: true // Include createdAt and updatedAt timestamps
});

// Create the model from the schema
const User = mongoose.model('User', userSchema);

module.exports = User;
