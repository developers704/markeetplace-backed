const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const multer = require('multer');
const { once } = require('events');
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
const ZIP_MAX_UINT32 = 0xffffffff;
const ZIP_MAX_ENTRIES = 0xffff;
const ZIP_UTF8_FLAG = 0x0800;

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC32_TABLE.length; i += 1) {
  let c = i;
  for (let j = 0; j < 8; j += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

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

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC32_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function getDosDateTime(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date();
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function safeZipName(name) {
  return String(name || 'folder')
    .replace(/[\\/:*?"<>|\0]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'folder';
}

function zipEntryPath(...parts) {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\0/g, '');
}

function createLocalZipHeader({ nameBuf, crc, size, mtime }) {
  const { time, date } = getDosDateTime(mtime);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function createCentralZipHeader({ nameBuf, crc, size, mtime, offset, isDirectory }) {
  const { time, date } = getDosDateTime(mtime);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(nameBuf.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(isDirectory ? 0x10 : 0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBuf]);
}

function createEndOfCentralDirectory({ entryCount, centralSize, centralOffset }) {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

async function collectZipEntries(folderAbs, zipRootName) {
  const rootStat = await fs.stat(folderAbs);
  const entries = [
    {
      abs: folderAbs,
      zipPath: `${zipRootName}/`,
      isDirectory: true,
      mtime: rootStat.mtime,
    },
  ];

  async function walk(dirAbs, relDir = '') {
    const dirents = await fs.readdir(dirAbs, { withFileTypes: true });
    for (const dirent of dirents) {
      if (dirent.name === '.' || dirent.name === '..') continue;
      const childAbs = path.join(dirAbs, dirent.name);
      const relPath = relDir ? `${relDir}/${dirent.name}` : dirent.name;
      const st = await fs.stat(childAbs);
      if (dirent.isDirectory()) {
        entries.push({
          abs: childAbs,
          zipPath: `${zipEntryPath(zipRootName, relPath)}/`,
          isDirectory: true,
          mtime: st.mtime,
        });
        await walk(childAbs, relPath);
      } else if (dirent.isFile()) {
        entries.push({
          abs: childAbs,
          zipPath: zipEntryPath(zipRootName, relPath),
          isDirectory: false,
          mtime: st.mtime,
        });
      }
    }
  }

  await walk(folderAbs);
  return entries;
}

async function writeResponseChunk(res, chunk) {
  if (!res.write(chunk)) {
    await once(res, 'drain');
  }
}

async function writeFolderZip(res, folderAbs) {
  const zipRootName = safeZipName(path.basename(folderAbs));
  const entries = await collectZipEntries(folderAbs, zipRootName);
  if (entries.length > ZIP_MAX_ENTRIES) {
    throw new Error('Folder has too many entries to download');
  }

  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const data = entry.isDirectory ? Buffer.alloc(0) : await fs.readFile(entry.abs);
    if (data.length > ZIP_MAX_UINT32 || offset > ZIP_MAX_UINT32) {
      throw new Error('Folder is too large to download as a zip');
    }

    const nameBuf = Buffer.from(entry.zipPath, 'utf8');
    const crc = entry.isDirectory ? 0 : crc32(data);
    const size = data.length;
    const localOffset = offset;
    const localHeader = createLocalZipHeader({ nameBuf, crc, size, mtime: entry.mtime });
    const centralHeader = createCentralZipHeader({
      nameBuf,
      crc,
      size,
      mtime: entry.mtime,
      offset: localOffset,
      isDirectory: entry.isDirectory,
    });

    await writeResponseChunk(res, localHeader);
    offset += localHeader.length;
    await writeResponseChunk(res, nameBuf);
    offset += nameBuf.length;
    if (data.length) {
      await writeResponseChunk(res, data);
      offset += data.length;
    }
    centralHeaders.push(centralHeader);
  }

  const centralOffset = offset;
  for (const centralHeader of centralHeaders) {
    if (offset > ZIP_MAX_UINT32) {
      throw new Error('Folder is too large to download as a zip');
    }
    await writeResponseChunk(res, centralHeader);
    offset += centralHeader.length;
  }
  const centralSize = offset - centralOffset;
  const endHeader = createEndOfCentralDirectory({
    entryCount: entries.length,
    centralSize,
    centralOffset,
  });
  await writeResponseChunk(res, endHeader);
  res.end();
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

const downloadFolder = async (req, res) => {
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
      return res.status(404).json({ success: false, message: 'Folder not found' });
    }
    if (!st.isDirectory()) {
      return res.status(400).json({ success: false, message: 'Not a folder' });
    }

    const downloadName = `${safeZipName(path.basename(abs))}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName.replace(/"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );
    await writeFolderZip(res, abs);
  } catch (error) {
    if (String(error.message || '').includes('Path traversal')) {
      return res.status(400).json({ success: false, message: 'Invalid path' });
    }
    if (!res.headersSent) {
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Disposition');
      return res.status(500).json({ success: false, message: error.message || 'Folder download failed' });
    }
    res.destroy(error);
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
  downloadFolder,
  createFolder,
  uploadMw,
  uploadFiles,
  deleteEntry,
};
