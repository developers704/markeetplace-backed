/**
 * Single source of truth for upload files: paths stored in Mongo / Bull are
 * POSIX-style relative to PROJECT_ROOT (e.g. uploads/csv/sku-inventory/x.csv).
 * All fs I/O resolves to absolute paths; APIs expose only /uploads/... URLs.
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * @param {string} absoluteFsPath - e.g. multer req.file.path
 * @returns {string} e.g. uploads/csv/sku-inventory/file.csv
 */
function toStoredUploadRelative(absoluteFsPath) {
  if (!absoluteFsPath) return '';
  const abs = path.resolve(String(absoluteFsPath));
  const rel = path.relative(PROJECT_ROOT, abs);
  if (rel.startsWith('..') || rel === '') {
    throw new Error(`Upload path must be under project root (${PROJECT_ROOT}): ${absoluteFsPath}`);
  }
  return rel.split(path.sep).join('/');
}

/**
 * Resolve stored path (relative, absolute, or foreign absolute with uploads/ tail) for fs.* APIs.
 * @param {string} stored
 * @returns {string} absolute filesystem path (may not exist)
 */
function resolveAbsoluteFsPath(stored) {
  if (!stored) return '';
  const s = String(stored).trim();
  if (!s) return '';

  const norm = path.normalize(s);
  if (path.isAbsolute(norm)) {
    if (fs.existsSync(norm)) return norm;
  }

  const forward = s.replace(/\\/g, '/');
  const lower = forward.toLowerCase();
  const marker = 'uploads/';
  const idx = lower.indexOf(marker);
  if (idx !== -1) {
    const tail = forward.slice(idx);
    return path.resolve(PROJECT_ROOT, ...tail.split('/').filter(Boolean));
  }

  if (!path.isAbsolute(norm)) {
    return path.resolve(PROJECT_ROOT, ...forward.split('/').filter(Boolean));
  }

  return norm;
}

/**
 * Public URL under Express static /uploads — never exposes D:\... or other absolute paths.
 * @param {string} stored - DB value (relative preferred) or legacy absolute path
 * @returns {string|null} e.g. /uploads/csv/error-reports/errors.csv
 */
function filePathToPublicUrl(stored) {
  if (!stored) return null;
  const forward = String(stored).replace(/\\/g, '/');
  const lower = forward.toLowerCase();
  const marker = 'uploads/';
  const idx = lower.indexOf(marker);
  if (idx !== -1) {
    const key = forward.slice(idx).replace(/^\/+/, '');
    if (!key.toLowerCase().startsWith('uploads/')) return null;
    return '/' + key.split('/').filter(Boolean).join('/');
  }
  try {
    const abs = path.isAbsolute(stored) ? path.normalize(stored) : path.resolve(PROJECT_ROOT, forward);
    const rel = path.relative(PROJECT_ROOT, abs).split(path.sep).join('/');
    if (!rel || rel.startsWith('..')) return null;
    return '/' + rel.split('/').filter(Boolean).join('/');
  } catch {
    return null;
  }
}

function getUploadsStaticDir() {
  return path.join(PROJECT_ROOT, 'uploads');
}

module.exports = {
  PROJECT_ROOT,
  UPLOADS_PUBLIC_PREFIX: '/uploads',
  toStoredUploadRelative,
  resolveAbsoluteFsPath,
  filePathToPublicUrl,
  getUploadsStaticDir,
};
