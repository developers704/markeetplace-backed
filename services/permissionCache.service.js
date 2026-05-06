/**
 * RBAC permission resolution with Redis cache (DB is source of truth).
 * Cache key: permissions:user:<userId> — invalidated when roles/permissions change.
 */
const Redis = require('ioredis');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const importProgressSocket = require('../socket/importProgress.socket');

const TTL_SEC = Number(process.env.PERMISSION_CACHE_TTL_SECONDS || 3600);

let redisClient = null;

function getRedis() {
  if (redisClient === false) return null;
  if (redisClient) return redisClient;
  try {
    if (process.env.REDIS_URL) {
      redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    } else if (process.env.REDIS_HOST) {
      redisClient = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 1,
      });
    } else {
      redisClient = false;
      return null;
    }
    redisClient.on('error', (e) => console.warn('[permissionCache] Redis error:', e.message));
    return redisClient;
  } catch (e) {
    console.warn('[permissionCache] Redis unavailable:', e.message);
    redisClient = false;
    return null;
  }
}

function cacheKey(userId) {
  return `permissions:user:${String(userId)}`;
}

/**
 * UserRole.permissions is a Mongoose Map of subdocuments — spread/entries alone often
 * omit getter-backed booleans; always convert to plain objects.
 */
function permissionActionsToPlain(actions) {
  if (actions == null) return null;
  if (typeof actions.toObject === 'function') {
    return actions.toObject({ getters: true, versionKey: false });
  }
  if (actions instanceof Map) {
    const o = {};
    for (const [k, v] of actions.entries()) {
      o[k] = permissionActionsToPlain(v) ?? v;
    }
    return o;
  }
  if (typeof actions === 'object') {
    return { ...actions };
  }
  return null;
}

function rolePermissionsToNested(mapOrObj) {
  const out = {};
  if (!mapOrObj) return out;
  const entries =
    mapOrObj instanceof Map ? [...mapOrObj.entries()] : Object.entries(mapOrObj);
  for (const [moduleName, actions] of entries) {
    const plain = permissionActionsToPlain(actions);
    if (!plain || typeof plain !== 'object') continue;
    out[moduleName] = plain;
  }
  return out;
}

function nestedToFlatTrueKeys(nested) {
  const flat = {};
  for (const [mod, actions] of Object.entries(nested || {})) {
    if (!actions || typeof actions !== 'object') continue;
    for (const [act, val] of Object.entries(actions)) {
      if (act.startsWith('_')) continue;
      // Strict true from DB; tolerate legacy string booleans
      if (val === true || val === 'true') flat[`${mod}:${act}`] = true;
    }
  }
  return flat;
}

function normalizeRoleName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function computeIsAdmin(account, roleDoc) {
  if (account && account.is_superuser) return true;
  const n = normalizeRoleName(roleDoc?.role_name);
  if (n === 'superuser' || n === 'superadmin') return true;
  if (roleDoc?.role_name === 'Super User') return true;
  return false;
}

async function loadAccountWithRole(userId) {
  const sid = String(userId);
  let doc = await Customer.findById(sid).populate('role');
  if (!doc) doc = await User.findById(sid).populate('role');
  return doc;
}

function buildPayloadFromAccount(account) {
  const roleDoc = account.role;
  const modules = rolePermissionsToNested(roleDoc?.permissions);
  const permissions = nestedToFlatTrueKeys(modules);
  const roleName = roleDoc?.role_name || '';
  const isAdmin = computeIsAdmin(account, roleDoc);
  return {
    roles: roleName ? [roleName] : [],
    permissions,
    modules,
    isAdmin,
  };
}

/**
 * Load permissions for JWT subject id (Customer or User _id).
 */
async function getPermissionsForUserId(userId) {
  const r = getRedis();
  const key = cacheKey(userId);
  if (r) {
    try {
      const cached = await r.get(key);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn('[permissionCache] Redis get failed:', e.message);
    }
  }

  const account = await loadAccountWithRole(userId);
  if (!account) return null;

  const payload = buildPayloadFromAccount(account);
  if (r) {
    try {
      await r.setex(key, TTL_SEC, JSON.stringify(payload));
    } catch (e) {
      console.warn('[permissionCache] Redis set failed:', e.message);
    }
  }
  return payload;
}

async function invalidateUserPermissionCache(userId) {
  const r = getRedis();
  if (!r || userId == null) return;
  try {
    await r.del(cacheKey(userId));
  } catch (e) {
    console.warn('[permissionCache] Redis del failed:', e.message);
  }
}

function emitPermissionsUpdated(userId, reason) {
  try {
    importProgressSocket.emitPermissionsUpdated(String(userId), {
      userId: String(userId),
      reason,
      at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[permissionCache] Socket emit failed:', e.message);
  }
}

/**
 * Invalidate cache + notify socket for every Customer/User with this role.
 */
async function invalidateUsersForRole(roleId) {
  if (!roleId) return;
  const rid = mongoose.Types.ObjectId.isValid(String(roleId))
    ? new mongoose.Types.ObjectId(String(roleId))
    : roleId;

  const [userIds, customerIds] = await Promise.all([
    User.find({ role: rid }).distinct('_id'),
    Customer.find({ role: rid }).distinct('_id'),
  ]);
  const all = [...userIds, ...customerIds].map((id) => String(id));
  const uniq = [...new Set(all)];

  for (const uid of uniq) {
    await invalidateUserPermissionCache(uid);
    emitPermissionsUpdated(uid, 'role-permissions-updated');
  }
}

/**
 * After a single user row update (User + linked Customer may share role changes).
 */
async function invalidateLinkedAccounts(userId, linkedCustomerId) {
  const ids = [userId, linkedCustomerId].filter(Boolean).map(String);
  const uniq = [...new Set(ids)];
  for (const uid of uniq) {
    await invalidateUserPermissionCache(uid);
    emitPermissionsUpdated(uid, 'role-updated');
  }
}

/**
 * Server-side permission check (Redis/DB). Admin/superuser bypass.
 */
async function userHasPagePermission(userId, page, action) {
  const data = await getPermissionsForUserId(userId);
  if (!data) return false;
  if (data.isAdmin) return true;
  return !!(data.modules && data.modules[page] && data.modules[page][action]);
}

module.exports = {
  getPermissionsForUserId,
  invalidateUserPermissionCache,
  invalidateUsersForRole,
  invalidateLinkedAccounts,
  userHasPagePermission,
  buildPayloadFromAccount,
  loadAccountWithRole,
  TTL_SEC,
};
