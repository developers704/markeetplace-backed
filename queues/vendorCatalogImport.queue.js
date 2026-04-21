const { Queue } = require('bullmq');
const { createBullConnection } = require('../config/bullmq.redis');

const QUEUE_NAME = 'vendor-csv-import';

let queue;

function getVendorCatalogImportQueue() {
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
 * @param {{ importJobId: string, csvPath: string, jobId: string }} data
 */
async function enqueueVendorCatalogImport(data) {
  const q = getVendorCatalogImportQueue();
  return q.add('vendor-csv-import', data, {
    jobId: data.jobId,
  });
}

module.exports = {
  QUEUE_NAME,
  getVendorCatalogImportQueue,
  enqueueVendorCatalogImport,
};
