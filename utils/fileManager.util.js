const path = require('path');
const fs = require('fs');
const { getUploadsStaticDir, filePathToPublicUrl } = require('../config/uploadPaths');

function ensureUploadsRoot() {
  const root = path.resolve(getUploadsStaticDir());
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function getNormalizedRoot() {
  return path.resolve(ensureUploadsRoot());
}

function isPathInsideRoot(targetAbs, rootAbs) {
  const root = path.resolve(rootAbs);
  const target = path.resolve(targetAbs);
  if (target === root) return true;
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return target.startsWith(prefix);
}

/**
 * @param {string|undefined|null} folderParam
 * @returns {string[]} path segments under uploads (no . or ..)
 */
function parseFolderParam(folderParam) {
  if (folderParam == null || folderParam === '') return [];
  const raw = String(folderParam).replace(/\\/g, '/').trim();
  if (!raw) return [];
  return raw
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.' && s !== '..');
}

/**
 * @param {string[]} segments
 * @returns {string} absolute directory path under uploads
 */
function resolveUnderUploads(segments) {
  const root = getNormalizedRoot();
  if (!segments.length) return root;
  const target = path.resolve(root, ...segments);
  if (!isPathInsideRoot(target, root)) {
    throw new Error('Path traversal denied');
  }
  return target;
}

/**
 * @param {string} absPath must be under uploads root
 * @returns {string} logical path with forward slashes, no leading slash
 */
function logicalPathFromAbsolute(absPath) {
  const root = getNormalizedRoot();
  const resolved = path.resolve(absPath);
  if (!isPathInsideRoot(resolved, root)) {
    throw new Error('Invalid path');
  }
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid path');
  }
  return rel.split(path.sep).join('/');
}

function toPosixLogical(segments) {
  if (!segments.length) return '';
  return segments.join('/');
}

/**
 * New folder / display names: letters, numbers, space, underscore, hyphen.
 * @param {string} name
 * @returns {string|null}
 */
function sanitizeFolderName(name) {
  const n = String(name || '').trim();
  if (!n || n === '.' || n === '..') return null;
  if (n.length > 120) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-\s]{0,119}$/.test(n)) return null;
  return n.replace(/\s+/g, ' ').trim();
}

/**
 * Uploaded file basename only; safe characters.
 * @param {string} original
 * @returns {string}
 */
function sanitizeUploadedFileName(original) {
  const base = path.basename(String(original || 'file'));
  let cleaned = base.replace(/[^a-zA-Z0-9.\-_\s]/g, '_').replace(/\s+/g, '_');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    cleaned = `file_${Date.now()}`;
  }
  if (cleaned.length > 180) {
    const ext = path.extname(cleaned);
    const stem = path.basename(cleaned, ext).slice(0, 160);
    return `${stem}${ext}`;
  }
  return cleaned;
}

/**
 * @param {string} dirAbs
 * @param {string} filename
 * @returns {string} unique filename inside dirAbs
 */
function uniqueFilenameInDir(dirAbs, filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext) || 'file';
  let candidate = filename;
  let n = 0;
  while (fs.existsSync(path.join(dirAbs, candidate))) {
    n += 1;
    candidate = `${stem}_${n}${ext}`;
  }
  return candidate;
}

/**
 * @param {string} logicalPath forward slashes relative to uploads
 * @returns {string|null} public URL /uploads/...
 */
function logicalToPublicUrl(logicalPath) {
  if (!logicalPath) return null;
  const key = `uploads/${String(logicalPath).replace(/^\/+/, '')}`;
  return filePathToPublicUrl(key);
}

module.exports = {
  ensureUploadsRoot,
  getNormalizedRoot,
  parseFolderParam,
  resolveUnderUploads,
  logicalPathFromAbsolute,
  toPosixLogical,
  sanitizeFolderName,
  sanitizeUploadedFileName,
  uniqueFilenameInDir,
  logicalToPublicUrl,
  isPathInsideRoot,
};
