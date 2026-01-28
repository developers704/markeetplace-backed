const csv = require('csv-parser');
const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const { stringify } = require('csv-stringify/sync');

const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const City = require('../models/city.model');
const Warehouse = require('../models/warehouse.model');
const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model');
const { deleteFile } = require('../config/fileOperations');

const normalizeKey = (value) => String(value || '').trim().toUpperCase();
const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectIdLike = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());

const ERROR_REPORT_DIR = path.join('uploads', 'csv', 'error-reports');

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

  ensureDirSync(ERROR_REPORT_DIR);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safePrefix = toSafeFilenamePart(prefix || 'import');
  const filename = `${safePrefix}-errors-${ts}.csv`;
  const relativePath = path.join(ERROR_REPORT_DIR, filename);

  // Build headers union, make sure errorReason is last
  const headerSet = new Set();
  for (const r of errorRows) {
    Object.keys(r || {}).forEach((k) => headerSet.add(k));
  }
  headerSet.delete('errorReason');
  const headers = [...headerSet, 'errorReason'];

  const rows = errorRows.map((r) => headers.map((h) => (r && r[h] !== undefined && r[h] !== null ? String(r[h]) : '')));
  const csvContent = stringify([headers, ...rows], { quoted: true });

  fs.writeFileSync(relativePath, csvContent, 'utf8');

  // Express typically serves /uploads as static; return a URL-like path
  const urlPath = `/${relativePath.split(path.sep).join('/')}`;
  return { filename, path: relativePath, url: urlPath, count: errorRows.length };
};

