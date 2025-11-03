const mongoose = require('mongoose');

// Define the schema for the Dropdown model
const dropdownSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    }
}, {
    timestamps: true
});

// Define the schema for the Contact model
const contactSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        match: [/.+\@.+\..+/, 'Please enter a valid email address']
    },
    phone: {
        type: String,
        required: true,
        trim: true,
        match: [/^\d+$/, 'Please enter a valid phone number'] // Allow any length of digits
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    dropdown: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Dropdown'
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

const Dropdown = mongoose.model('Dropdown', dropdownSchema);
const Contact = mongoose.model('Contact', contactSchema);

module.exports = { Contact, Dropdown };
