const UserRole = require('../models/userRole.model');

/**
 * Attach role_name and model type to req for B2B endpoints.
 * authMiddleware already sets req.user to a plain object (Customer or User).
 */
const attachRoleContext = async (req, res, next) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const isSystemUser = typeof req.user.is_superuser === 'boolean'; // User model has is_superuser
    const actorModel = isSystemUser ? 'User' : 'Customer';
    const actorId = req.user._id;
    const roleId = req.user.role;

    let roleName = '';
    if (roleId) {
      const roleDoc = await UserRole.findById(roleId).select('role_name').lean();
      roleName = roleDoc?.role_name || '';
    }

    req.b2bActor = {
      id: actorId,
      model: actorModel,
      roleName,
      isSuperUser: !!req.user.is_superuser,
    };

    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to resolve role context', error: error.message });
  }
};

const requireRoles = (...allowed) => {
  return (req, res, next) => {
    const roleName = String(req.b2bActor?.roleName || '').toLowerCase().trim();
    const isSuperUser = !!req.b2bActor?.isSuperUser;
    if (isSuperUser) return next();

    if (!allowed.length) return next();

    const allowedSet = new Set(allowed.map((r) => String(r).toLowerCase().trim()));
    if (allowedSet.has(roleName)) return next();

    return res.status(403).json({ success: false, message: 'Access denied' });
  };
};

const requireAdmin = () => {
  return (req, res, next) => {
    const roleName = String(req.b2bActor?.roleName || '').toLowerCase().trim();
    const isSuperUser = !!req.b2bActor?.isSuperUser;
    if (isSuperUser) return next();
    if (roleName === 'admin' || roleName === 'super admin' || roleName === 'superuser') return next();
    return res.status(403).json({ success: false, message: 'Admin access required' });
  };
};

module.exports = {
  attachRoleContext,
  requireRoles,
  requireAdmin,
};


