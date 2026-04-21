/**
 * Worker-side vendor catalog CSV import (parse + category resolution + bulk writes + ProductListing sync).
 * Idempotent: safe to retry BullMQ jobs.
 */

const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model');
const ImportJob = require('../models/importJob.model');
const { resolveAbsoluteFsPath } = require('../config/uploadPaths');
const { writeErrorReportCsv } = require('../utils/csvErrorReport.util');
const {
  normalizeKey,
  pick,
  toNormalizedRow,
  parseCsvList,
  parseNumber,
  escapeRegex,
  KNOWN_KEYS,
} = require('../utils/vendorCatalogCsv.utils');
const { patchImportJob } = require('./importJobProgress.service');
const { enqueueProductListingSync } = require('../queues/productListingSync.queue');

const BATCH_VENDOR_KEYS = 500;

async function streamParseVendorCatalog(csvFilePath) {
  const groups = new Map();
  const errors = [];
  const errorRowsForCsv = [];
  let totalRows = 0;

  await new Promise((resolve, reject) => {
    const rs = fs.createReadStream(csvFilePath);
    rs.on('error', reject);
    rs.pipe(csv())
      .on('data', (raw) => {
        totalRows += 1;
        const rowNumber = totalRows + 1;

        try {
          const row = toNormalizedRow(raw);
          const vendorModel = String(pick(row, ['vendormodel', 'vendormodelnumber', 'model', 'vendormodelid'])).trim();
          const sku = String(pick(row, ['sku', 'skuid'])).trim();

          if (!vendorModel || !sku) {
            errors.push({
              row: rowNumber,
              error: 'Missing required fields: Vendor-Model and Sku',
              data: raw,
            });
            errorRowsForCsv.push({
              rowNumber,
              ...raw,
              errorReason: 'Missing required fields: Vendor-Model and Sku',
            });
            return;
          }

          const vendorModelKey = normalizeKey(vendorModel);
          const titleRaw = String(pick(row, ['title', 'name'])).trim();
          const title = titleRaw || vendorModel;
          const brand = String(pick(row, ['brand', 'branddesign'])).trim();
          const category = String(pick(row, ['category'])).trim();
          const subcategory = String(pick(row, ['subcategory', 'subcategorydepartment'])).trim();
          const subsubcategory = String(pick(row, ['subsubcategory'])).trim();
          const description = String(pick(row, ['description', 'desc'])).trim();
          const metalColor = String(pick(row, ['metalcolor', 'color'])).trim();
          const metalType = String(pick(row, ['metaltype'])).trim();
          const size = String(pick(row, ['size'])).trim();
          const price = parseNumber(pick(row, ['tagprice', 'price', 'tag']));

          if (price === null || price < 0) {
            errors.push({
              row: rowNumber,
              error: 'Invalid Tag Price (must be a non-negative number)',
              data: raw,
            });
            errorRowsForCsv.push({
              rowNumber,
              ...raw,
              errorReason: 'Invalid Tag Price (must be a non-negative number)',
            });
            return;
          }

          const images = parseCsvList(pick(row, ['images', 'image', 'featureimageslink']));
          const gallery = parseCsvList(pick(row, ['gallery', 'galleryimagelink']));

          const attributes = {};
          Object.keys(row).forEach((k) => {
            if (!KNOWN_KEYS.has(k)) {
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
        } catch (rowErr) {
          errors.push({ row: rowNumber, error: rowErr.message, data: raw });
          errorRowsForCsv.push({
            rowNumber,
            ...raw,
            errorReason: `Row parse error: ${rowErr.message}`,
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  for (const [k, g] of groups.entries()) {
    if (!g.category) {
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
        error: `Vendor-Model "${g.vendorModel}" is missing required Category (group skipped)`,
      });
      groups.delete(k);
    }
  }

  let validRows = 0;
  for (const g of groups.values()) {
    validRows += (g.rows && g.rows.length) || 0;
  }

  const failedRows = totalRows - validRows;

  return {
    groups,
    errors,
    errorRowsForCsv,
    totalRows,
    validRows,
    failedRows,
  };
}

async function getOrCreateCategory(categoryName) {
  if (!categoryName) return null;
  const formattedName = String(categoryName).trim().toUpperCase();
  let category = await Category.findOne({
    $or: [{ name: formattedName }, { name: new RegExp(`^${escapeRegex(formattedName)}$`, 'i') }],
  });
  if (!category) {
    category = new Category({ name: formattedName });
    await category.save();
  } else if (category.name !== formattedName) {
    category.name = formattedName;
    await category.save();
  }
  return category._id;
}

async function getOrCreateSubCategory(subcategoryName, parentCategoryId) {
  if (!subcategoryName || !parentCategoryId) return null;
  const formattedName = String(subcategoryName).trim().toUpperCase();
  let subcategory = await SubCategory.findOne({
    parentCategory: parentCategoryId,
    $or: [{ name: formattedName }, { name: new RegExp(`^${escapeRegex(formattedName)}$`, 'i') }],
  });
  if (!subcategory) {
    subcategory = new SubCategory({ name: formattedName, parentCategory: parentCategoryId });
    await subcategory.save();
  } else if (subcategory.name !== formattedName) {
    subcategory.name = formattedName;
    await subcategory.save();
  }
  return subcategory._id;
}

async function getOrCreateSubSubCategory(subsubcategoryName, parentSubCategoryId) {
  if (!subsubcategoryName || !parentSubCategoryId) return null;
  const formattedName = String(subsubcategoryName).trim().toUpperCase();
  let subsubcategory = await SubSubCategory.findOne({
    parentSubCategory: parentSubCategoryId,
    $or: [{ name: formattedName }, { name: new RegExp(`^${escapeRegex(formattedName)}$`, 'i') }],
  });
  if (!subsubcategory) {
    subsubcategory = new SubSubCategory({ name: formattedName, parentSubCategory: parentSubCategoryId });
    await subsubcategory.save();
  } else if (subsubcategory.name !== formattedName) {
    subsubcategory.name = formattedName;
    await subsubcategory.save();
  }
  return subsubcategory._id;
}

async function resolveCategoriesForGroups(groups) {
  const categoryMap = new Map();
  const subcategoryMap = new Map();
  const subsubcategoryMap = new Map();

  for (const g of groups.values()) {
    if (!g.category) continue;
    let categoryId = categoryMap.get(g.category);
    if (!categoryId) {
      categoryId = await getOrCreateCategory(g.category);
      if (categoryId) categoryMap.set(g.category, categoryId);
    }
    g.categoryId = categoryId;

    if (g.subcategory && categoryId) {
      const subcategoryKey = `${categoryId}_${g.subcategory}`;
      let subcategoryId = subcategoryMap.get(subcategoryKey);
      if (!subcategoryId) {
        subcategoryId = await getOrCreateSubCategory(g.subcategory, categoryId);
        if (subcategoryId) subcategoryMap.set(subcategoryKey, subcategoryId);
      }
      g.subcategoryId = subcategoryId;

      if (g.subsubcategory && subcategoryId) {
        const subsubcategoryKey = `${subcategoryId}_${g.subsubcategory}`;
        let subsubcategoryId = subsubcategoryMap.get(subsubcategoryKey);
        if (!subsubcategoryId) {
          subsubcategoryId = await getOrCreateSubSubCategory(g.subsubcategory, subcategoryId);
          if (subsubcategoryId) subsubcategoryMap.set(subsubcategoryKey, subsubcategoryId);
        }
        g.subsubcategoryId = subsubcategoryId;
      }
    }
  }
}

function rowCountForKeys(groups, keys) {
  let n = 0;
  for (const k of keys) {
    const g = groups.get(k);
    if (g?.rows) n += g.rows.length;
  }
  return n;
}

async function bulkUpsertVendorChunk(groups, vendorKeys, now) {
  const vendorOps = vendorKeys.map((vendorModelKey) => {
    const g = groups.get(vendorModelKey);
    const set = {
      vendorModel: g.vendorModel,
      vendorModelKey: g.vendorModelKey,
      title: g.title,
      brand: g.brand || 'Unknown',
      category: g.categoryId || g.category,
      subcategory: g.subcategoryId || null,
      subsubcategory: g.subsubcategoryId || null,
      description: g.description,
      updatedAt: now,
    };
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

  const skuOps = [];
  const skuKeys = new Set();

  for (const vendorModelKey of vendorKeys) {
    const g = groups.get(vendorModelKey);
    const vp = vendorMap.get(vendorModelKey);
    if (!vp?._id) continue;
    for (const r of g.rows) {
      skuKeys.add(r.skuKey);
      skuOps.push({
        updateOne: {
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
      skuWrite = { error: e.message };
    }
  }

  const skuDocs = await Sku.find({ skuKey: { $in: Array.from(skuKeys) } })
    .select('_id skuKey productId')
    .lean();
  const skuDocMap = new Map(skuDocs.map((s) => [s.skuKey, s]));

  const vendorUpdateOps = [];
  for (const vendorModelKey of vendorKeys) {
    const vp = vendorMap.get(vendorModelKey);
    if (!vp?._id) continue;
    const g = groups.get(vendorModelKey);
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

  const productIds = vendorProducts.map((p) => p._id).filter(Boolean);

  return { vendorWrite, skuWrite, productIds };
}

/**
 * Runs full import for one queued job document.
 * @param {string} importJobId Mongo _id of ImportJob
 */
async function runVendorCatalogImport(importJobId) {
  const jobDoc = await ImportJob.findById(importJobId);
  if (!jobDoc) {
    throw new Error(`ImportJob not found: ${importJobId}`);
  }

  const { jobId, csvPath: csvPathStored } = jobDoc;
  const csvAbs = resolveAbsoluteFsPath(csvPathStored);
  const now = new Date();

  await patchImportJob(importJobId, {
    status: 'processing',
    startedAt: now,
    progressPercent: 0,
    errorMessage: '',
  });

  let parseResult;
  try {
    if (!csvAbs || !fs.existsSync(csvAbs)) {
      throw new Error(
        `Import CSV not found (stored: ${csvPathStored || 'missing'}, resolved: ${csvAbs || 'n/a'}). ` +
          `Use a project-local queue or clear stale Bull jobs from shared Redis.`
      );
    }
    parseResult = await streamParseVendorCatalog(csvAbs);
  } catch (parseErr) {
    await patchImportJob(importJobId, {
      status: 'failed',
      progressPercent: 0,
      errorMessage: parseErr.message || 'CSV parse failed',
      completedAt: new Date(),
    });
    throw parseErr;
  }

  const { groups, errors, errorRowsForCsv, totalRows, validRows, failedRows } = parseResult;

  const vendorKeys = Array.from(groups.keys());

  let finalized = false;
  let finalizeErrorMsg = '';
  try {
    await patchImportJob(importJobId, {
      totalRows,
      validRows,
      failedRows,
      progressPercent: 0,
      processedRows: 0,
    });

    if (vendorKeys.length === 0) {
      const errorReport = await writeErrorReportCsv({
        prefix: `vendor-catalog-${jobId}`,
        errorRows: errorRowsForCsv,
      });
      await patchImportJob(importJobId, {
        status: 'completed',
        progressPercent: 100,
        processedRows: 0,
        errorReportPath: errorReport?.path || '',
        completedAt: new Date(),
      });
      finalized = true;
      return { vendorModels: 0, errors: errors.slice(0, 100), errorReport };
    }

    await resolveCategoriesForGroups(groups);

    let processedRows = 0;
    const listingProductIds = new Set();

    for (let i = 0; i < vendorKeys.length; i += BATCH_VENDOR_KEYS) {
      const batchKeys = vendorKeys.slice(i, i + BATCH_VENDOR_KEYS);
      const rowsInBatch = rowCountForKeys(groups, batchKeys);

      try {
        const { productIds } = await bulkUpsertVendorChunk(groups, batchKeys, now);
        for (const p of productIds) listingProductIds.add(String(p));
        processedRows += rowsInBatch;
      } catch (batchErr) {
        errors.push({ row: null, error: `Batch error: ${batchErr.message}` });
        console.error('[vendorCatalogImport] batch failed', batchErr);
      }

      /** Progress over valid rows only; 100% means all valid rows written (listing sync may follow). */
      const rawPct = validRows > 0 ? Math.round((processedRows / validRows) * 100) : 100;
      const progressPercent =
        validRows > 0 && processedRows >= validRows ? 100 : Math.min(99, rawPct);

      await patchImportJob(importJobId, {
        processedRows,
        progressPercent,
      });
    }

    if (listingProductIds.size > 0) {
      try {
        await enqueueProductListingSync([...listingProductIds]);
      } catch (syncErr) {
        errors.push({ row: null, error: `ProductListing sync enqueue: ${syncErr.message}` });
      }
    }

    let errorReport = { path: '' };
    try {
      errorReport = await writeErrorReportCsv({
        prefix: `vendor-catalog-${jobId}`,
        errorRows: errorRowsForCsv,
      });
    } catch (repErr) {
      errors.push({ row: null, error: `Error report export failed: ${repErr.message}` });
    }

    await patchImportJob(importJobId, {
      status: 'completed',
      progressPercent: 100,
      processedRows,
      totalRows,
      validRows,
      failedRows,
      errorReportPath: errorReport?.path || '',
      completedAt: new Date(),
    });
    finalized = true;


    return {
      vendorModels: vendorKeys.length,
      totalRows,
      validRows,
      failedRows,
      errors: errors.slice(0, 100),
      errorReport,
    };
  } catch (tailErr) {
    finalizeErrorMsg = tailErr?.message || 'Vendor catalog import failed';
    errors.push({ row: null, error: finalizeErrorMsg });
  } finally {
    if (!finalized) {
      try {
        await patchImportJob(importJobId, {
          status: 'failed',
          errorMessage: finalizeErrorMsg || 'Vendor catalog import did not complete',
          progressPercent: 99,
          completedAt: new Date(),
        });
      } catch (_) {}
    }
  }

  return {
    vendorModels: vendorKeys.length,
    totalRows,
    validRows,
    failedRows,
    errors: errors.slice(0, 100),
    errorReport: null,
  };
}

module.exports = {
  runVendorCatalogImport,
  streamParseVendorCatalog,
};
