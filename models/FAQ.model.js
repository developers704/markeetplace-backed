const mongoose = require('mongoose');

// Define the schema for the FAQ model
const faqSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
        maxlength: 255
    },
    answer: {
        type: String,
        required: true
    }
}, {
    timestamps: true // This will add createdAt and updatedAt fields automatically
});

// Create the model from the schema
const FAQ = mongoose.model('FAQ', faqSchema);

module.exports = FAQ;
