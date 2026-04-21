/**
 * Worker: SKU inventory CSV import + Redis inventory rebuild + ProductListing queue.
 */

const csv = require('csv-parser');
const fs = require('fs');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const City = require('../models/city.model');
const Warehouse = require('../models/warehouse.model');
const ImportJob = require('../models/importJob.model');
const { resolveAbsoluteFsPath } = require('../config/uploadPaths');
const { writeErrorReportCsv } = require('../utils/csvErrorReport.util');
const {
  normalizeKey,
  escapeRegex,
  parseNumber,
  pick,
  toNormalizedRow,
} = require('../utils/vendorCatalogCsv.utils');
const { patchImportJob } = require('./importJobProgress.service');
const { rebuildInventoryRedisForSkuIds } = require('./inventoryRedis.service');
const { syncProductListingsInChunks } = require('./productListingSync.service');
const skuInventoryBulkImportGuard = require('./skuInventoryBulkImportGuard');

const isObjectIdLike = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());

const normalizeName = (name) => {
  if (!name) return '';
  return String(name).trim().toLowerCase();
};

const FETCH_BATCH = 100;
const WRITE_BATCH = Number(process.env.SKU_INVENTORY_WRITE_BATCH) || 500;
const LISTING_SYNC_CONCURRENCY = Number(process.env.SKU_IMPORT_LISTING_SYNC_CONCURRENCY) || 80;

