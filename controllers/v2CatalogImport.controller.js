const csv = require('csv-parser');
const fs = require('fs');
const mongoose = require('mongoose');

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
      if (!g.brand || !g.category) {
        errors.push({
          row: null,
          error: `Vendor-Model "${g.vendorModel}" is missing required Brand/Category (group skipped)`,
        });
        groups.delete(k);
      }
    }

    const vendorKeys = Array.from(groups.keys());
    if (vendorKeys.length === 0) {
      await deleteFile(csvFilePath).catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'No valid rows found to import (check Vendor-Model and Sku columns).',
        errors: errors.slice(0, 100),
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
        brand: g.brand,
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
 * Bulk SKU Inventory Import (CSV)
 *
 * Expected columns (case-insensitive; symbols ignored):
 * - sku
 * - warehouse (name or id)
 * - city (name or id)
 * - quantity
 *
 * Query params:
 * - mode=replace|increment (default: replace)
 */
const importSkuInventory = async (req, res) => {
  const startedAt = Date.now();
  const now = new Date();

  const modeRaw = String(req.query.mode || 'replace').toLowerCase();
  const mode = modeRaw === 'increment' ? 'increment' : 'replace';

  try {
    if (!req.file?.path) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded (csvFile).' });
    }

    const csvFilePath = req.file.path;
    const rows = [];
    const errors = [];
    let totalRows = 0;

    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (raw) => {
          totalRows += 1;
          const rowNumber = totalRows + 1;
          const row = toNormalizedRow(raw);

          const sku = String(pick(row, ['sku', 'skuid'])).trim();
          const warehouseRaw = String(pick(row, ['warehouse', 'warehousename', 'warehouseid'])).trim();
          const cityRaw = String(pick(row, ['city', 'cityname', 'cityid'])).trim();
          const quantityVal = parseNumber(pick(row, ['quantity', 'qty']));

          if (!sku || !warehouseRaw || !cityRaw || quantityVal === null) {
            errors.push({
              row: rowNumber,
              error: 'Missing required fields: sku, warehouse, city, quantity',
              data: raw,
            });
            return;
          }

          if (quantityVal < 0) {
            errors.push({ row: rowNumber, error: 'Quantity must be >= 0', data: raw });
            return;
          }

          rows.push({
            rowNumber,
            sku,
            skuKey: normalizeKey(sku),
            warehouseRaw,
            cityRaw,
            quantity: Math.floor(quantityVal),
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    const skuKeys = [...new Set(rows.map((r) => r.skuKey))];
    const skuDocs = await Sku.find({ skuKey: { $in: skuKeys } }).select('_id skuKey').lean();
    const skuMap = new Map(skuDocs.map((s) => [s.skuKey, s]));

    const warehouseNames = [...new Set(rows.filter((r) => !isObjectIdLike(r.warehouseRaw)).map((r) => r.warehouseRaw))];
    const warehouseIds = [...new Set(rows.filter((r) => isObjectIdLike(r.warehouseRaw)).map((r) => r.warehouseRaw))];
    const cityNames = [...new Set(rows.filter((r) => !isObjectIdLike(r.cityRaw)).map((r) => r.cityRaw))];
    const cityIds = [...new Set(rows.filter((r) => isObjectIdLike(r.cityRaw)).map((r) => r.cityRaw))];

    const warehouseMap = new Map();
    if (warehouseIds.length > 0) {
      const ws = await Warehouse.find({ _id: { $in: warehouseIds } }).select('_id name').lean();
      ws.forEach((w) => warehouseMap.set(String(w._id), w));
    }
    for (const name of warehouseNames) {
      const w = await Warehouse.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
        .select('_id name')
        .lean();
      if (w) warehouseMap.set(name, w);
    }

    const cityMap = new Map();
    if (cityIds.length > 0) {
      const cs = await City.find({ _id: { $in: cityIds } }).select('_id name').lean();
      cs.forEach((c) => cityMap.set(String(c._id), c));
    }
    for (const name of cityNames) {
      const c = await City.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
        .select('_id name')
        .lean();
      if (c) cityMap.set(name, c);
    }

    const ops = [];
    let resolvedRows = 0;

    for (const r of rows) {
      const skuDoc = skuMap.get(r.skuKey);
      if (!skuDoc?._id) {
        errors.push({ row: r.rowNumber, error: `SKU not found: ${r.sku}`, data: r });
        continue;
      }

      const warehouseDoc = isObjectIdLike(r.warehouseRaw)
        ? warehouseMap.get(String(r.warehouseRaw))
        : warehouseMap.get(r.warehouseRaw);
      if (!warehouseDoc?._id) {
        errors.push({ row: r.rowNumber, error: `Warehouse not found: ${r.warehouseRaw}`, data: r });
        continue;
      }

      const cityDoc = isObjectIdLike(r.cityRaw) ? cityMap.get(String(r.cityRaw)) : cityMap.get(r.cityRaw);
      if (!cityDoc?._id) {
        errors.push({ row: r.rowNumber, error: `City not found: ${r.cityRaw}`, data: r });
        continue;
      }

      resolvedRows += 1;

      const update =
        mode === 'increment'
          ? {
              $inc: { quantity: r.quantity },
              $set: { updatedAt: now, lastRestocked: now },
              $setOnInsert: {
                skuId: skuDoc._id,
                warehouse: warehouseDoc._id,
                city: cityDoc._id,
                createdAt: now,
                stockAlertThreshold: 10,
              },
            }
          : {
              $set: {
                skuId: skuDoc._id,
                warehouse: warehouseDoc._id,
                city: cityDoc._id,
                quantity: r.quantity,
                updatedAt: now,
                lastRestocked: now,
              },
              $setOnInsert: { createdAt: now, stockAlertThreshold: 10 },
            };

      ops.push({
        updateOne: {
          filter: { skuId: skuDoc._id, warehouse: warehouseDoc._id, city: cityDoc._id },
          update,
          upsert: true,
        },
      });
    }

    let writeResult = null;
    if (ops.length > 0) {
      writeResult = await SkuInventory.bulkWrite(ops, { ordered: false });
    }

    await deleteFile(csvFilePath).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'SKU inventory imported successfully',
      meta: {
        totalRows,
        resolvedRows,
        mode,
        durationMs: Date.now() - startedAt,
      },
      results: writeResult,
      errors: errors.slice(0, 100),
    });
  } catch (error) {
    if (req.file?.path) {
      await deleteFile(req.file.path).catch(() => {});
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to import SKU inventory',
      error: error.message,
    });
  }
};

module.exports = {
  importVendorCatalog,
  importSkuInventory,
};


