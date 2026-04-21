const { Worker } = require('bullmq');
const { createBullConnection } = require('../config/bullmq.redis');
const { QUEUE_NAME } = require('../queues/vendorCatalogImport.queue');
const { runVendorCatalogImport } = require('../services/vendorCatalogCsvImport.service');
const { patchImportJob } = require('../services/importJobProgress.service');

let worker;

async function markJobFailed(importJobId, _csvPathFromJob, message) {
  await patchImportJob(importJobId, {
    status: 'failed',
    errorMessage: message || 'Import failed',
    completedAt: new Date(),
    progressPercent: 99,
  });
}

function startVendorCatalogImportWorker() {
  if (worker) return worker;

  const connection = createBullConnection();

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { importJobId } = job.data;
      if (!importJobId) {
        throw new Error('Missing importJobId in job payload');
      }
      return runVendorCatalogImport(importJobId);
    },
    {
      connection,
      concurrency: Number(process.env.VENDOR_IMPORT_WORKER_CONCURRENCY) || 2,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[vendor-csv-import] completed job ${job.id}`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[vendor-csv-import] failed job ${job?.id}:`, err?.message || err);
    const importJobId = job?.data?.importJobId;
    if (!importJobId || !job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 3;
    if (attemptsMade >= maxAttempts) {
      await markJobFailed(importJobId, null, err?.message || 'Worker failed after retries');
    }
  });

  worker.on('error', (err) => {
    console.error('[vendor-csv-import] worker error:', err.message);
  });

  console.log('[vendor-csv-import] BullMQ worker started');
  return worker;
}

module.exports = { startVendorCatalogImportWorker };
