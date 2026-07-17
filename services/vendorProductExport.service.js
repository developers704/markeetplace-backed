const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { stringify } = require('csv-stringify/sync');

const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const Warehouse = require('../models/warehouse.model');
const ExportHistory = require('../models/exportHistory.model');
const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model');
const { PROJECT_ROOT } = require('../config/uploadPaths');

const EXPORT_PRODUCT_SELECT = '_id vendorModel brand category subcategory subsubcategory';
const EXPORT_SKU_SELECT = 'sku price tagPrice productId metalColor metalType size images gallery attributes';
const EXPORT_FIXED_HEADERS = [
  'Sku',
  'Vendor-Model',
  'Description-Name',
  'cp-price',
  'Tag Price',
  '99-Price',
  'Category',
  'Subcategory-Department',
  'Style',
  'Brand-Design',
  'Metal-Color',
  'Metal-Type',
  'Size',
  'Gender',
  'Extent-Width',
  'AvgWeight',
  'Stone Type',
  'Center-Stone',
  'Center-Carat',
  'Center-Shape',
  'Center-Color',
  'Center-Clarity',
  'Side-Stone',
  'Side-Carat',
  'Side-Shape',
  'Side-Color',
  'Side-Clarity',
  'Dial',
  'Year',
  'Model-No',
  'Featureimages_Link',
  'Galleryimage_Link',
  'Vendor',
];
const EXPORT_SKU_BATCH_SIZE = 300;
const EXPORT_PRODUCT_ID_CHUNK = 2000;
const EXPORT_INV_BATCH_SIZE = 5000;
const EXPORT_PROGRESS_UPDATE_EVERY = 1000;

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseMulti = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const toLooseEqualsRegex = (value) => {
  const parts = String(value || '')
    .trim()
    .split(/[-_\s]+/g)
    .filter(Boolean);
  if (!parts.length) return null;
  const pattern = parts.map(escapeRegex).join('[-\\s_]+');
  return new RegExp(`^${pattern}$`, 'i');
};

const skuSearchMatchFromRegex = (searchRegex) => ({
  $or: [{ sku: searchRegex }, { 'attributes.modelno': searchRegex }],
});

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const extractObjectIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  const raw = typeof value === 'object' && value.toString ? value.toString() : String(value);
  return mongoose.Types.ObjectId.isValid(raw) ? raw : null;
};

const resolveRefName = (value, idToNameMap) => {
  if (!value) return '';
  if (typeof value === 'object' && value.name) return String(value.name || '').trim();
  const asId = extractObjectIdString(value);
  if (asId && idToNameMap.has(asId)) return idToNameMap.get(asId) || '';
  if (typeof value === 'string') return value.trim();
  return '';
};

const skuAttributesToObject = (sku) => {
  if (!sku?.attributes || typeof sku.attributes !== 'object') return {};
  return sku.attributes instanceof Map ? Object.fromEntries(sku.attributes) : sku.attributes;
};

const buildVendorProductExportMatch = async (filters = {}) => {
  const search = String(filters.search || '').trim();
  const brandRaw = filters.brand;
  const categoryRaw = filters.category;
  const subcategoryRaw = filters.subcategory;
  const subsubcategoryRaw = filters.subsubcategory;

  const match = {};
  const brandValues = parseMulti(brandRaw);
  if (brandValues.length === 1) match.brand = toLooseEqualsRegex(brandValues[0]);
  else if (brandValues.length > 1) {
    match.brand = { $in: brandValues.map(toLooseEqualsRegex).filter(Boolean) };
  }

  if (subcategoryRaw && mongoose.Types.ObjectId.isValid(subcategoryRaw)) {
    match.subcategory = new mongoose.Types.ObjectId(subcategoryRaw);
  }
  if (subsubcategoryRaw && mongoose.Types.ObjectId.isValid(subsubcategoryRaw)) {
    match.subsubcategory = new mongoose.Types.ObjectId(subsubcategoryRaw);
  }

  if (categoryRaw) {
    if (mongoose.Types.ObjectId.isValid(categoryRaw)) {
      match.category = { $in: [new mongoose.Types.ObjectId(categoryRaw), categoryRaw] };
    } else {
      match.category = toLooseEqualsRegex(String(categoryRaw));
    }
  }

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    const matchingSkus = await Sku.find(skuSearchMatchFromRegex(searchRegex)).select('productId').lean();
    const productIdsFromSku = matchingSkus.map((s) => s.productId).filter(Boolean);
    match.$or = [
      { vendorModel: searchRegex },
      { title: searchRegex },
      { brand: searchRegex },
      ...(productIdsFromSku.length > 0 ? [{ _id: { $in: productIdsFromSku } }] : []),
    ];
  }

  return match;
};

