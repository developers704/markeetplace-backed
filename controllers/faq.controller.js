const FAQ = require('../models/FAQ.model');

// Controller to create a FAQ
const createFAQ = async (req, res) => {
    try {
        const { question, answer } = req.body;

        // Validate the input fields
        if (!question || !answer) {
            return res.status(400).json({ message: 'Please provide both question and answer.' });
        }

        const newFAQ = new FAQ({
            question,
            answer
        });

        await newFAQ.save();
        res.status(201).json(newFAQ);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Controller to get all FAQs
const getFAQs = async (req, res) => {
    try {
        const faqs = await FAQ.find().sort({ createdAt: -1 });
        res.status(200).json(faqs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// Controller to update a FAQ
const updateFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer } = req.body;

        // Validate that at least one of question or answer is provided
        if (!question && !answer) {
            return res.status(400).json({ message: 'Please provide either question or answer to update.' });
        }

        // Find the FAQ by ID
        const faq = await FAQ.findById(id);
        if (!faq) {
            return res.status(404).json({ message: 'FAQ not found' });
        }

        // Update the fields if they are provided
        if (question) faq.question = question;
        if (answer) faq.answer = answer;

        // Save the updated FAQ
        await faq.save();

        res.status(200).json(faq);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Controller to delete a FAQ
const deleteFAQ = async (req, res) => {
    try {
        const { id } = req.params;

        const faq = await FAQ.findByIdAndDelete(id);
        if (!faq) {
            return res.status(404).json({ message: 'FAQ not found' });
        }

        res.status(200).json({ message: 'FAQ deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createFAQ, getFAQs, updateFAQ, deleteFAQ };
