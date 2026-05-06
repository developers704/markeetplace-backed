const checkSuperuserOrPermission = require('./checkSuperuserOrPermission');

/**
 * Reusable permission guard. Same behavior as checkSuperuserOrPermission(page, action).
 * Example: requirePermission('Users', 'Update')
 *
 * For a single combined key: requirePermissionKey('Users:Update')
 */
function requirePermission(page, action) {
  if (action === undefined && typeof page === 'string' && page.includes(':')) {
    const i = page.indexOf(':');
    const p = page.slice(0, i);
    const a = page.slice(i + 1);
    return checkSuperuserOrPermission(p, a);
  }
  return checkSuperuserOrPermission(page, action);
}

module.exports = requirePermission;
