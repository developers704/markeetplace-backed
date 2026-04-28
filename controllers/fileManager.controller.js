const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const multer = require('multer');
const {
  ensureUploadsRoot,
  parseFolderParam,
  resolveUnderUploads,
  logicalPathFromAbsolute,
  sanitizeFolderName,
  sanitizeUploadedFileName,
  uniqueFilenameInDir,
  logicalToPublicUrl,
} = require('../utils/fileManager.util');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);

/** Short-lived cache of directory listing metadata (names + types only) — avoids repeated readdir on pagination. */
const LIST_META_CACHE = new Map();
const LIST_META_TTL_MS = 12000;

function invalidateDirectoryListCache() {
  LIST_META_CACHE.clear();
}

function getCachedMeta(absDir) {
  const row = LIST_META_CACHE.get(absDir);
  if (!row || Date.now() > row.expires) return null;
  return row.meta;
}

function setCachedMeta(absDir, meta) {
  LIST_META_CACHE.set(absDir, { meta, expires: Date.now() + LIST_META_TTL_MS });
}

/**
 * @returns {Promise<{ ordered: { name: string, isDir: boolean }[], totalFolders: number, totalFiles: number }>}
 */
async function buildOrderedMeta(absDir, searchRaw) {
  const search = String(searchRaw || '')
    .trim()
    .toLowerCase()
    .slice(0, 200);

  let meta = getCachedMeta(absDir);
  if (!meta) {
    const dirents = await fs.readdir(absDir, { withFileTypes: true });
    const dirs = [];
    const files = [];
    for (const d of dirents) {
      const name = d.name;
      if (name === '.' || name === '..') continue;
      if (!d.isDirectory() && !d.isFile()) continue;
      const isDir = d.isDirectory();
      (isDir ? dirs : files).push({ name, isDir });
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    meta = [...dirs, ...files];
    setCachedMeta(absDir, meta);
  }

  const filtered = search
    ? meta.filter((m) => m.name.toLowerCase().includes(search))
    : meta;
  const totalFolders = filtered.filter((m) => m.isDir).length;
  const totalFiles = filtered.length - totalFolders;
  return { ordered: filtered, totalFolders, totalFiles };
}

function mapEntry(absPath, name, st) {
  const isDir = st.isDirectory();
  const logical = logicalPathFromAbsolute(absPath);
  const ext = path.extname(name).toLowerCase();
  const isImage = !isDir && IMAGE_EXT.has(ext);
  const url = isDir ? null : logicalToPublicUrl(logical);
  return {
    name,
    type: isDir ? 'folder' : 'file',
    path: logical,
    url,
    size: isDir ? 0 : st.size,
    createdAt: st.birthtime?.toISOString?.() || st.ctime?.toISOString?.() || new Date(0).toISOString(),
    updatedAt: st.mtime?.toISOString?.() || new Date(0).toISOString(),
    isImage,
  };
}

const listFileManager = async (req, res) => {
  try {
    ensureUploadsRoot();
    const segments = parseFolderParam(req.query.folder);
    const absDir = resolveUnderUploads(segments);
    let stat;
    try {
      stat = await fs.stat(absDir);
    } catch {
      return res.status(404).json({ success: false, message: 'Folder not found' });
    }
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, message: 'Not a folder' });
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '48'), 10) || 48));
    const search = req.query.search;

    const { ordered, totalFolders, totalFiles } = await buildOrderedMeta(absDir, search);
    const total = ordered.length;
    const offset = (page - 1) * limit;
    const slice = ordered.slice(offset, offset + limit);

    const data = await Promise.all(
      slice.map(async ({ name, isDir }) => {
        const abs = path.join(absDir, name);
        try {
          const st = await fs.stat(abs);
          return mapEntry(abs, name, st);
        } catch {
          return null;
        }
      })
    );

    const items = data.filter(Boolean);

    return res.json({
      success: true,
      data: items,
      folder: segments.length ? segments.join('/') : '',
      page,
      limit,
      total,
      totalFolders,
      totalFiles,
    });
  } catch (error) {
    if (String(error.message || '').includes('Path traversal')) {
      return res.status(400).json({ success: false, message: 'Invalid folder' });
    }
    return res.status(500).json({ success: false, message: error.message || 'List failed' });
  }
};

