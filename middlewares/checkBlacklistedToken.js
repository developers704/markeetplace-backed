const BlacklistedToken = require('../models/blacklistedToken.model');

const checkBlacklistedToken = async (req, res, next) => {
    const token = req.header('Authorization').replace('Bearer ', '');
    
    const blacklistedToken = await BlacklistedToken.findOne({ token });
    if (blacklistedToken) {
        return res.status(401).json({ message: 'Your session has expired or been invalidated. Please log in again to continue.' });
    }

    next();
};

module.exports = checkBlacklistedToken;
