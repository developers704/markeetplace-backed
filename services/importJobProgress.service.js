/**
 * ImportJob Mongo updates + Redis mirror + Socket.IO (admin progress).
 */

const ImportJob = require('../models/importJob.model');
const { getClient } = require('../config/redis');
const { filePathToPublicUrl } = require('../config/uploadPaths');

const REDIS_KEY = (jobId) => `import:progress:${jobId}`;
const TTL_SEC = Number(process.env.IMPORT_PROGRESS_REDIS_TTL_SEC) || 86400 * 2;

function emitProgress(doc) {
  if (!doc?.jobId) return;
  try {
    const { emitImportJobProgress } = require('../socket/importProgress.socket');
    emitImportJobProgress({
      jobId: doc.jobId,
      type: doc.type || null,
      status: doc.status,
      totalRows: doc.totalRows,
      validRows: doc.validRows,
      processedRows: doc.processedRows,
      failedRows: doc.failedRows,
      progressPercent: doc.progressPercent,
      errorReportUrl: doc.errorReportPath ? filePathToPublicUrl(doc.errorReportPath) : null,
      sourceCsvUrl: doc.csvPath ? filePathToPublicUrl(doc.csvPath) : null,
      errorMessage: doc.errorMessage || null,
      updatedAt: doc.updatedAt,
    });
  } catch (_) {}
}

async function writeImportProgressRedis(doc) {
  const c = getClient();
  if (!c || !doc?.jobId) return;
  const key = REDIS_KEY(doc.jobId);
  await c.hset(key, {
    status: String(doc.status || ''),
    type: String(doc.type || ''),
    totalRows: String(doc.totalRows ?? 0),
    validRows: String(doc.validRows ?? 0),
    processedRows: String(doc.processedRows ?? 0),
    failedRows: String(doc.failedRows ?? 0),
    progressPercent: String(doc.progressPercent ?? 0),
    errorMessage: String(doc.errorMessage || ''),
  });
  await c.expire(key, TTL_SEC);
}

async function getImportProgressRedis(jobId) {
  const c = getClient();
  if (!c || !jobId) return null;
  const h = await c.hgetall(REDIS_KEY(jobId));
  if (!h || Object.keys(h).length === 0) return null;
  return {
    status: h.status,
    type: h.type,
    totalRows: parseInt(h.totalRows, 10) || 0,
    validRows: parseInt(h.validRows, 10) || 0,
    processedRows: parseInt(h.processedRows, 10) || 0,
    failedRows: parseInt(h.failedRows, 10) || 0,
    progressPercent: parseInt(h.progressPercent, 10) || 0,
    errorMessage: h.errorMessage || null,
  };
}

async function patchImportJob(importJobId, $set) {
  const doc = await ImportJob.findByIdAndUpdate(importJobId, { $set }, { new: true }).lean();
  if (doc) {
    await writeImportProgressRedis(doc);
    emitProgress(doc);
  }
  return doc;
}

/**
 * If Mongo/Redis show work finished but job never got completedAt (worker crash / missed final patch),
 * finalize only when metrics are unambiguous — not while a job shows 100% valid rows written but
 * post-pass (Redis / listings) is still running.
 */
async function repairStalledImportJobByJobId(jobId, merged) {
  if (!jobId || !merged) return null;
  const { status, completedAt, progressPercent, processedRows, totalRows, validRows, updatedAt } =
    merged;
  if (completedAt) return null;
  if (!['processing', 'queued'].includes(String(status || ''))) return null;
  const pct = Number(progressPercent) || 0;
  const proc = Number(processedRows) || 0;
  const tot = Number(totalRows) || 0;
  const val = Number(validRows) || 0;

  const staleMs = Number(process.env.IMPORT_STUCK_JOB_REPAIR_AFTER_MS) || 20 * 60 * 1000;
  const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : 0;
  const stale = updatedAtMs > 0 && Date.now() - updatedAtMs > staleMs;

  const allFileDone = tot > 0 && proc >= tot;
  const allValidDone = val > 0 && proc >= val;

  /** Stuck below 100% while every valid row was already written (legacy 99% cap / missed final patch). */
  const shouldFinalizeStuckValid = stale && allValidDone && pct < 100;
  /** Every physical file row accounted for (rare; keeps previous totalRows-based escape hatch). */
  const shouldFinalizeAllFile = stale && allFileDone;

  const shouldFinalize = shouldFinalizeStuckValid || shouldFinalizeAllFile;
  if (!shouldFinalize) return null;

  const updated = await ImportJob.findOneAndUpdate(
    { jobId: String(jobId), completedAt: null, status: { $in: ['processing', 'queued'] } },
    { $set: { status: 'completed', progressPercent: 100, completedAt: new Date() } },
    { new: true }
  ).lean();
  if (updated) {
    await writeImportProgressRedis(updated);
    emitProgress(updated);
  }
  return updated;
}

module.exports = {
  patchImportJob,
  getImportProgressRedis,
  writeImportProgressRedis,
  emitProgress,
  repairStalledImportJobByJobId,
};
