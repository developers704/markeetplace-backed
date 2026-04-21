const { Worker } = require('bullmq');
const { createBullConnection } = require('../config/bullmq.redis');
const { QUEUE_NAME } = require('../queues/skuInventoryImport.queue');
const { runSkuInventoryCsvImport } = require('../services/skuInventoryCsvImport.service');
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

function startSkuInventoryImportWorker() {
  if (worker) return worker;

  const connection = createBullConnection();

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { importJobId, csvPath, mode } = job.data;
      if (!importJobId) throw new Error('Missing importJobId');
      // Heavy Redis + ProductListing work runs once at end of import (see skuInventoryCsvImport.service).
      return runSkuInventoryCsvImport(importJobId, { csvPath, mode });
    },
    {
      connection,
      concurrency: Number(process.env.SKU_INVENTORY_IMPORT_WORKER_CONCURRENCY) || 2,
    }
  );

  worker.on('failed', async (job, err) => {
    const importJobId = job?.data?.importJobId;
    if (!importJobId || !job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 3;
    if (attemptsMade >= maxAttempts) {
      await markJobFailed(importJobId, null, err?.message || 'Worker failed after retries');
    }
  });

  console.log(`[${QUEUE_NAME}] worker started`);
  return worker;
}

module.exports = { startSkuInventoryImportWorker };
