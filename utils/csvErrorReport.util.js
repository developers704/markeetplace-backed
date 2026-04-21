const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');
const { PROJECT_ROOT, filePathToPublicUrl } = require('../config/uploadPaths');

/** POSIX-style relative key for Mongo (always forward slashes) */
const ERROR_REPORT_REL = 'uploads/csv/error-reports';

const ensureDirSync = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const toSafeFilenamePart = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const writeErrorReportCsv = async ({ prefix, errorRows }) => {
  if (!Array.isArray(errorRows) || errorRows.length === 0) return null;

  const dirAbs = path.join(PROJECT_ROOT, 'uploads', 'csv', 'error-reports');
  ensureDirSync(dirAbs);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safePrefix = toSafeFilenamePart(prefix || 'import');
  const filename = `${safePrefix}-errors-${ts}.csv`;
  const relativeStored = `${ERROR_REPORT_REL}/${filename}`.replace(/\/+/g, '/');
  const absPath = path.join(PROJECT_ROOT, ...relativeStored.split('/'));

  const headerSet = new Set();
  for (const r of errorRows) {
    Object.keys(r || {}).forEach((k) => headerSet.add(k));
  }
  headerSet.delete('errorReason');
  const headers = [...headerSet, 'errorReason'];

  const rows = errorRows.map((r) => headers.map((h) => (r && r[h] !== undefined && r[h] !== null ? String(r[h]) : '')));
  const csvContent = stringify([headers, ...rows], { quoted: true });

  fs.writeFileSync(absPath, csvContent, 'utf8');

  const urlPath = filePathToPublicUrl(relativeStored);
  return { filename, path: relativeStored, url: urlPath, count: errorRows.length };
};

module.exports = { writeErrorReportCsv, ERROR_REPORT_DIR: ERROR_REPORT_REL };
