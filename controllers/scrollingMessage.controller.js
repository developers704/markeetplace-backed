const ScrollingMessage = require('../models/scrollingMessage.model');

const generateUrlname = (content) => {
    return content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .trim();
};

const createScrollingMessage = async (req, res) => {
    try {
        const { content } = req.body;
        const urlname = generateUrlname(content);

        // Ensure uniqueness
        const existing = await ScrollingMessage.findOne({ urlname });
        if (existing) {
            return res.status(400).json({ message: 'A scrolling message with the same URL name already exists.' });
        }

        const scrollingMessage = new ScrollingMessage({ content, urlname });
        await scrollingMessage.save();
        res.status(201).json({ message: 'Scrolling message created successfully', scrollingMessage });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all scrolling messages
const getAllScrollingMessages = async (req, res) => {
    try {
        const scrollingMessages = await ScrollingMessage.find();
        res.status(200).json(scrollingMessages);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get only active scrolling messages (Public)
const getActiveScrollingMessages = async (req, res) => {
    try {
        const activeMessages = await ScrollingMessage.find({ isActive: true });
        res.status(200).json(activeMessages);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const updateScrollingMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { content, isActive } = req.body;

        const scrollingMessage = await ScrollingMessage.findById(id);
        if (!scrollingMessage) {
            return res.status(404).json({ message: 'Scrolling message not found' });
        }

        if (content) {
            const urlname = generateUrlname(content);

            // Ensure uniqueness
            const existing = await ScrollingMessage.findOne({ urlname });
            if (existing && existing._id.toString() !== scrollingMessage._id.toString()) {
                return res.status(400).json({ message: 'A scrolling message with the same URL name already exists.' });
            }

            scrollingMessage.content = content;
            scrollingMessage.urlname = urlname;
        }
        if (typeof isActive !== 'undefined') scrollingMessage.isActive = isActive;

        await scrollingMessage.save();
        res.status(200).json({ message: 'Scrolling message updated successfully', scrollingMessage });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



// Bulk delete scrolling messages
const bulkDeleteScrollingMessages = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Please provide an array of valid IDs to delete.' });
        }

        const result = await ScrollingMessage.deleteMany({ _id: { $in: ids } });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No scrolling messages found for the provided IDs.' });
        }

        res.status(200).json({
            message: `${result.deletedCount} scrolling messages deleted successfully.`,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    createScrollingMessage,
    getAllScrollingMessages,
    updateScrollingMessage,
    bulkDeleteScrollingMessages,
    getActiveScrollingMessages
};