const downloadFile = async (req, res) => {
  try {
    ensureUploadsRoot();
    const raw = req.query.path;
    if (typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ success: false, message: 'path query is required' });
    }
    const segments = parseFolderParam(raw);
    if (!segments.length) {
      return res.status(400).json({ success: false, message: 'Invalid path' });
    }
    const abs = resolveUnderUploads(segments);
    const st = await fs.stat(abs).catch(() => null);
    if (!st) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    if (!st.isFile()) {
      return res.status(400).json({ success: false, message: 'Not a file' });
    }
    const downloadName = path.basename(abs);
    return res.download(abs, downloadName, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed' });
      }
    });
  } catch (error) {
    if (String(error.message || '').includes('Path traversal')) {
      return res.status(400).json({ success: false, message: 'Invalid path' });
    }
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: error.message || 'Download failed' });
    }
  }
};

const createFolder = async (req, res) => {
  try {
    ensureUploadsRoot();
    const parentSeg = parseFolderParam(req.body?.parent);
    const folderName = sanitizeFolderName(req.body?.folderName);
    if (!folderName) {
      return res.status(400).json({ success: false, message: 'Invalid folder name' });
    }
    const parentAbs = resolveUnderUploads(parentSeg);
    const parentStat = await fs.stat(parentAbs).catch(() => null);
    if (!parentStat?.isDirectory()) {
      return res.status(404).json({ success: false, message: 'Parent folder not found' });
    }
    const newAbs = path.join(parentAbs, folderName);
    if (fssync.existsSync(newAbs)) {
      return res.status(409).json({ success: false, message: 'Already exists' });
    }
    await fs.mkdir(newAbs, { recursive: false });
    const logical = logicalPathFromAbsolute(newAbs);
    const st = await fs.stat(newAbs);
    invalidateDirectoryListCache();
    return res.status(201).json({
      success: true,
      data: mapEntry(newAbs, folderName, st),
    });
  } catch (error) {
    if (String(error.message || '').includes('Path traversal')) {
      return res.status(400).json({ success: false, message: 'Invalid path' });
    }
    return res.status(500).json({ success: false, message: error.message || 'Create failed' });
  }
};

const diskStorage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      ensureUploadsRoot();
      const segments = parseFolderParam(req.body?.folder);
      const destAbs = resolveUnderUploads(segments);
      const st = fssync.statSync(destAbs);
      if (!st.isDirectory()) {
        return cb(new Error('NOT_A_DIRECTORY'));
      }
      fssync.mkdirSync(destAbs, { recursive: true });
      cb(null, destAbs);
    } catch (e) {
      cb(e);
    }
  },
  filename(req, file, cb) {
    try {
      const base = sanitizeUploadedFileName(file.originalname);
      const segments = parseFolderParam(req.body?.folder);
      const dirAbs = resolveUnderUploads(segments);
      const unique = uniqueFilenameInDir(dirAbs, base);
      cb(null, unique);
    } catch (e) {
      cb(e);
    }
  },
});

const uploadMw = multer({
  storage: diskStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 4000 },
});

const uploadFiles = async (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    const out = [];
    for (const f of req.files) {
      const abs = path.resolve(f.path);
      const st = await fs.stat(abs);
      out.push(mapEntry(abs, f.filename, st));
    }
    invalidateDirectoryListCache();
    return res.status(201).json({ success: true, data: out });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
};

const deleteEntry = async (req, res) => {
  try {
    ensureUploadsRoot();
    const raw = req.body?.path;
    if (typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ success: false, message: 'path is required' });
    }
    const segments = parseFolderParam(raw);
    if (!segments.length) {
      return res.status(400).json({ success: false, message: 'Cannot delete uploads root' });
    }
    const abs = resolveUnderUploads(segments);
    const root = resolveUnderUploads([]);
    if (abs === root) {
      return res.status(400).json({ success: false, message: 'Cannot delete uploads root' });
    }
    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    if (st.isDirectory()) {
      await fs.rm(abs, { recursive: true, force: true });
    } else {
      await fs.unlink(abs);
    }
    invalidateDirectoryListCache();
    return res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    if (String(error.message || '').includes('Path traversal')) {
      return res.status(400).json({ success: false, message: 'Invalid path' });
    }
    return res.status(500).json({ success: false, message: error.message || 'Delete failed' });
  }
};

module.exports = {
  listFileManager,
  downloadFile,
  createFolder,
  uploadMw,
  uploadFiles,
  deleteEntry,
};
