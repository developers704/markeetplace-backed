const express = require('express');
const { subscribe, unsubscribe, exportSubscribers } = require('../controllers/subscriber.controller.js');


const router = express.Router();

// Subscribe to the newsletter
router.post('/subscribe', subscribe);

// Unsubscribe from the newsletter
router.delete('/unsubscribe', unsubscribe);

// Export subscribers to CSV
router.get('/export', exportSubscribers);

module.exports = router;