const parseCsvList = (value) => {
  if (!value) return [];
  // Support both comma-separated and pipe-separated lists
  const raw = String(value)
    .split(/[,|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  // Deduplicate while preserving order
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

/**
 * Bulk Vendor Catalog Import (CSV)
 * - Groups rows by Vendor-Model
 * - Upserts VendorProduct once per vendorModelKey
 * - Upserts SKUs under that VendorProduct (idempotent; SKU unique)
 * - Sets first SKU as defaultSku if defaultSku is empty
 *
 * Expected CSV columns (case-insensitive; symbols ignored):
 * - Sku
 * - Vendor-Model
 * - Metal-Color
 * - Metal-Type
 * - Size
 * - Tag Price
 * - Category
 * - Brand
 * - Title/Name (optional)
 * - Description (optional)
 * - Images (comma separated)
 * - Gallery (comma separated)
 *
 * Additional columns will be stored under `attributes` on the SKU.
 */
const importVendorCatalog = async (req, res) => {
  const startedAt = Date.now();
  const now = new Date();

  try {
    if (!req.file?.path) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded (csvFile).' });
    }

    const csvFilePath = req.file.path;

    const groups = new Map(); // vendorModelKey -> { vendorModel, title, brand, category, description, rows: [] }
    const errors = [];
    const errorRowsForCsv = []; // full error report rows (same data + errorReason)
    let totalRows = 0;

    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (raw) => {
          totalRows += 1;
          const rowNumber = totalRows + 1; // header = row 1

          const row = toNormalizedRow(raw);
          const vendorModel = String(pick(row, ['vendormodel', 'vendormodelnumber', 'model', 'vendormodelid'])).trim();
          const sku = String(pick(row, ['sku', 'skuid'])).trim();

          if (!vendorModel || !sku) {
            errors.push({
              row: rowNumber,
              error: 'Missing required fields: Vendor-Model and Sku',
              data: raw,
            });
            errorRowsForCsv.push({ rowNumber, ...raw, errorReason: 'Missing required fields: Vendor-Model and Sku' });
            return;
          }

          const vendorModelKey = normalizeKey(vendorModel);

          const titleRaw = String(pick(row, ['title', 'name'])).trim();
          const title = titleRaw || vendorModel; // fallback for listing display

          const brand = String(pick(row, ['brand','branddesign'])).trim();
          const category = String(pick(row, ['category'])).trim();
          const subcategory = String(pick(row, ['subcategory', 'subcategorydepartment'])).trim();
          const subsubcategory = String(pick(row, ['subsubcategory'])).trim();
          const description = String(pick(row, ['description', 'desc'])).trim();

          const metalColor = String(pick(row, ['metalcolor', 'color'])).trim();
          const metalType = String(pick(row, ['metaltype'])).trim();
          const size = String(pick(row, ['size'])).trim();

          const price = parseNumber(pick(row, ['tagprice', 'price', 'tag'])); // Tag Price (preferred)
          if (price === null || price < 0) {
            errors.push({
              row: rowNumber,
              error: 'Invalid Tag Price (must be a non-negative number)',
              data: raw,
            });
            errorRowsForCsv.push({ rowNumber, ...raw, errorReason: 'Invalid Tag Price (must be a non-negative number)' });
            return;
          }

          const images = parseCsvList(pick(row,  ['images', 'image', 'featureimageslink']));
          const gallery = parseCsvList(pick(row,  ['gallery', 'galleryimagelink']));

          // Put any unknown columns into SKU.attributes
          const knownKeys = new Set([
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
            'images',
            'image',
            'gallery',
            'title',
            'name',
            'description',
            'desc',
          ]);
          const attributes = {};
          Object.keys(row).forEach((k) => {
            if (!knownKeys.has(k)) {
              const v = row[k];
              if (v !== undefined && v !== null && String(v).trim() !== '') {
                attributes[k] = v;
              }
            }
          });

          if (!groups.has(vendorModelKey)) {
            groups.set(vendorModelKey, {
              vendorModel,
              vendorModelKey,
              title,
              brand,
              category,
              subcategory,
              subsubcategory,
              description,
              rows: [],
            });
          } else {
            // Merge missing metadata from later rows (defensive for CSVs where first row is incomplete)
            const g = groups.get(vendorModelKey);
            if (!g.title && title) g.title = title;
            if (!g.brand && brand) g.brand = brand;
            if (!g.category && category) g.category = category;
            if (!g.subcategory && subcategory) g.subcategory = subcategory;
            if (!g.subsubcategory && subsubcategory) g.subsubcategory = subsubcategory;
            if (!g.description && description) g.description = description;
          }

          groups.get(vendorModelKey).rows.push({
            rowNumber,
            vendorModel,
            vendorModelKey,
            sku,
            skuKey: normalizeKey(sku),
            metalColor,
            metalType,
            size,
            price,
            currency: 'USD',
            images,
            gallery,
            attributes,
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Upsert VendorProducts
    // Enforce required VendorProduct fields at group-level (brand + category)
    for (const [k, g] of groups.entries()) {
      if (!g.category) {
        // Add ALL rows in this group to error CSV so admin can fix and re-upload
        for (const r of g.rows || []) {
          errorRowsForCsv.push({
            rowNumber: r.rowNumber,
            vendorModel: r.vendorModel,
            sku: r.sku,
            brand: g.brand || 'Unknown',
            category: g.category || '',
            subcategory: g.subcategory || '',
            subsubcategory: g.subsubcategory || '',
            tagPrice: r.price,
            metalColor: r.metalColor,
            metalType: r.metalType,
            size: r.size,
            images: Array.isArray(r.images) ? r.images.join(',') : '',
            gallery: Array.isArray(r.gallery) ? r.gallery.join(',') : '',
            errorReason: `Missing required Category for Vendor-Model "${g.vendorModel}"`,
          });
        }
        errors.push({
          row: null,
          error: `Vendor-Model "${g.vendorModel}" is missing required Brand/Category (group skipped)`,
        });
        groups.delete(k);
      }
    }

    const vendorKeys = Array.from(groups.keys());
    if (vendorKeys.length === 0) {
      const errorReport = await writeErrorReportCsv({ prefix: 'vendor-catalog', errorRows: errorRowsForCsv });
      await deleteFile(csvFilePath).catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'No valid rows found to import (check Vendor-Model and Sku columns).',
        errors: errors.slice(0, 100),
        errorReport,
      });
    }

    // Helper function to create or find category
    const getOrCreateCategory = async (categoryName) => {
      if (!categoryName) return null;
      const formattedName = categoryName
        .trim()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      
      let category = await Category.findOne({ name: formattedName });
      if (!category) {
        category = new Category({ name: formattedName });
        await category.save();
      }
      return category._id;
    };

    // Helper function to create or find subcategory
    const getOrCreateSubCategory = async (subcategoryName, parentCategoryId) => {
      if (!subcategoryName || !parentCategoryId) return null;
      const formattedName = subcategoryName
        .trim()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      
      let subcategory = await SubCategory.findOne({ 
        name: formattedName, 
        parentCategory: parentCategoryId 
      });
      if (!subcategory) {
        subcategory = new SubCategory({ 
          name: formattedName, 
          parentCategory: parentCategoryId 
        });
        await subcategory.save();
      }
      return subcategory._id;
    };

    // Helper function to create or find sub-subcategory
    const getOrCreateSubSubCategory = async (subsubcategoryName, parentSubCategoryId) => {
      if (!subsubcategoryName || !parentSubCategoryId) return null;
      const formattedName = subsubcategoryName
        .trim()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      
      let subsubcategory = await SubSubCategory.findOne({ 
        name: formattedName, 
        parentSubCategory: parentSubCategoryId 
      });
      if (!subsubcategory) {
        subsubcategory = new SubSubCategory({ 
          name: formattedName, 
          parentSubCategory: parentSubCategoryId 
        });
        await subsubcategory.save();
      }
      return subsubcategory._id;
    };

    // Process categories for all groups
    const categoryMap = new Map(); // categoryName -> categoryId
    const subcategoryMap = new Map(); // "parentCategoryId_subcategoryName" -> subcategoryId
    const subsubcategoryMap = new Map(); // "parentSubCategoryId_subsubcategoryName" -> subsubcategoryId

    for (const [k, g] of groups.entries()) {
      if (g.category) {
        let categoryId = categoryMap.get(g.category);
        if (!categoryId) {
          categoryId = await getOrCreateCategory(g.category);
          if (categoryId) {
            categoryMap.set(g.category, categoryId);
          }
        }
        g.categoryId = categoryId;

        // Process subcategory if exists
        if (g.subcategory && categoryId) {
          const subcategoryKey = `${categoryId}_${g.subcategory}`;
          let subcategoryId = subcategoryMap.get(subcategoryKey);
          if (!subcategoryId) {
            subcategoryId = await getOrCreateSubCategory(g.subcategory, categoryId);
            if (subcategoryId) {
              subcategoryMap.set(subcategoryKey, subcategoryId);
            }
          }
          g.subcategoryId = subcategoryId;

          // Process sub-subcategory if exists
          if (g.subsubcategory && subcategoryId) {
            const subsubcategoryKey = `${subcategoryId}_${g.subsubcategory}`;
            let subsubcategoryId = subsubcategoryMap.get(subsubcategoryKey);
            if (!subsubcategoryId) {
              subsubcategoryId = await getOrCreateSubSubCategory(g.subsubcategory, subcategoryId);
              if (subsubcategoryId) {
                subsubcategoryMap.set(subsubcategoryKey, subsubcategoryId);
              }
            }
            g.subsubcategoryId = subsubcategoryId;
          }
        }
      }
    }

    const vendorOps = vendorKeys.map((vendorModelKey) => {
      const g = groups.get(vendorModelKey);
      const set = {
        vendorModel: g.vendorModel,
        vendorModelKey: g.vendorModelKey,
        title: g.title,
        brand: g.brand || 'Unknown',
        category: g.categoryId || g.category, // Use ObjectId if available, fallback to string
        subcategory: g.subcategoryId || null,
        subsubcategory: g.subsubcategoryId || null,
        description: g.description,
        updatedAt: now,
      };
      // Defensive: enforce required brand/category at import time if present in CSV
      return {
        updateOne: {
          filter: { vendorModelKey: g.vendorModelKey },
          update: {
            $set: set,
            $setOnInsert: { createdAt: now, skuIds: [], defaultSku: null },
          },
          upsert: true,
        },
      };
    });

    const vendorWrite = await VendorProduct.bulkWrite(vendorOps, { ordered: false });

    const vendorProducts = await VendorProduct.find({ vendorModelKey: { $in: vendorKeys } })
      .select('_id vendorModelKey defaultSku')
      .lean();
    const vendorMap = new Map(vendorProducts.map((p) => [p.vendorModelKey, p]));

    // Upsert SKUs
    const skuOps = [];
    const skuKeys = new Set();

    for (const [vendorModelKey, g] of groups.entries()) {
      const vp = vendorMap.get(vendorModelKey);
      if (!vp?._id) continue;

      for (const r of g.rows) {
        skuKeys.add(r.skuKey);
        skuOps.push({
          updateOne: {
            // IMPORTANT: include productId in filter to prevent accidentally reassigning a SKU to a different vendor model
            filter: { skuKey: r.skuKey, productId: vp._id },
            update: {
              $set: {
                sku: r.sku,
                skuKey: r.skuKey,
                productId: vp._id,
                metalColor: r.metalColor,
                metalType: r.metalType,
                size: r.size,
                price: r.price,
                currency: r.currency || 'USD',
                images: r.images || [],
                gallery: r.gallery || [],
                attributes: r.attributes || {},
                isActive: true,
                updatedAt: now,
              },
              $setOnInsert: { createdAt: now },
            },
            upsert: true,
          },
        });
      }
    }

    let skuWrite = null;
    if (skuOps.length > 0) {
      try {
        skuWrite = await Sku.bulkWrite(skuOps, { ordered: false });
      } catch (e) {
        // bulkWrite may throw but still apply some writes; capture summary + continue
        errors.push({
          row: null,
          error: `SKU bulkWrite error: ${e.message}`,
        });
      }
    }

    const skuDocs = await Sku.find({ skuKey: { $in: Array.from(skuKeys) } })
      .select('_id skuKey productId')
      .lean();
    const skuDocMap = new Map(skuDocs.map((s) => [s.skuKey, s]));

    // Attach SKU ids + set defaultSku (first row's sku) if missing
    const vendorUpdateOps = [];
    for (const [vendorModelKey, g] of groups.entries()) {
      const vp = vendorMap.get(vendorModelKey);
      if (!vp?._id) continue;

      const skuIds = [];
      for (const r of g.rows) {
        const sd = skuDocMap.get(r.skuKey);
        if (sd && String(sd.productId) === String(vp._id)) {
          skuIds.push(sd._id);
        }
      }

      if (skuIds.length > 0) {
        vendorUpdateOps.push({
          updateOne: {
            filter: { _id: vp._id },
            update: { $addToSet: { skuIds: { $each: skuIds } }, $set: { updatedAt: now } },
          },
        });

        const firstSkuKey = g.rows?.[0]?.skuKey;
        const firstSkuDoc = firstSkuKey ? skuDocMap.get(firstSkuKey) : null;
        if (firstSkuDoc?._id) {
          vendorUpdateOps.push({
            updateOne: {
              filter: { _id: vp._id, $or: [{ defaultSku: null }, { defaultSku: { $exists: false } }] },
              update: { $set: { defaultSku: firstSkuDoc._id, updatedAt: now } },
            },
          });
        }
      }
    }

    if (vendorUpdateOps.length > 0) {
      await VendorProduct.bulkWrite(vendorUpdateOps, { ordered: false });
    }

    await deleteFile(csvFilePath).catch(() => {});

    const errorReport = await writeErrorReportCsv({ prefix: 'vendor-catalog', errorRows: errorRowsForCsv });

    return res.status(200).json({
      success: true,
      message: 'Vendor catalog imported successfully',
      meta: {
        totalRows,
        vendorModels: vendorKeys.length,
        durationMs: Date.now() - startedAt,
      },
      results: {
        vendorProducts: vendorWrite,
        skus: skuWrite,
      },
      errors: errors.slice(0, 100),
      errorReport,
    });
  } catch (error) {
    if (req.file?.path) {
      await deleteFile(req.file.path).catch(() => {});
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to import vendor catalog',
      error: error.message,
    });
  }
};

/**
 * Normalize warehouse/city name for matching
 * - Trim whitespace
 * - Convert to lowercase for case-insensitive matching
 */
const normalizeName = (name) => {
  if (!name) return '';
  return String(name).trim().toLowerCase();
};

/**
 * Bulk SKU Inventory Import (CSV) - Production-Ready with Cursor-Based Processing
 *
 * Expected columns (case-insensitive; symbols ignored):
 * - sku (required)
 * - warehouse (required - name or id)
 * - city (optional - name or id, defaults to null)
 * - quantity (required)
 *
 * Query params:
 * - mode=replace|increment|merge (default: merge)
 *   - replace: Replace quantity with CSV value
 *   - increment: Add CSV quantity to existing
 *   - merge: Sum quantities for duplicate (skuId, warehouse, city) combinations
 */
const importSkuInventory = async (req, res) => {
  const startedAt = Date.now();
  const now = new Date();

  const modeRaw = String(req.query.mode || 'merge').toLowerCase();
  const mode = ['replace', 'increment', 'merge'].includes(modeRaw) ? modeRaw : 'merge';
  const BATCH_SIZE = 100;

  try {
    if (!req.file?.path) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded (csvFile).' });
    }

    const csvFilePath = req.file.path;
    const rows = [];
    const errors = [];
    const errorRowsForCsv = [];
    let totalRows = 0;

    // Parse CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (raw) => {
          totalRows += 1;
          const rowNumber = totalRows + 1;
          const row = toNormalizedRow(raw);

          const sku = String(pick(row, ['sku', 'skuid'])).trim();
          const warehouseInput = String(pick(row, ['warehouse', 'warehousename', 'warehouseid']) || '').trim();
          const cityInput = String(pick(row, ['city', 'cityname', 'cityid']) || '').trim(); // Optional
          const quantityVal = parseNumber(pick(row, ['quantity', 'qty']));

          // Validate required fields (city is optional)
          if (!sku || !warehouseInput || quantityVal === null) {
            errors.push({
              row: rowNumber,
              error: 'Missing required fields: sku, warehouse, quantity (city is optional)',
              data: raw,
            });
            errorRowsForCsv.push({ rowNumber, ...raw, errorReason: 'Missing required fields: sku, warehouse, quantity (city is optional)' });
            return;
          }

          if (quantityVal < 0) {
            errors.push({ row: rowNumber, error: 'Quantity must be >= 0', data: raw });
            errorRowsForCsv.push({ rowNumber, ...raw, errorReason: 'Quantity must be >= 0' });
            return;
          }

          rows.push({
            rowNumber,
            sku,
            skuKey: normalizeKey(sku),
            warehouseInput,
            cityInput,
            warehouseRaw: normalizeName(warehouseInput), // Normalize for matching
            cityRaw: cityInput ? normalizeName(cityInput) : null, // Normalize or null
            quantity: Math.floor(quantityVal),
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (rows.length === 0) {
      const errorReport = await writeErrorReportCsv({ prefix: 'sku-inventory', errorRows: errorRowsForCsv });
      await deleteFile(csvFilePath).catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'No valid rows found in CSV',
        errors: errors.slice(0, 100),
        errorReport,
      });
    }

    // Resolve SKUs
    const skuKeys = [...new Set(rows.map((r) => r.skuKey))];
    const skuDocs = await Sku.find({ skuKey: { $in: skuKeys } }).select('_id skuKey').lean();
    const skuMap = new Map(skuDocs.map((s) => [s.skuKey, s]));

    // Separate warehouse/city by ID vs name
    const warehouseNames = [...new Set(rows.filter((r) => !isObjectIdLike(r.warehouseRaw) && r.warehouseRaw).map((r) => r.warehouseRaw))];
    const warehouseIds = [...new Set(rows.filter((r) => isObjectIdLike(r.warehouseRaw)).map((r) => r.warehouseRaw))];
    const cityNames = [...new Set(rows.filter((r) => r.cityRaw && !isObjectIdLike(r.cityRaw)).map((r) => r.cityRaw))];
    const cityIds = [...new Set(rows.filter((r) => r.cityRaw && isObjectIdLike(r.cityRaw)).map((r) => r.cityRaw))];

    // Build warehouse lookup map (normalized name -> doc)
    const warehouseMap = new Map();
    if (warehouseIds.length > 0) {
      const ws = await Warehouse.find({ _id: { $in: warehouseIds } }).select('_id name').lean();
      ws.forEach((w) => {
        warehouseMap.set(String(w._id), w);
        warehouseMap.set(normalizeName(w.name), w); // Also index by normalized name
      });
    }
    for (const name of warehouseNames) {
      if (!warehouseMap.has(name)) {
        const w = await Warehouse.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
          .select('_id name')
          .lean();
        if (w) {
          warehouseMap.set(name, w);
          warehouseMap.set(normalizeName(w.name), w); // Index by normalized name
        }
      }
    }

    // Build city lookup map (normalized name -> doc, null -> null)
    const cityMap = new Map();
    cityMap.set(null, null); // Explicit null mapping
    if (cityIds.length > 0) {
      const cs = await City.find({ _id: { $in: cityIds } }).select('_id name').lean();
      cs.forEach((c) => {
        cityMap.set(String(c._id), c);
        cityMap.set(normalizeName(c.name), c); // Also index by normalized name
      });
    }
    for (const name of cityNames) {
      if (!cityMap.has(name)) {
        const c = await City.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
          .select('_id name')
          .lean();
        if (c) {
          cityMap.set(name, c);
          cityMap.set(normalizeName(c.name), c); // Index by normalized name
        }
      }
    }

    // Resolve rows and merge duplicates
    const resolvedRows = [];
    const quantityMap = new Map(); // Key: "skuId_warehouseId_cityId" -> total quantity

    for (const r of rows) {
      const skuDoc = skuMap.get(r.skuKey);
      if (!skuDoc?._id) {
        errors.push({ row: r.rowNumber, error: `SKU not found: ${r.sku}`, data: r });
        errorRowsForCsv.push({
          rowNumber: r.rowNumber,
          sku: r.sku,
          warehouse: r.warehouseInput || r.warehouseRaw,
          city: r.cityInput || '',
          quantity: r.quantity,
          errorReason: `SKU not found: ${r.sku}`,
        });
        continue;
      }

      const warehouseDoc = isObjectIdLike(r.warehouseRaw)
        ? warehouseMap.get(String(r.warehouseRaw))
        : warehouseMap.get(r.warehouseRaw);
      if (!warehouseDoc?._id) {
        errors.push({ row: r.rowNumber, error: `Warehouse not found: ${r.warehouseRaw}`, data: r });
        errorRowsForCsv.push({
          rowNumber: r.rowNumber,
          sku: r.sku,
          warehouse: r.warehouseInput || r.warehouseRaw,
          city: r.cityInput || '',
          quantity: r.quantity,
          errorReason: `Warehouse not found: ${r.warehouseInput || r.warehouseRaw}`,
        });
        continue;
      }

      // City is optional - use null if not provided or not found
      const cityDoc = r.cityRaw
        ? (isObjectIdLike(r.cityRaw) ? cityMap.get(String(r.cityRaw)) : cityMap.get(r.cityRaw))
        : null;
      // if (r.cityRaw && !cityDoc) {
      //   // Still proceed with null, but include in error CSV so user can fix spelling / mapping
      //   errorRowsForCsv.push({
      //     rowNumber: r.rowNumber,
      //     sku: r.sku,
      //     warehouse: r.warehouseInput || r.warehouseRaw,
      //     city: r.cityInput || '',
      //     quantity: r.quantity,
      //     errorReason: `City not found: ${r.cityInput || r.cityRaw} (using null)`,
      //   });
      // }
      // If cityRaw was provided but not found, log warning but continue with null
      // if (r.cityRaw && !cityDoc) {
      //   errors.push({
      //     row: r.rowNumber,
      //     error: `City not found: ${r.cityRaw} (using null)`,
      //     data: r,
      //   });
      // }

      const cityId = cityDoc?._id || null;
      const mergeKey = `${skuDoc._id}_${warehouseDoc._id}_${cityId || 'null'}`;

      // Merge quantities for duplicate combinations
      if (quantityMap.has(mergeKey)) {
        if (mode === 'merge') {
          quantityMap.set(mergeKey, quantityMap.get(mergeKey) + r.quantity);
        } else if (mode === 'replace') {
          quantityMap.set(mergeKey, r.quantity);
        } else if (mode === 'increment') {
          quantityMap.set(mergeKey, quantityMap.get(mergeKey) + r.quantity);
        }
      } else {
        quantityMap.set(mergeKey, r.quantity);
      }

      resolvedRows.push({
        skuId: skuDoc._id,
        warehouseId: warehouseDoc._id,
        cityId: cityId,
        quantity: quantityMap.get(mergeKey),
        mergeKey,
      });
    }

    // Remove duplicates (keep last merged quantity)
    const uniqueRows = [];
    const seenKeys = new Set();
    for (let i = resolvedRows.length - 1; i >= 0; i--) {
      const r = resolvedRows[i];
      if (!seenKeys.has(r.mergeKey)) {
        uniqueRows.unshift(r);
        seenKeys.add(r.mergeKey);
      }
    }

    // Cursor-based batch processing
    let createdCount = 0;
    let updatedCount = 0;
    let mergedCount = 0;

    // Fetch existing inventory records in batches to check for merges
    const existingInventoryMap = new Map();
    const skuIds = [...new Set(uniqueRows.map((r) => r.skuId))];
    const warehouseIdsForQuery = [...new Set(uniqueRows.map((r) => r.warehouseId))];
    const cityIdsForQuery = [...new Set(uniqueRows.map((r) => r.cityId).filter(Boolean))];

    // Fetch existing records in batches
    for (let i = 0; i < skuIds.length; i += BATCH_SIZE) {
      const skuBatch = skuIds.slice(i, i + BATCH_SIZE);
      const existing = await SkuInventory.find({
        skuId: { $in: skuBatch },
        warehouse: { $in: warehouseIdsForQuery },
        $or: [
          { city: { $in: cityIdsForQuery } },
          { city: null },
        ],
      })
        .select('skuId warehouse city quantity')
        .lean();

      existing.forEach((inv) => {
        const key = `${inv.skuId}_${inv.warehouse}_${inv.city || 'null'}`;
        existingInventoryMap.set(key, inv);
      });
    }

    // Process in batches
    for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
      const batch = uniqueRows.slice(i, i + BATCH_SIZE);
      const ops = [];

      for (const r of batch) {
        const existingKey = `${r.skuId}_${r.warehouseId}_${r.cityId || 'null'}`;
        const existing = existingInventoryMap.get(existingKey);

        if (existing) {
          // Update existing record
          let newQuantity = r.quantity;
          if (mode === 'increment' || mode === 'merge') {
            newQuantity = existing.quantity + r.quantity;
          }

          ops.push({
            updateOne: {
              filter: {
                skuId: r.skuId,
                warehouse: r.warehouseId,
                city: r.cityId || null,
              },
              update: {
                $set: {
                  quantity: newQuantity,
                  updatedAt: now,
                  lastRestocked: now,
                },
              },
            },
          });
          updatedCount++;
          if (mode === 'merge') mergedCount++;
        } else {
          // Create new record
          ops.push({
            updateOne: {
              filter: {
                skuId: r.skuId,
                warehouse: r.warehouseId,
                city: r.cityId || null,
              },
              update: {
                $set: {
                  skuId: r.skuId,
                  warehouse: r.warehouseId,
                  city: r.cityId || null,
                  quantity: r.quantity,
                  updatedAt: now,
                  lastRestocked: now,
                  stockAlertThreshold: 10,
                },
                $setOnInsert: {
                  createdAt: now,
                },
              },
              upsert: true,
            },
          });
          createdCount++;
        }
      }

      if (ops.length > 0) {
        try {
          await SkuInventory.bulkWrite(ops, { ordered: false });
        } catch (bulkError) {
          // Log bulk write errors but continue
          errors.push({
            row: null,
            error: `Bulk write error in batch ${Math.floor(i / BATCH_SIZE) + 1}: ${bulkError.message}`,
          });
        }
      }
    }

    await deleteFile(csvFilePath).catch(() => {});

    const errorReport = await writeErrorReportCsv({ prefix: 'sku-inventory', errorRows: errorRowsForCsv });

    return res.status(200).json({
      success: true,
      message: 'SKU inventory imported successfully',
      meta: {
        totalRows,
        resolvedRows: uniqueRows.length,
        createdCount,
        updatedCount,
        mergedCount,
        mode,
        durationMs: Date.now() - startedAt,
      },
      errors: errors.slice(0, 100),
      errorReport,
    });
  } catch (error) {
    if (req.file?.path) {
      await deleteFile(req.file.path).catch(() => {});
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to import SKU inventory',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

module.exports = {
  importVendorCatalog,
  importSkuInventory,
};


