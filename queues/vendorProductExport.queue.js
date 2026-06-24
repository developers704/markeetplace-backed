const { Queue } = require('bullmq');
const { createBullConnection } = require('../config/bullmq.redis');

const QUEUE_NAME = 'vendor-product-export';

let queue;

function getVendorProductExportQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { age: 86400, count: 200 },
        removeOnFail: { age: 604800, count: 100 },
      },
    });
  }
  return queue;
}

/**
 * @param {{ exportHistoryId: string, exportId: string }} data
 */
async function enqueueVendorProductExport(data) {
  const q = getVendorProductExportQueue();
  return q.add('vendor-product-export', data, {
    jobId: `export-${data.exportId}`,
  });
}

module.exports = {
  QUEUE_NAME,
  getVendorProductExportQueue,
  enqueueVendorProductExport,
};
