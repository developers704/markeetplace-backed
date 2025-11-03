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
        req.user = await User.findById(decoded.id) || await Customer.findById(decoded.id);
        if (!req.user) {
            return res.status(401).json({ message: 'User not found. Please log in again.' });
        }
        next();
    } catch (error) {
        res.status(400).json({ message: 'Invalid token. Please log in again.', error: error.message });
    }
};


module.exports = authMiddleware;


// const jwt = require('jsonwebtoken');
// const User = require('../models/user.model');
// const Customer = require('../models/customer.model');

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
        
//         let user = null;
//         let userType = null;
        
//         // ✅ Check if it's a Customer first (based on isCustomer flag in token)
//         if (decoded.isCustomer) {
//             user = await Customer.findById(decoded.id)
//                 .populate('role', 'role_name permissions')
//                 .populate('warehouse', 'name location');
//             userType = 'customer';
//         } else {
//             // ✅ Check User table
//             user = await User.findById(decoded.id)
//                 .populate('role', 'role_name permissions')
//                 .populate('warehouse', 'name location');
//             userType = 'user';
//         }
        
//         // ✅ If not found in expected table, try the other one
//         if (!user) {
//             if (userType === 'customer') {
//                 user = await User.findById(decoded.id)
//                     .populate('role', 'role_name permissions')
//                     .populate('warehouse', 'name location');
//                 userType = 'user';
//             } else {
//                 user = await Customer.findById(decoded.id)
//                     .populate('role', 'role_name permissions')
//                     .populate('warehouse', 'name location');
//                 userType = 'customer';
//             }
//         }
        
//         if (!user) {
//             return res.status(401).json({ message: 'User not found. Please log in again.' });
//         }

//         // ✅ Set req.user with proper structure for both User & Customer
//         req.user = {
//             id: user._id,
//             email: user.email,
//             name: user.name || user.firstName + ' ' + user.lastName, // Handle different name fields
//             role: user.role?._id,           // Role ID
//             warehouse: user.warehouse?._id,  // Warehouse ID
//             roleData: user.role,            // Complete role object
//             warehouseData: user.warehouse,  // Complete warehouse object
//             userType: userType,             // 'user' or 'customer'
//             isCustomer: userType === 'customer',
//             fullUserData: user              // Complete user/customer object
//         };

//         console.log('Auth Middleware - User Info:', {
//             id: req.user.id,
//             email: req.user.email,
//             userType: req.user.userType,
//             role: req.user.role,
//             warehouse: req.user.warehouse,
//             roleName: req.user.roleData?.role_name
//         });

//         next();
//     } catch (error) {
//         console.error('Auth Middleware Error:', error);
//         res.status(400).json({ message: 'Invalid token. Please log in again.', error: error.message });
//     }
// };

// module.exports = authMiddleware;

