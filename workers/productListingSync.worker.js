const { Worker } = require('bullmq');
const { createBullConnection } = require('../config/bullmq.redis');
const { QUEUE_NAME } = require('../queues/productListingSync.queue');
const { syncProductListing } = require('../services/productListingSync.service');
const redis = require('../config/redis');

let worker;

const INTERNAL_LISTING_PARALLEL =
  Number(process.env.PRODUCT_LISTING_SYNC_INTERNAL_CONCURRENCY) || 25;

async function syncProductListingsInSlices(productIds) {
  const ids = (productIds || []).filter(Boolean);
  for (let i = 0; i < ids.length; i += INTERNAL_LISTING_PARALLEL) {
    const slice = ids.slice(i, i + INTERNAL_LISTING_PARALLEL);
    await Promise.all(slice.map((id) => syncProductListing(id, false)));
  }
}

function startProductListingSyncWorker() {
  if (worker) return worker;

  const connection = createBullConnection();

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { productIds } = job.data;
      if (!Array.isArray(productIds) || productIds.length === 0) return;
      await syncProductListingsInSlices(productIds);
      if (redis.incrListingCacheVersion) await redis.incrListingCacheVersion();
    },
    {
      connection,
      concurrency: Number(process.env.PRODUCT_LISTING_WORKER_CONCURRENCY) || 8,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[${QUEUE_NAME}] job ${job?.id} failed:`, err?.message || err);
  });

  console.log(`[${QUEUE_NAME}] worker started`);
  return worker;
}

module.exports = { startProductListingSyncWorker };
