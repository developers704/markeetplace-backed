/**
 * Redis for listing cache (optional). Set REDIS_URI in .env to enable.
 */

const Redis = require('ioredis');

let client = null;
const LISTING_GEN_KEY = 'listing:v2:gen';

function getClient() {
  if (client) return client;
  const socketPath = '/home/vallian1/.redis/redis.sock';
  // const uri = process.env.REDIS_URI;
  
  // if (!uri) return null;
  try {
    client = new Redis({
      path: socketPath, 
      maxRetriesPerRequest: 3 
      });

    // Event: Error
    client.on('error', (err) => console.error('[Redis]', err.message));

    // Event: Ready (connected and ready)
    client.on('ready', () => {
      console.log('✅ Redis connected');
    });

    return client;
  } catch (e) {
    console.error('[Redis] Failed to initialize client', e.message);
    return null;
  }
}

async function getListingCacheVersion() {
  const c = getClient();
  if (!c) return '0';
  try {
    let v = await c.get(LISTING_GEN_KEY);
    if (v == null || v === '') {
      await c.set(LISTING_GEN_KEY, '1');
      return '1';
    }
    return v;
  } catch (err) {
    console.error('[Redis] getListingCacheVersion error:', err.message);
    return '0';
  }
}

async function incrListingCacheVersion() {
  const c = getClient();
  if (!c) return;
  try {
    await c.incr(LISTING_GEN_KEY);
  } catch (err) {
    console.error('[Redis] incrListingCacheVersion error:', err.message);
  }
}

module.exports = {
  getClient,
  getListingCacheVersion,
  incrListingCacheVersion,
  LISTING_GEN_KEY,
};
