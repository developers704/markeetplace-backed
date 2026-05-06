const {
  userHasPagePermission,
} = require('../services/permissionCache.service');

/**
 * Uses Redis-backed permission resolution (DB source of truth).
 * JWT identifies the user only; permissions are never taken from the token.
 */
const checkSuperuserOrPermission = (page, action) => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id ?? req.user.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const allowed = await userHasPagePermission(userId, page, action);
      if (allowed) {
        return next();
      }

      return res
        .status(403)
        .json({ message: 'Forbidden: You do not have the required permissions' });
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Server error', error: error.message });
    }
  };
};

module.exports = checkSuperuserOrPermission;
