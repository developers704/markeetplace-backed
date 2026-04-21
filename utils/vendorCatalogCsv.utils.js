const normalizeKey = (value) => String(value || '').trim().toUpperCase();

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseCsvList = (value) => {
  if (!value) return [];
  const raw = String(value)
    .split(/[,|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(raw)];
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const pick = (row, keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return row[k];
    }
  }
  return '';
};

const toNormalizedRow = (rawRow) => {
  const out = {};
  Object.keys(rawRow || {}).forEach((k) => {
    out[normalizeHeader(k)] = rawRow[k];
  });
  return out;
};

const KNOWN_KEYS = new Set([
  'sku',
  'skuid',
  'vendormodel',
  'vendormodelnumber',
  'model',
  'vendormodelid',
  'metalcolor',
  'color',
  'metaltype',
  'size',
  'tagprice',
  'price',
  'tag',
  'category',
  'subcategory',
  'subcategorydepartment',
  'subsubcategory',
  'brand',
  'branddesign',
  'images',
  'image',
  'featureimageslink',
  'gallery',
  'galleryimagelink',
  'title',
  'name',
  'description',
  'desc',
]);

module.exports = {
  normalizeKey,
  normalizeHeader,
  escapeRegex,
  parseCsvList,
  parseNumber,
  pick,
  toNormalizedRow,
  KNOWN_KEYS,
};
