const User = require('../models/user.model.js');

// Middleware to check if the user is a superuser or has the required permission for a specific page
const checkSuperuserOrPermission = (page, action) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            const user = await User.findById(userId).populate('role');

            if (user && user.is_superuser) {
                // User is a superuser, allow access
                return next();
            }

            if (user && user.role && user.role.permissions) {
                const pagePermissions = user.role.permissions.get(page);
                if (pagePermissions && pagePermissions[action] === true) {
                    // User has the required permission for the specific page, allow access
                    return next();
                }
            }

            // User is neither a superuser nor has the required permission
            return res.status(403).json({ message: 'Forbidden: You do not have the required permissions' });
        } catch (error) {
            return res.status(500).json({ message: 'Server error', error: error.message });
        }
    };
};

module.exports = checkSuperuserOrPermission;
