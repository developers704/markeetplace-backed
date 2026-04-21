const { Queue } = require('bullmq');
const { createBullConnection } = require('../config/bullmq.redis');

const QUEUE_NAME = 'product-listing-sync';
const CHUNK = Number(process.env.PRODUCT_LISTING_SYNC_JOB_CHUNK) || 100;

let queue;

function getProductListingSyncQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 4000 },
        removeOnComplete: { age: 3600, count: 5000 },
        removeOnFail: { age: 86400, count: 1000 },
      },
    });
  }
  return queue;
}

/**
 * @param {string[]} productIds
 */
async function enqueueProductListingSync(productIds) {
  const ids = [...new Set((productIds || []).map(String).filter(Boolean))];
  if (ids.length === 0) return;
  const q = getProductListingSyncQueue();
  const jobs = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    jobs.push(q.add('batch', { productIds: ids.slice(i, i + CHUNK) }));
  }
  await Promise.all(jobs);
}

module.exports = {
  QUEUE_NAME,
  getProductListingSyncQueue,
  enqueueProductListingSync,
};