const collectExportDynamicHeaders = async (productIds) => {
  const keys = new Set();
  try {
    for (const idChunk of chunkArray(productIds, 5000)) {
      const result = await Sku.aggregate([
        { $match: { productId: { $in: idChunk }, isActive: true } },
        { $project: { attrs: { $objectToArray: { $ifNull: ['$attributes', {}] } } } },
        { $unwind: '$attrs' },
        { $group: { _id: null, keys: { $addToSet: '$attrs.k' } } },
      ]).allowDiskUse(true);
      (result[0]?.keys || []).forEach((k) => keys.add(String(k)));
    }
  } catch (err) {
    console.warn('[vendor-product-export] dynamic header aggregation failed:', err.message);
  }
  return Array.from(keys)
    .map((k) => String(k || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
};

const USED_ATTRIBUTE_KEYS = new Set([
  'featureimageslink',
  'featureimagelink',
  'featureimage_link',
  'galleryimagelink',
  'galleryimage_link',
  'vendormodel',
  'vendor-model',
  'descriptionname',
  'description-name',
  'cpprice',
  'cp-price',
  '99price',
  '99-price',
  'department',
  'subcategorydepartment',
  'subcategory-department',
  'style',
  'brand',
  'design',
  'branddesign',
  'metalcolor',
  'metal-color',
  'metaltype',
  'metal-type',
  'size',
  'gender',
  'extentwidth',
  'extent-width',
  'width',
  'avgweight',
  'averageweight',
  'avg-weight',
  'stonetype',
  'stone-type',
  'centerstone',
  'center-stone',
  'centercarat',
  'center-carat',
  'centershape',
  'center-shape',
  'centercolor',
  'center-color',
  'centerclarity',
  'center-clarity',
  'sidestone',
  'side-stone',
  'sidecarat',
  'side-carat',
  'sideshape',
  'side-shape',
  'sidecolor',
  'side-color',
  'sideclarity',
  'side-clarity',
  'dial',
  'year',
  'modelno',
  'model-no',
  'modelnumber',
  'vendor',
]);

const loadExportInventoryBySku = async (skuIds, warehouseById) => {
  const invBySku = new Map();
  if (!skuIds.length) return invBySku;

  for (let i = 0; i < skuIds.length; i += EXPORT_INV_BATCH_SIZE) {
    const chunk = skuIds.slice(i, i + EXPORT_INV_BATCH_SIZE);
    const invRows = await SkuInventory.find({ skuId: { $in: chunk } })
      .select('skuId warehouse quantity')
      .lean();

    invRows.forEach((inv) => {
      const key = String(inv.skuId);
      const warehouseName = String(warehouseById.get(String(inv.warehouse)) || '').trim();
      if (!invBySku.has(key)) invBySku.set(key, []);
      invBySku.get(key).push({
        warehouseName,
        quantity: Number(inv?.quantity || 0),
      });
    });
  }

  return invBySku;
};

const ensureCategoryMapsForProducts = async (
  products,
  categoryById,
  subcategoryById,
  subsubcategoryById,
) => {
  const missingCategoryIds = new Set();
  const missingSubcategoryIds = new Set();
  const missingSubsubcategoryIds = new Set();

  products.forEach((p) => {
    const cId = extractObjectIdString(p.category);
    const sId = extractObjectIdString(p.subcategory);
    const ssId = extractObjectIdString(p.subsubcategory);
    if (cId && !categoryById.has(cId)) missingCategoryIds.add(cId);
    if (sId && !subcategoryById.has(sId)) missingSubcategoryIds.add(sId);
    if (ssId && !subsubcategoryById.has(ssId)) missingSubsubcategoryIds.add(ssId);
  });

  const [cats, subs, subsubs] = await Promise.all([
    missingCategoryIds.size
      ? Category.find({ _id: { $in: [...missingCategoryIds] } }).select('_id name').lean()
      : [],
    missingSubcategoryIds.size
      ? SubCategory.find({ _id: { $in: [...missingSubcategoryIds] } }).select('_id name').lean()
      : [],
    missingSubsubcategoryIds.size
      ? SubSubCategory.find({ _id: { $in: [...missingSubsubcategoryIds] } }).select('_id name').lean()
      : [],
  ]);

  cats.forEach((c) => categoryById.set(String(c._id), c.name || ''));
  subs.forEach((c) => subcategoryById.set(String(c._id), c.name || ''));
  subsubs.forEach((c) => subsubcategoryById.set(String(c._id), c.name || ''));
};

const ensureProductsInCache = async (skus, productById) => {
  const missingIds = [];
  skus.forEach((sku) => {
    const id = String(sku.productId);
    if (!productById.has(id)) missingIds.push(sku.productId);
  });
  if (!missingIds.length) return [];

  const uniqueIds = [...new Set(missingIds.map(String))].map((id) => new mongoose.Types.ObjectId(id));
  const products = await VendorProduct.find({ _id: { $in: uniqueIds } }).select(EXPORT_PRODUCT_SELECT).lean();
  products.forEach((p) => productById.set(String(p._id), p));
  return products;
};

const buildVendorProductExportRow = (
  sku,
  productById,
  categoryById,
  subcategoryById,
  subsubcategoryById,
  invBySku,
  warehouseQtyHeaders,
  dynamicHeaders,
) => {
  const product = productById.get(String(sku.productId));
  const attrs = skuAttributesToObject(sku);

  const getAttr = (...keys) => {
    for (const key of keys) {
      const value = attrs?.[key];

      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
      ) {
        return String(value).trim();
      }
    }

    return '';
  };

  const skuInv = invBySku.get(String(sku._id)) || [];

  const warehouseQtyByName = new Map();

  skuInv.forEach((inv) => {
    if (!inv?.warehouseName) return;

    warehouseQtyByName.set(
      inv.warehouseName,
      (warehouseQtyByName.get(inv.warehouseName) || 0) +
        Number(inv.quantity || 0),
    );
  });

  const featureImages = Array.from(
    new Set(
      [
        getAttr(
          'featureimageslink',
          'featureimagelink',
          'featureimage_link',
        ),
        ...(Array.isArray(sku.images) ? sku.images : []),
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  const galleryImages = Array.from(
    new Set(
      [
        getAttr(
          'galleryimagelink',
          'galleryimage_link',
        ),
        ...(Array.isArray(sku.gallery) ? sku.gallery : []),
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  const row = {
    Sku: sku?.sku || '',

    'Vendor-Model':
      product?.vendorModel ||
      getAttr('vendormodel', 'vendor-model'),

    'Description-Name':
      product?.descriptionName ||
      product?.name ||
      getAttr('descriptionname', 'description-name'),

    'cp-price':
      sku?.price !== undefined && sku?.price !== null
        ? sku.price
        : getAttr('cpprice', 'cp-price'),

    'Tag Price': sku?.tagPrice ?? '',

    '99-Price': getAttr('99price', '99-price'),

    Category: resolveRefName(
      product?.category,
      categoryById,
    ),

    'Subcategory-Department':
      resolveRefName(
        product?.subcategory,
        subcategoryById,
      ) ||
      getAttr(
        'department',
        'subcategorydepartment',
        'subcategory-department',
      ),

    Style: getAttr('style'),

    'Brand-Design':
      product?.brand ||
      getAttr('brand', 'design', 'branddesign'),

    'Metal-Color':
      sku?.metalColor ||
      getAttr('metalcolor', 'metal-color'),

    'Metal-Type':
      sku?.metalType ||
      getAttr('metaltype', 'metal-type'),

    Size:
      sku?.size ||
      getAttr('size'),

    Gender: getAttr('gender'),

    'Extent-Width': getAttr(
      'extentwidth',
      'extent-width',
      'width',
    ),

    AvgWeight: getAttr(
      'avgweight',
      'averageweight',
      'avg-weight',
    ),

    'Stone Type': getAttr(
      'stonetype',
      'stone-type',
    ),

    'Center-Stone': getAttr(
      'centerstone',
      'center-stone',
    ),

    'Center-Carat': getAttr(
      'centercarat',
      'center-carat',
    ),

    'Center-Shape': getAttr(
      'centershape',
      'center-shape',
    ),

    'Center-Color': getAttr(
      'centercolor',
      'center-color',
    ),

    'Center-Clarity': getAttr(
      'centerclarity',
      'center-clarity',
    ),

    'Side-Stone': getAttr(
      'sidestone',
      'side-stone',
    ),

    'Side-Carat': getAttr(
      'sidecarat',
      'side-carat',
    ),

    'Side-Shape': getAttr(
      'sideshape',
      'side-shape',
    ),

    'Side-Color': getAttr(
      'sidecolor',
      'side-color',
    ),

    'Side-Clarity': getAttr(
      'sideclarity',
      'side-clarity',
    ),

    Dial: getAttr('dial'),

    Year: getAttr('year'),

    'Model-No': getAttr(
      'modelno',
      'model-no',
      'modelnumber',
    ),

    Featureimages_Link: featureImages.join(', '),

    Galleryimage_Link: galleryImages.join(', '),

    Vendor:
      product?.vendor?.name ||
      product?.vendorName ||
      getAttr('vendor'),
  };

  // Optional extra attributes fixed fields ke baad
  dynamicHeaders.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return;
    }

    row[key] =
      attrs?.[key] !== undefined &&
      attrs?.[key] !== null
        ? String(attrs[key])
        : '';
  });

  // Warehouse quantity columns bilkul last mein
  warehouseQtyHeaders.forEach((header) => {
    const warehouseName = header.replace(
      'Warehouse Qty - ',
      '',
    );

    const qty = Number(
      warehouseQtyByName.get(warehouseName) || 0,
    );

    row[header] = qty > 0 ? qty : '';
  });

  return row;
};

/**
 * BullMQ worker entry — streams CSV to uploads/exports without loading full dataset in RAM.
 */
async function runVendorProductExport(exportHistoryId) {
  const exportDoc = await ExportHistory.findById(exportHistoryId);
  if (!exportDoc) {
    throw new Error(`ExportHistory not found: ${exportHistoryId}`);
  }

  const exportsDir = path.join(PROJECT_ROOT, 'uploads', 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });

  const relativePath = path.posix.join('uploads', 'exports', exportDoc.fileName);
  const absolutePath = path.join(exportsDir, exportDoc.fileName);

  await ExportHistory.updateOne(
    { _id: exportDoc._id },
    {
      $set: {
        status: 'processing',
        startedAt: new Date(),
        filePath: relativePath,
        error: '',
      },
    },
  );

  console.log(`[vendor-product-export] started exportId=${exportDoc.exportId}`);

  const match = await buildVendorProductExportMatch(exportDoc.filters || {});
  const productIdDocs = await VendorProduct.find(match).select('_id').lean();
  const productIds = productIdDocs.map((p) => p._id);

  // const [warehouseDocs, dynamicHeaders] = await Promise.all([
  //   Warehouse.find({}, '_id name').sort({ name: 1 }).lean(),
  //   collectExportDynamicHeaders(productIds),
  // ]);
  const [warehouseDocs, collectedDynamicHeaders] =
  await Promise.all([
    Warehouse.find({}, '_id name')
      .sort({ name: 1 })
      .lean(),

    collectExportDynamicHeaders(productIds),
  ]);

const dynamicHeaders = collectedDynamicHeaders.filter(
  (key) =>
    !USED_ATTRIBUTE_KEYS.has(
      String(key).trim().toLowerCase(),
    ),
);

  const warehouseById = new Map(warehouseDocs.map((w) => [String(w._id), w.name || '']));
  const warehouseQtyHeaders = warehouseDocs
    .map((w) => String(w.name || '').trim())
    .filter(Boolean)
    .map((name) => `Warehouse Qty - ${name}`);
  const headers = [...EXPORT_FIXED_HEADERS, ...dynamicHeaders, ...warehouseQtyHeaders];

  const writeStream = fs.createWriteStream(absolutePath, { encoding: 'utf8' });
  writeStream.setMaxListeners(0);
  let streamError = null;
  writeStream.on('error', (err) => {
    streamError = err;
  });

  const writeStreamChunk = (data) =>
    new Promise((resolve, reject) => {
      if (streamError) {
        reject(streamError);
        return;
      }
      if (!writeStream.write(data)) {
        writeStream.once('drain', resolve);
      } else {
        resolve();
      }
    });

  const closeWriteStream = () =>
    new Promise((resolve, reject) => {
      if (streamError) {
        reject(streamError);
        return;
      }
      writeStream.end(() => resolve());
    });
  const productById = new Map();
  const categoryById = new Map();
  const subcategoryById = new Map();
  const subsubcategoryById = new Map();
  let totalRecords = 0;
  let wroteHeader = false;
  let lastProgressAt = 0;

  try {
    if (!productIds.length) {
      await writeStreamChunk(stringify([headers], { quoted: true }));
    } else {
      for (const productIdChunk of chunkArray(productIds, EXPORT_PRODUCT_ID_CHUNK)) {
        let lastSkuId = null;

        while (true) {
          const skuQuery = { productId: { $in: productIdChunk }, isActive: true };
          if (lastSkuId) skuQuery._id = { $gt: lastSkuId };

          const skus = await Sku.find(skuQuery)
            .sort({ _id: 1 })
            .limit(EXPORT_SKU_BATCH_SIZE)
            .select(EXPORT_SKU_SELECT)
            .lean();

          if (!skus.length) break;

          const batchProducts = await ensureProductsInCache(skus, productById);
          if (batchProducts.length) {
            await ensureCategoryMapsForProducts(
              batchProducts,
              categoryById,
              subcategoryById,
              subsubcategoryById,
            );
          }

          const batchSkuIds = skus.map((s) => s._id);
          const invBySku = await loadExportInventoryBySku(batchSkuIds, warehouseById);
          const rowArrays = skus.map((sku) => {
            const row = buildVendorProductExportRow(
              sku,
              productById,
              categoryById,
              subcategoryById,
              subsubcategoryById,
              invBySku,
              warehouseQtyHeaders,
              dynamicHeaders,
            );
            return headers.map((h) => row[h] ?? '');
          });

          if (!wroteHeader) {
            await writeStreamChunk(stringify([headers, ...rowArrays], { quoted: true }));
            wroteHeader = true;
          } else {
            await writeStreamChunk(stringify(rowArrays, { quoted: true }));
          }

          totalRecords += skus.length;
          lastSkuId = skus[skus.length - 1]._id;

          if (totalRecords - lastProgressAt >= EXPORT_PROGRESS_UPDATE_EVERY) {
            lastProgressAt = totalRecords;
            await ExportHistory.updateOne({ _id: exportDoc._id }, { $set: { totalRecords } });
          }
        }
      }

      if (!wroteHeader) {
        await writeStreamChunk(stringify([headers], { quoted: true }));
      }
    }

    await closeWriteStream();

    await ExportHistory.updateOne(
      { _id: exportDoc._id },
      {
        $set: {
          status: 'completed',
          totalRecords,
          completedAt: new Date(),
        },
      },
    );

    console.log(
      `[vendor-product-export] completed exportId=${exportDoc.exportId} records=${totalRecords}`,
    );

    return { exportId: exportDoc.exportId, totalRecords, filePath: relativePath };
  } catch (err) {
    writeStream.destroy();
    if (fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
      } catch (_) {}
    }
    throw err;
  }
}

async function markExportFailed(exportHistoryId, message) {
  await ExportHistory.updateOne(
    { _id: exportHistoryId },
    {
      $set: {
        status: 'failed',
        error: message || 'Export failed',
        completedAt: new Date(),
      },
    },
  );
}

module.exports = {
  runVendorProductExport,
  markExportFailed,
  buildVendorProductExportMatch,
};