async function runSkuInventoryCsvImport(importJobId, { csvPath, mode: modeRaw }) {
  const startedAt = Date.now();
  const now = new Date();
  const modeStr = String(modeRaw || 'merge').toLowerCase();
  const mode = ['replace', 'increment', 'merge'].includes(modeStr) ? modeStr : 'merge';

  const jobMeta = await ImportJob.findById(importJobId).select('jobId csvPath').lean();
  const publicJobId = jobMeta?.jobId || String(importJobId);
  const storedCsvPath = jobMeta?.csvPath || csvPath;
  const csvAbs = resolveAbsoluteFsPath(storedCsvPath);
  if (!csvAbs || !fs.existsSync(csvAbs)) {
    throw new Error(
      `Import CSV not found (stored: ${storedCsvPath || 'missing'}, resolved: ${csvAbs || 'n/a'}). ` +
        `Use a project-local queue or clear stale Bull jobs from shared Redis.`
    );
  }

  await patchImportJob(importJobId, {
    status: 'processing',
    startedAt: now,
    progressPercent: 0,
    processedRows: 0,
  });

  const rows = [];
  const errors = [];
  const errorRowsForCsv = [];
  let totalRows = 0;

  await new Promise((resolve, reject) => {
    const rs = fs.createReadStream(csvAbs);
    rs.on('error', reject);
    rs.pipe(csv())
      .on('data', (raw) => {
        totalRows += 1;
        const rowNumber = totalRows + 1;
        const row = toNormalizedRow(raw);

        const sku = String(pick(row, ['sku', 'skuid'])).trim();
        const warehouseInput = String(pick(row, ['warehouse', 'warehousename', 'warehouseid']) || '').trim();
        const cityInput = String(pick(row, ['city', 'cityname', 'cityid']) || '').trim();
        const quantityVal = parseNumber(pick(row, ['quantity', 'qty']));

        if (!sku || !warehouseInput || quantityVal === null) {
          errors.push({
            row: rowNumber,
            error: 'Missing required fields: sku, warehouse, quantity (city is optional)',
            data: raw,
          });
          errorRowsForCsv.push({
            rowNumber,
            ...raw,
            errorReason: 'Missing required fields: sku, warehouse, quantity (city is optional)',
          });
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
          warehouseRaw: normalizeName(warehouseInput),
          cityRaw: cityInput ? normalizeName(cityInput) : null,
          quantity: Math.floor(quantityVal),
        });
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (rows.length === 0) {
    const errorReport = await writeErrorReportCsv({
      prefix: `sku-inventory-${publicJobId}`,
      errorRows: errorRowsForCsv,
    });
    await patchImportJob(importJobId, {
      status: 'completed',
      progressPercent: 100,
      totalRows,
      validRows: 0,
      failedRows: totalRows,
      errorReportPath: errorReport?.path || '',
      completedAt: new Date(),
    });
    return { meta: { totalRows, resolvedRows: 0 }, errors: errors.slice(0, 100), errorReport };
  }

  const skuKeys = [...new Set(rows.map((r) => r.skuKey))];
  const skuDocs = await Sku.find({ skuKey: { $in: skuKeys } }).select('_id skuKey productId').lean();
  const skuMap = new Map(skuDocs.map((s) => [s.skuKey, s]));

  const warehouseNames = [
    ...new Set(rows.filter((r) => !isObjectIdLike(r.warehouseRaw) && r.warehouseRaw).map((r) => r.warehouseRaw)),
  ];
  const warehouseIds = [
    ...new Set(rows.filter((r) => isObjectIdLike(r.warehouseRaw)).map((r) => r.warehouseRaw)),
  ];
  const cityNames = [
    ...new Set(rows.filter((r) => r.cityRaw && !isObjectIdLike(r.cityRaw)).map((r) => r.cityRaw)),
  ];
  const cityIds = [...new Set(rows.filter((r) => r.cityRaw && isObjectIdLike(r.cityRaw)).map((r) => r.cityRaw))];

  const warehouseMap = new Map();
  if (warehouseIds.length > 0) {
    const ws = await Warehouse.find({ _id: { $in: warehouseIds } }).select('_id name').lean();
    ws.forEach((w) => {
      warehouseMap.set(String(w._id), w);
      warehouseMap.set(normalizeName(w.name), w);
    });
  }
  for (const name of warehouseNames) {
    if (!warehouseMap.has(name)) {
      const w = await Warehouse.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
        .select('_id name')
        .lean();
      if (w) {
        warehouseMap.set(name, w);
        warehouseMap.set(normalizeName(w.name), w);
      }
    }
  }

  const cityMap = new Map();
  cityMap.set(null, null);
  if (cityIds.length > 0) {
    const cs = await City.find({ _id: { $in: cityIds } }).select('_id name').lean();
    cs.forEach((c) => {
      cityMap.set(String(c._id), c);
      cityMap.set(normalizeName(c.name), c);
    });
  }
  for (const name of cityNames) {
    if (!cityMap.has(name)) {
      const c = await City.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
        .select('_id name')
        .lean();
      if (c) {
        cityMap.set(name, c);
        cityMap.set(normalizeName(c.name), c);
      }
    }
  }

  const resolvedRows = [];
  const quantityMap = new Map();

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

    const cityDoc = r.cityRaw
      ? isObjectIdLike(r.cityRaw)
        ? cityMap.get(String(r.cityRaw))
        : cityMap.get(r.cityRaw)
      : null;

    const cityId = cityDoc?._id || null;
    const mergeKey = `${skuDoc._id}_${warehouseDoc._id}_${cityId || 'null'}`;

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
      productId: skuDoc.productId || null,
      warehouseId: warehouseDoc._id,
      cityId,
      quantity: quantityMap.get(mergeKey),
      mergeKey,
    });
  }

  const uniqueRows = [];
  const seenKeys = new Set();
  for (let i = resolvedRows.length - 1; i >= 0; i--) {
    const r = resolvedRows[i];
    if (!seenKeys.has(r.mergeKey)) {
      uniqueRows.unshift(r);
      seenKeys.add(r.mergeKey);
    }
  }

  let createdCount = 0;
  let updatedCount = 0;
  let mergedCount = 0;

  const validRows = uniqueRows.length;
  const failedRows = Math.max(0, totalRows - validRows);

  await patchImportJob(importJobId, {
    totalRows,
    validRows,
    failedRows,
    progressPercent: 0,
    processedRows: 0,
  });

  const existingInventoryMap = new Map();
  const skuIdsAll = [...new Set(uniqueRows.map((r) => r.skuId))];
  const warehouseIdsForQuery = [...new Set(uniqueRows.map((r) => r.warehouseId))];
  const cityIdsForQuery = [...new Set(uniqueRows.map((r) => r.cityId).filter(Boolean))];

  for (let i = 0; i < skuIdsAll.length; i += FETCH_BATCH) {
    const skuBatch = skuIdsAll.slice(i, i + FETCH_BATCH);
    const existing = await SkuInventory.find({
      skuId: { $in: skuBatch },
      warehouse: { $in: warehouseIdsForQuery },
      $or: [{ city: { $in: cityIdsForQuery } }, { city: null }],
    })
      .select('skuId warehouse city quantity')
      .lean();

    existing.forEach((inv) => {
      const key = `${inv.skuId}_${inv.warehouse}_${inv.city || 'null'}`;
      existingInventoryMap.set(key, inv);
    });
  }

  let processedRows = 0;

  skuInventoryBulkImportGuard.enter();
  try {
  for (let i = 0; i < uniqueRows.length; i += WRITE_BATCH) {
    const batch = uniqueRows.slice(i, i + WRITE_BATCH);
    const ops = [];

    for (const r of batch) {
      const existingKey = `${r.skuId}_${r.warehouseId}_${r.cityId || 'null'}`;
      const existing = existingInventoryMap.get(existingKey);

      if (existing) {
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
        errors.push({
          row: null,
          error: `Bulk write error in batch ${Math.floor(i / WRITE_BATCH) + 1}: ${bulkError.message}`,
        });
      }
    }

    processedRows += batch.length;
    /** Progress is over valid rows only; failed file rows do not hold the bar below 100. */
    const rawPct = validRows > 0 ? Math.round((processedRows / validRows) * 100) : 100;
    const progressPercent =
      validRows > 0 && processedRows >= validRows ? 100 : Math.min(99, rawPct);

    await patchImportJob(importJobId, {
      processedRows,
      progressPercent,
    });
  }
  } finally {
    skuInventoryBulkImportGuard.exit();
  }

  /** Single post-pass + guaranteed terminal job row (never leave `processing` at 100%). */
  let finalized = false;
  let finalizeErrorMsg = '';
  try {
    try {
      if (skuIdsAll.length > 0) {
        await rebuildInventoryRedisForSkuIds(skuIdsAll);
      }
      const productIds = [
        ...new Set(uniqueRows.map((r) => (r.productId ? String(r.productId) : null)).filter(Boolean)),
      ];
      if (productIds.length > 0) {
        await syncProductListingsInChunks(productIds, LISTING_SYNC_CONCURRENCY);
      }
    } catch (postErr) {
      errors.push({ row: null, error: `Post-import Redis/listing: ${postErr.message}` });
    }

    let errorReport = { path: '' };
    try {
      errorReport = await writeErrorReportCsv({
        prefix: `sku-inventory-${publicJobId}`,
        errorRows: errorRowsForCsv,
      });
    } catch (repErr) {
      errors.push({ row: null, error: `Error report export failed: ${repErr.message}` });
    }

    await patchImportJob(importJobId, {
      status: 'completed',
      progressPercent: 100,
      processedRows: validRows,
      totalRows,
      failedRows,
      validRows,
      errorReportPath: errorReport?.path || '',
      completedAt: new Date(),
    });
    finalized = true;
  } catch (tailErr) {
    finalizeErrorMsg = tailErr?.message || 'Import finalization failed';
    errors.push({ row: null, error: finalizeErrorMsg });
  } finally {
    if (!finalized) {
      try {
        await patchImportJob(importJobId, {
          status: 'failed',
          errorMessage: finalizeErrorMsg || 'Import did not complete',
          progressPercent: 99,
          completedAt: new Date(),
        });
      } catch (_) {}
    }
  }

  return {
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
  };
}

module.exports = { runSkuInventoryCsvImport };
