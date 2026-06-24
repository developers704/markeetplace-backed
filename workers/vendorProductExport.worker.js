const { Worker } = require('bullmq');
const { createBullConnection } = require('../config/bullmq.redis');
const { QUEUE_NAME } = require('../queues/vendorProductExport.queue');
const {
  runVendorProductExport,
  markExportFailed,
} = require('../services/vendorProductExport.service');

let worker;

function startVendorProductExportWorker() {
  if (worker) return worker;

  const connection = createBullConnection();

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { exportHistoryId } = job.data;
      if (!exportHistoryId) {
        throw new Error('Missing exportHistoryId in job payload');
      }
      return runVendorProductExport(exportHistoryId);
    },
    {
      connection,
      concurrency: Number(process.env.VENDOR_EXPORT_WORKER_CONCURRENCY) || 1,
    },
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[vendor-product-export] job ${job.id} completed — ${result?.totalRecords ?? 0} rows`,
    );
  });

  worker.on('failed', async (job, err) => {
    console.error(`[vendor-product-export] job ${job?.id} failed:`, err?.message || err);
    const exportHistoryId = job?.data?.exportHistoryId;
    if (!exportHistoryId || !job) return;

    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 3;
    if (attemptsMade >= maxAttempts) {
      await markExportFailed(exportHistoryId, err?.message || 'Export failed after retries');
    }
  });

  worker.on('error', (err) => {
    console.error('[vendor-product-export] worker error:', err.message);
  });

  console.log('[vendor-product-export] BullMQ worker started');
  return worker;
}

module.exports = { startVendorProductExportWorker };
