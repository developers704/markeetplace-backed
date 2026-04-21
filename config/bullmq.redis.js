/**
 * Dedicated Redis connections for BullMQ.
 * BullMQ requires maxRetriesPerRequest: null (unlike default ioredis).
 */
const IORedis = require('ioredis');

function createBullConnection() {
  const uri = process.env.REDIS_URI;
  if (!uri) {
    throw new Error('REDIS_URI is required for BullMQ (vendor CSV import queue)');
  }
  return new IORedis(uri, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

module.exports = { createBullConnection };
