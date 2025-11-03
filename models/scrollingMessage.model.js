const mongoose = require('mongoose');

const scrollingMessageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    urlname: {
        type: String,
        unique: true, // Ensure uniqueness
        required: true,
    },
}, { timestamps: true });

const ScrollingMessage = mongoose.model('ScrollingMessage', scrollingMessageSchema);

module.exports = ScrollingMessage;
