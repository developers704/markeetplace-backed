const { Queue } = require('bullmq');
const { createBullConnection } = require('../config/bullmq.redis');

const QUEUE_NAME = 'sku-inventory-import';

let queue;

function getSkuInventoryImportQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 8000 },
        removeOnComplete: { age: 86400, count: 500 },
        removeOnFail: { age: 604800, count: 200 },
      },
    });
  }
  return queue;
}

/**
 * @param {{ importJobId: string, csvPath: string, jobId: string, mode: string }} data
 */
async function enqueueSkuInventoryImport(data) {
  const q = getSkuInventoryImportQueue();
  return q.add('sku-inventory-import', data, { jobId: data.jobId });
}

module.exports = {
  QUEUE_NAME,
  getSkuInventoryImportQueue,
  enqueueSkuInventoryImport,
};
