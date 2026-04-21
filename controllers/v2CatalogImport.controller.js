const { v4: uuidv4 } = require('uuid');

const { toStoredUploadRelative, filePathToPublicUrl } = require('../config/uploadPaths');
const ImportJob = require('../models/importJob.model');
const { enqueueVendorCatalogImport } = require('../queues/vendorCatalogImport.queue');
const { getImportProgressRedis, repairStalledImportJobByJobId } = require('../services/importJobProgress.service');

/**
 * Vendor catalog CSV import — enqueue only (BullMQ worker processes file).
 */
const importVendorCatalog = async (req, res) => {
  try {
    if (!req.file?.path) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded (csvFile).' });
    }

    const jobId = uuidv4();
    const csvStored = toStoredUploadRelative(req.file.path);
    const doc = await ImportJob.create({
      jobId,
      status: 'queued',
      type: 'vendor-csv-import',
      csvPath: csvStored,
      originalFilename: req.file.originalname || '',
      requestedBy: req.user?._id || null,
    });

    try {
      const { emitImportJobProgress } = require('../socket/importProgress.socket');
      emitImportJobProgress({
        jobId: doc.jobId,
        type: doc.type,
        status: 'queued',
        totalRows: 0,
        validRows: 0,
        processedRows: 0,
        failedRows: 0,
        progressPercent: 0,
      });
    } catch (_) {}

    try {
      const bullJob = await enqueueVendorCatalogImport({
        importJobId: String(doc._id),
        csvPath: csvStored,
        jobId,
      });
      await ImportJob.updateOne({ _id: doc._id }, { $set: { bullJobId: String(bullJob.id) } });
    } catch (queueErr) {
      await ImportJob.deleteOne({ _id: doc._id }).catch(() => {});
      console.error('[importVendorCatalog] queue error:', queueErr);
      return res.status(503).json({
        success: false,
        message: 'Import queue unavailable (check Redis / REDIS_URI)',
        error: queueErr.message,
      });
    }

    return res.status(202).json({
      success: true,
      message:
        'Import queued. Connect Socket.IO and emit subscribeVendorImport with your JWT for live progress.',
      jobId: doc.jobId,
      importJobId: doc._id,
      socket: {
        eventSubscribe: 'subscribeVendorImport',
        eventProgress: 'vendorImportProgress',
        payloadExample: { jobId: doc.jobId, token: '<same JWT as Authorization Bearer>' },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to queue vendor catalog import',
      error: error.message,
    });
  }
};

const getVendorImportJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const doc = await ImportJob.findOne({ jobId }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Job not found' });

    const uid = String(req.user._id);
    if (doc.requestedBy) {
      if (String(doc.requestedBy) !== uid && !req.user.is_superuser) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    } else if (!req.user.is_superuser) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const errorReportUrl = doc.errorReportPath ? filePathToPublicUrl(doc.errorReportPath) : null;
    const sourceCsvUrl = doc.csvPath ? filePathToPublicUrl(doc.csvPath) : null;
    const redisSnap = await getImportProgressRedis(jobId);
    const job = {
      jobId: doc.jobId,
      type: doc.type || 'vendor-csv-import',
      status: doc.status,
      totalRows: doc.totalRows ?? 0,
      validRows: doc.validRows ?? 0,
      processedRows: doc.processedRows ?? 0,
      failedRows: doc.failedRows ?? 0,
      progressPercent: doc.progressPercent ?? 0,
      errorMessage: doc.errorMessage || null,
      errorReportUrl,
      sourceCsvUrl,
      bullJobId: doc.bullJobId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      startedAt: doc.startedAt,
      completedAt: doc.completedAt,
    };
    if (redisSnap) {
      job.totalRows = Math.max(job.totalRows, redisSnap.totalRows);
      job.validRows = Math.max(job.validRows, redisSnap.validRows);
      job.processedRows = Math.max(job.processedRows, redisSnap.processedRows);
      job.failedRows = Math.max(job.failedRows, redisSnap.failedRows);
      job.progressPercent = Math.max(job.progressPercent, redisSnap.progressPercent);
      if (redisSnap.errorMessage) job.errorMessage = redisSnap.errorMessage;
      if (redisSnap.type) job.type = redisSnap.type;
    }

    const repaired = await repairStalledImportJobByJobId(jobId, {
      status: job.status,
      completedAt: job.completedAt,
      progressPercent: job.progressPercent,
      processedRows: job.processedRows,
      totalRows: job.totalRows,
      validRows: job.validRows,
      updatedAt: job.updatedAt,
    });
    if (repaired) {
      job.status = repaired.status;
      job.progressPercent = repaired.progressPercent ?? 100;
      job.completedAt = repaired.completedAt;
      job.processedRows = repaired.processedRows ?? job.processedRows;
      job.totalRows = repaired.totalRows ?? job.totalRows;
      job.validRows = repaired.validRows ?? job.validRows;
      job.failedRows = repaired.failedRows ?? job.failedRows;
      job.errorMessage = repaired.errorMessage || job.errorMessage;
    }

    return res.status(200).json({
      success: true,
      job,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


/**
 * SKU inventory CSV import — enqueue only (BullMQ worker).
 */
const importSkuInventory = async (req, res) => {
  try {
    if (!req.file?.path) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded (csvFile).' });
    }

    const jobId = uuidv4();
    const mode = String(req.query.mode || 'merge').toLowerCase();
    const csvStored = toStoredUploadRelative(req.file.path);

    const doc = await ImportJob.create({
      jobId,
      status: 'queued',
      type: 'sku-inventory-import',
      csvPath: csvStored,
      originalFilename: req.file.originalname || '',
      requestedBy: req.user?._id || null,
    });

    try {
      const { emitImportJobProgress } = require('../socket/importProgress.socket');
      emitImportJobProgress({
        jobId: doc.jobId,
        type: doc.type,
        status: 'queued',
        totalRows: 0,
        validRows: 0,
        processedRows: 0,
        failedRows: 0,
        progressPercent: 0,
      });
    } catch (_) {}

    try {
      const { enqueueSkuInventoryImport } = require('../queues/skuInventoryImport.queue');
      const bullJob = await enqueueSkuInventoryImport({
        importJobId: String(doc._id),
        csvPath: csvStored,
        jobId,
        mode,
      });
      await ImportJob.updateOne({ _id: doc._id }, { $set: { bullJobId: String(bullJob.id) } });
    } catch (queueErr) {
      await ImportJob.deleteOne({ _id: doc._id }).catch(() => {});
      console.error('[importSkuInventory] queue error:', queueErr);
      return res.status(503).json({
        success: false,
        message: 'Import queue unavailable (check Redis / REDIS_URI)',
        error: queueErr.message,
      });
    }

    return res.status(202).json({
      success: true,
      message:
        'SKU inventory import queued. Use the same Socket.IO flow as vendor import (subscribeVendorImport + jobId).',
      jobId: doc.jobId,
      importJobId: doc._id,
      socket: {
        eventSubscribe: 'subscribeVendorImport',
        eventProgress: 'vendorImportProgress',
        payloadExample: { jobId: doc.jobId, token: '<same JWT as Authorization Bearer>' },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to queue SKU inventory import',
      error: error.message,
    });
  }
};


module.exports = {
  importVendorCatalog,
  getVendorImportJobStatus,
  importSkuInventory,
};

