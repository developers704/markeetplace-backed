const fs = require('fs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const ExportHistory = require('../models/exportHistory.model');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const { enqueueVendorProductExport } = require('../queues/vendorProductExport.queue');
const { resolveAbsoluteFsPath } = require('../config/uploadPaths');

const EXPORT_POLL_STATUSES = ['queued', 'processing', 'completed', 'failed'];
const EXPORT_DOWNLOAD_TOKEN_TTL = '30m';

function createExportDownloadToken(exportDoc) {
  return jwt.sign(
    {
      purpose: 'export-download',
      exportId: exportDoc.exportId,
      userId: String(exportDoc.userId),
    },
    process.env.JWT_SECRET,
    { expiresIn: EXPORT_DOWNLOAD_TOKEN_TTL },
  );
}

function verifyExportDownloadToken(token, exportId) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.purpose !== 'export-download') {
    throw new Error('Invalid download token');
  }
  if (decoded.exportId !== exportId) {
    throw new Error('Download token mismatch');
  }
  return decoded;
}

function buildDownloadUrl(req, exportId, accessToken) {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto || req.protocol || 'http';
  const host = req.get('host') || 'localhost:5000';
  return `${protocol}://${host}/api/v2/products/export/download/${exportId}?accessToken=${encodeURIComponent(accessToken)}`;
}

function canAccessExport(user, exportDoc) {
  if (!user || !exportDoc) return false;
  if (user.is_superuser) return true;
  return String(exportDoc.userId) === String(user._id);
}

function pickExportFilters(body = {}, query = {}) {
  const src = { ...query, ...body };
  const filters = {};
  const keys = ['search', 'brand', 'category', 'subcategory', 'subsubcategory'];
  keys.forEach((key) => {
    const value = src[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      filters[key] = String(value).trim();
    }
  });
  return filters;
}

/**
 * POST /api/v2/products/export/start
 */
const startVendorProductExport = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const filters = pickExportFilters(req.body, req.query);
    const exportId = uuidv4();
    const fileName = `vendor-products-export-${exportId}.csv`;

    const doc = await ExportHistory.create({
      exportId,
      userId: req.user._id,
      status: 'queued',
      fileName,
      filters,
    });

    try {
      const bullJob = await enqueueVendorProductExport({
        exportHistoryId: String(doc._id),
        exportId,
      });
      await ExportHistory.updateOne({ _id: doc._id }, { $set: { bullJobId: String(bullJob.id) } });
    } catch (queueErr) {
      await ExportHistory.deleteOne({ _id: doc._id }).catch(() => {});
      console.error('[startVendorProductExport] queue error:', queueErr);
      return res.status(503).json({
        success: false,
        message: 'Export queue unavailable (check Redis / REDIS_URI)',
        error: queueErr.message,
      });
    }

    return res.status(202).json({
      success: true,
      message: 'Export queued. Poll status endpoint for progress.',
      exportId: doc.exportId,
      status: 'queued',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to start export',
      error: error.message,
    });
  }
};

/**
 * GET /api/v2/products/export/status/:id
 */
const getVendorProductExportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ExportHistory.findOne({ exportId: id }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Export not found' });
    }
    if (!canAccessExport(req.user, doc)) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this export' });
    }

    const payload = {
      success: true,
      exportId: doc.exportId,
      status: doc.status,
      totalRecords: doc.totalRecords || 0,
      fileName: doc.fileName || '',
      error: doc.error || '',
      startedAt: doc.startedAt,
      completedAt: doc.completedAt,
      allowedStatuses: EXPORT_POLL_STATUSES,
      downloadUrl: null,
    };

    if (doc.status === 'completed') {
      const accessToken = createExportDownloadToken(doc);
      payload.downloadUrl = buildDownloadUrl(req, doc.exportId, accessToken);
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch export status',
      error: error.message,
    });
  }
};

/**
 * Auth for download: Bearer JWT (header) OR short-lived accessToken query param (iframe / auto-download).
 */
const exportDownloadAuth = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      let user = await Customer.findById(decoded.id);
      if (!user) user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ message: 'User not found. Please log in again.' });
      }
      user = user.toObject({ getters: true });
      user.selectedWarehouse = decoded.warehouse || null;
      req.user = user;
      return next();
    } catch (error) {
      return res.status(400).json({ message: 'Invalid token. Please log in again.', error: error.message });
    }
  }

  const accessToken = String(req.query.accessToken || '').trim();
  if (!accessToken) {
    return res.status(401).json({ message: 'Please log in to access this resource.' });
  }

  try {
    req.exportDownloadAuth = verifyExportDownloadToken(accessToken, req.params.id);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired download link', error: error.message });
  }
};

/**
 * GET /api/v2/products/export/download/:id
 */
const downloadVendorProductExport = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ExportHistory.findOne({ exportId: id }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Export not found' });
    }

    const headerAuthOk = req.user && canAccessExport(req.user, doc);
    const tokenAuthOk = req.exportDownloadAuth
      && req.exportDownloadAuth.exportId === id
      && String(doc.userId) === String(req.exportDownloadAuth.userId);

    if (!headerAuthOk && !tokenAuthOk) {
      return res.status(403).json({ success: false, message: 'Not allowed to download this export' });
    }
    if (doc.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: `Export is not ready (status: ${doc.status})`,
        status: doc.status,
      });
    }
    if (!doc.filePath) {
      return res.status(404).json({ success: false, message: 'Export file path missing' });
    }

    const absPath = resolveAbsoluteFsPath(doc.filePath);
    if (!absPath || !fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, message: 'Export file no longer exists' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName || 'vendor-products-export.csv'}"`);

    const stream = fs.createReadStream(absPath);
    stream.on('error', (err) => {
      console.error('[downloadVendorProductExport] stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to read export file' });
      } else {
        res.end();
      }
    });
    return stream.pipe(res);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to download export',
      error: error.message,
    });
  }
};

module.exports = {
  startVendorProductExport,
  getVendorProductExportStatus,
  downloadVendorProductExport,
  exportDownloadAuth,
  canAccessExport,
};
