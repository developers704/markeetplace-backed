// guestOrAuthMiddleware.js
const jwt = require('jsonwebtoken');
const Customer = require('../models/customer.model');

const guestOrAuthMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        const sessionId = req.header('sessionId'); // Custom header for session ID
        //console.log('Session ID:', sessionId);

        // If Authorization header is present, attempt JWT authentication
        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.user = await Customer.findById(decoded.id);
                if (req.user) {
                    return next(); // Customer is authenticated, proceed to the next middleware
                }
            }
        }       

        // If no customer is authenticated, check for session ID for guest users
        if (!sessionId) {
            return res.status(400).json({ message: 'Session ID is required for guest users' });
        }

        req.sessionId = sessionId;
        next();
    } catch (error) {
        res.status(400).json({ message: 'Error processing request', error: error.message });
    }
};

module.exports = guestOrAuthMiddleware;
