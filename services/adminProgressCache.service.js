const crypto = require('crypto');
const { getClient } = require('../config/redis');

const GEN_KEY = 'adminProgress:v1:gen';
const INDEX_PREFIX = 'adminProgress:index:v1';
const USER_PREFIX = 'adminProgress:user:v1';
const TTL_SEC = Number(process.env.ADMIN_PROGRESS_CACHE_TTL_SECONDS || 86400);

function getRedis() {
  return getClient();
}

async function getCacheVersion() {
  const redis = getRedis();
  if (!redis) return '0';
  try {
    let v = await redis.get(GEN_KEY);
    if (!v) {
      await redis.set(GEN_KEY, '1');
      return '1';
    }
    return v;
  } catch (e) {
    console.warn('[adminProgressCache] getCacheVersion:', e.message);
    return '0';
  }
}

async function bumpAdminProgressCache() {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.incr(GEN_KEY);
  } catch (e) {
    console.warn('[adminProgressCache] bump:', e.message);
  }
}

function hashFilters(filters = {}) {
  const stable = JSON.stringify(filters);
  return crypto.createHash('sha1').update(stable).digest('hex');
}

function buildIndexCacheKey(filters) {
  return `${INDEX_PREFIX}:${hashFilters(filters)}`;
}

function buildUserCacheKey(userId, version) {
  return `${USER_PREFIX}:${version}:${String(userId)}`;
}

async function getIndexCache(filters) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const version = await getCacheVersion();
    const raw = await redis.get(`${buildIndexCacheKey(filters)}:v${version}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[adminProgressCache] getIndexCache:', e.message);
    return null;
  }
}

async function setIndexCache(filters, payload) {
  const redis = getRedis();
  if (!redis) return;
  try {
    const version = await getCacheVersion();
    const key = `${buildIndexCacheKey(filters)}:v${version}`;
    await redis.setex(key, TTL_SEC, JSON.stringify(payload));
  } catch (e) {
    console.warn('[adminProgressCache] setIndexCache:', e.message);
  }
}

async function getUserDetailCache(userId) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const version = await getCacheVersion();
    const raw = await redis.get(buildUserCacheKey(userId, version));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[adminProgressCache] getUserDetailCache:', e.message);
    return null;
  }
}

async function setUserDetailCache(userId, payload) {
  const redis = getRedis();
  if (!redis) return;
  try {
    const version = await getCacheVersion();
    const key = buildUserCacheKey(userId, version);
    await redis.setex(key, TTL_SEC, JSON.stringify(payload));
  } catch (e) {
    console.warn('[adminProgressCache] setUserDetailCache:', e.message);
  }
}

module.exports = {
  bumpAdminProgressCache,
  getIndexCache,
  setIndexCache,
  getUserDetailCache,
  setUserDetailCache,
};
