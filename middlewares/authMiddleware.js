// const jwt = require('jsonwebtoken');
// const User = require('../models/user.model');
// const Customer = require('../models/customer.model');

// //Purpose: This middleware checks if the user is authenticated (logged in) before allowing them to access certain routes.

// const authMiddleware = async (req, res, next) => {
//     try {
//         const authHeader = req.header('Authorization');
//         if (!authHeader) {
//             return res.status(401).json({ message: 'Please log in to access this resource.' });
//         }

//         const token = authHeader.replace('Bearer ', '');
//         if (!token) {
//             return res.status(401).json({ message: 'Please log in to access this resource.' });
//         }

//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         // Check both users and customers
//         req.user = await User.findById(decoded.id) || await Customer.findById(decoded.id);
//         if (!req.user) {
//             return res.status(401).json({ message: 'User not found. Please log in again.' });
//         }
//         next();
//     } catch (error) {
//         res.status(400).json({ message: 'Invalid token. Please log in again.', error: error.message });
//     }
// };


// module.exports = authMiddleware;


const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');

//Purpose: This middleware checks if the user is authenticated (logged in) before allowing them to access certain routes.

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            return res.status(401).json({ message: 'Please log in to access this resource.' });
        }

        const token = authHeader.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: 'Please log in to access this resource.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Check both users and customers
         let user = await Customer.findById(decoded.id);
         if (!user) {
            user = await User.findById(decoded.id);
         }
        // req.user = await User.findById(decoded.id) || await Customer.findById(decoded.id);
        // req.user.selectedWarehouse = decoded.warehouse;
        if (!user) {
            return res.status(401).json({ message: 'User not found. Please log in again.' });
        }
        user = user.toObject({ getters: true });
        user.selectedWarehouse = decoded.warehouse || null;
        req.user = user;
        console.log('Auth Middleware - User Info:', {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            warehouse: req.user.selectedWarehouse,
        });
        next();
    } catch (error) {
        res.status(400).json({ message: 'Invalid token. Please log in again.', error: error.message });
    }
};


module.exports = authMiddleware;