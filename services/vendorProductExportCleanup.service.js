const fs = require('fs');
const ExportHistory = require('../models/exportHistory.model');
const { resolveAbsoluteFsPath } = require('../config/uploadPaths');

const EXPORT_RETENTION_DAYS = Number(process.env.EXPORT_FILE_RETENTION_DAYS) || 7;

async function cleanupExpiredExportFiles() {
  const cutoff = new Date(Date.now() - EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await ExportHistory.find({
    $or: [
      { completedAt: { $lt: cutoff } },
      { status: 'failed', startedAt: { $lt: cutoff } },
      { status: 'queued', createdAt: { $lt: cutoff } },
    ],
  })
    .select('_id filePath')
    .lean();

  let deletedFiles = 0;
  let deletedRecords = 0;

  for (const row of expired) {
    if (row.filePath) {
      const abs = resolveAbsoluteFsPath(row.filePath);
      if (abs && fs.existsSync(abs)) {
        try {
          fs.unlinkSync(abs);
          deletedFiles += 1;
        } catch (err) {
          console.error('[export-cleanup] unlink failed:', abs, err.message);
        }
      }
    }
  }

  if (expired.length) {
    const ids = expired.map((r) => r._id);
    const result = await ExportHistory.deleteMany({ _id: { $in: ids } });
    deletedRecords = result.deletedCount || 0;
  }

  if (deletedFiles || deletedRecords) {
    console.log(
      `[export-cleanup] removed ${deletedRecords} records, ${deletedFiles} files (older than ${EXPORT_RETENTION_DAYS}d)`,
    );
  }

  return { deletedFiles, deletedRecords };
}

module.exports = { cleanupExpiredExportFiles, EXPORT_RETENTION_DAYS };
