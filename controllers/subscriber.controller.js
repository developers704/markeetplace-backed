const Subscriber = require('../models/subscriber.model.js');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

// Subscribe to the newsletter
const subscribe = async (req, res) => {
    try {
        const { email } = req.body;

        // Check if the email already exists
        const existingSubscriber = await Subscriber.findOne({ email });
        if (existingSubscriber) {
            return res.status(400).json({ message: 'Email is already subscribed' });
        }

        const subscriber = new Subscriber({ email });
        await subscriber.save();

        res.status(201).json({ message: 'Subscribed successfully', subscriber });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


// Unsubscribe from the newsletter
const unsubscribe = async (req, res) => {
    try {
        const { email } = req.body;

        // Find the subscriber and delete
        const subscriber = await Subscriber.findOneAndDelete({ email });
        if (!subscriber) {
            return res.status(404).json({ message: 'Email not found' });
        }

        res.status(200).json({ message: 'Unsubscribed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Export subscribers to CSV
const exportSubscribers = async (req, res) => {
    try {
        const subscribers = await Subscriber.find().select('email subscribedAt -_id');

        const fields = ['email', 'subscribedAt'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(subscribers);

        res.header('Content-Type', 'text/csv');
        res.attachment('subscribers.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


module.exports = { subscribe, unsubscribe, exportSubscribers };
