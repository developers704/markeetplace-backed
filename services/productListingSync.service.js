/**
 * Keeps ProductListing in sync with VendorProduct + SKUs + Inventory.
 * Call after VendorProduct/SKU/Inventory changes.
 */

const mongoose = require('mongoose');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const ProductListing = require('../models/productListing.model');
const { getProductInventoryFromRedis, ensureProductInventoryRedis } = require('./inventoryRedis.service');
const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model');

/** Debounced enqueue to BullMQ worker (event-driven; not on request thread). */
const pendingListingProductIds = new Set();
let listingFlushTimer = null;
const LISTING_DEBOUNCE_MS = Number(process.env.PRODUCT_LISTING_SYNC_DEBOUNCE_MS) || 600;

function flushPendingListingSyncs() {
  listingFlushTimer = null;
  if (pendingListingProductIds.size === 0) return;
  const ids = [...pendingListingProductIds];
  pendingListingProductIds.clear();
  try {
    const { enqueueProductListingSync } = require('../queues/productListingSync.queue');
    enqueueProductListingSync(ids).catch((err) =>
      console.error('[ProductListing] enqueue error', err.message)
    );
  } catch (err) {
    console.error('[ProductListing] enqueue error', err.message);
  }
}

function scheduleSync(productId) {
  if (!productId) return;
  pendingListingProductIds.add(String(productId));
  if (listingFlushTimer) clearTimeout(listingFlushTimer);
  listingFlushTimer = setTimeout(flushPendingListingSyncs, LISTING_DEBOUNCE_MS);
}


let incrListingCacheVersion = async () => {};
try {
  const redis = require('../config/redis');
  if (redis && redis.incrListingCacheVersion) incrListingCacheVersion = redis.incrListingCacheVersion;
} catch (_) {}

const normalizeKey = (v) => String(v || '').trim().toUpperCase();
const isDebugEnabled = String(process.env.PRODUCT_LISTING_DEBUG || '').toLowerCase() === 'true';

const toObjectIdArray = (values = []) =>
  values
    .map((v) => {
      if (!v) return null;
      if (v instanceof mongoose.Types.ObjectId) return v;
      if (mongoose.Types.ObjectId.isValid(v)) return new mongoose.Types.ObjectId(v);
      return null;
    })
    .filter(Boolean);

async function syncProductListing(productId, bumpCacheVersion = true) {
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) return;

  const vp = await VendorProduct.findById(productId).lean();
  if (!vp) {
    await ProductListing.deleteOne({ productId });
    if (bumpCacheVersion) await incrListingCacheVersion();
    return;
  }

  const skus = await Sku.find({ productId }).lean();
  if (skus.length === 0) {
    await ProductListing.deleteOne({ productId });
    if (bumpCacheVersion) await incrListingCacheVersion();
    return;
  }
  const allSkuDescriptionNames = skus
  .map((s) => {
    if (s?.attributes instanceof Map) {
      return s.attributes.get('descriptionname');
    }
    return s?.attributes?.descriptionname;
  })
  .filter(Boolean)
  .join(' ');

  // Collect all SKU codes (optional but recommended)
  const allSkuCodes = skus
  .map((s) => s?.sku)
  .filter(Boolean)
  .join(' ');

  const skuIds = toObjectIdArray(skus.map((s) => s._id));

  let totalInventory = 0;
  let mainWarehouseInventory = 0;
  const invRedis = await getProductInventoryFromRedis(productId);
  if (invRedis) {
    totalInventory = invRedis.totalInventory;
    mainWarehouseInventory = invRedis.mainWarehouseInventory;
  } else {
    const rebuilt = await ensureProductInventoryRedis(productId);
    totalInventory = rebuilt.totalInventory;
    mainWarehouseInventory = rebuilt.mainWarehouseInventory;
  }

  if (isDebugEnabled) {
    console.log('[ProductListing][debug] matching skuIds:', skuIds.map(String));
    console.log('[ProductListing][debug] inventory from Redis:', { totalInventory, mainWarehouseInventory });
  }

  const prices = skus.map((s) => s.price).filter((n) => typeof n === 'number');
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  const defaultSkuId = vp.defaultSku;
  // const defaultSkuDoc = skus.find((s) => s._id.equals(defaultSkuId)) || skus[0];
  const defaultSkuDoc =
  skus.find((s) => defaultSkuId && s._id.equals(defaultSkuId)) || skus[0];

  if (!defaultSkuDoc) {
    await ProductListing.deleteOne({ productId });
    return;
  }

  const metalColorKeys = [...new Set(skus.map((s) => normalizeKey(s.metalColor)).filter(Boolean))];
  const metalTypeKeys = [...new Set(skus.map((s) => normalizeKey(s.metalType)).filter(Boolean))];
  const sizeKeys = [...new Set(skus.map((s) => normalizeKey(s.size)).filter(Boolean))];

  let categoryDoc = null;
  let subcategoryDoc = null;
  let subsubcategoryDoc = null;
  const catId = vp.category && vp.category._id ? vp.category._id : vp.category;
  if (catId && mongoose.Types.ObjectId.isValid(catId)) {
    categoryDoc = await Category.findById(catId).lean();
  }
  if (vp.subcategory) {
    subcategoryDoc = await SubCategory.findById(vp.subcategory).lean();
  }
  if (vp.subsubcategory) {
    subsubcategoryDoc = await SubSubCategory.findById(vp.subsubcategory).lean();
  }

  // const searchText = [vp.title, vp.brand, vp.vendorModel].filter(Boolean).join(' ');
  const searchText = [
  vp.title,
  vp.brand,
  vp.vendorModel,
  allSkuDescriptionNames,   // 👈 SKU description search
  allSkuCodes               // 👈 SKU code search
]
  .filter(Boolean)
  .join(' ');

  const existingListing = await ProductListing.findOne({ productId }).lean();
  const listing = {
    productId: vp._id,
    vendorModel: vp.vendorModel || '',
    vendorModelKey: normalizeKey(vp.vendorModel),
    title: vp.title || '',
    brand: vp.brand || '',
    brandKey: vp.brandKey || normalizeKey(vp.brand),
    description: vp.description || '',
    categoryId: categoryDoc?._id ?? catId ?? null,
    categoryDoc: categoryDoc ? { _id: categoryDoc._id, name: categoryDoc.name, description: categoryDoc.description, image: categoryDoc.image } : null,
    subcategoryId: vp.subcategory ?? null,
    subcategoryDoc: subcategoryDoc ? { _id: subcategoryDoc._id, name: subcategoryDoc.name, description: subcategoryDoc.description, image: subcategoryDoc.image } : null,
    subsubcategoryId: vp.subsubcategory ?? null,
    subsubcategoryDoc: subsubcategoryDoc ? { _id: subsubcategoryDoc._id, name: subsubcategoryDoc.name, description: subsubcategoryDoc.description, image: subsubcategoryDoc.image } : null,
    minPrice,
    maxPrice,
    mainWarehouseInventory,
    totalInventory,
    skuCount: skus.length,
    defaultSku: {
    _id: defaultSkuDoc._id,
    sku: defaultSkuDoc.sku,
    price: defaultSkuDoc.price,
    currency: defaultSkuDoc.currency || 'USD',
    // images: defaultSkuDoc.images || [],
    // gallery: defaultSkuDoc.gallery || [],
    metalColor: defaultSkuDoc.metalColor,
    metalType: defaultSkuDoc.metalType,
    size: defaultSkuDoc.size,
    attributes:
    defaultSkuDoc?.attributes instanceof Map
    ? Object.fromEntries(defaultSkuDoc.attributes)
    : (defaultSkuDoc?.attributes || {}),
  // attributes: defaultSkuDoc.attributes && typeof defaultSkuDoc.attributes === 'object' && !Array.isArray(defaultSkuDoc.attributes)
  //   ? Object.fromEntries(Object.entries(defaultSkuDoc.attributes))
  //   : defaultSkuDoc.attributes || {},
},

    metalColorKeys,
    metalTypeKeys,
    sizeKeys,
    searchText,
    createdAt: existingListing?.createdAt || vp.createdAt || new Date(),
    updatedAt: new Date(),
  };

  await ProductListing.updateOne(
    { productId },
    { $set: listing },
    { upsert: true }
  );

  if (bumpCacheVersion) await incrListingCacheVersion();
}

async function syncProductListings(productIds) {
  for (const id of productIds) {
    await syncProductListing(id, false);
  }
  await incrListingCacheVersion();
}

/**
 * Parallel ProductListing sync (one Redis INCR at end). Used by bulk import worker.
 */
async function syncProductListingsInChunks(productIds, concurrency = 80) {
  const ids = (productIds || []).filter(Boolean);
  for (let i = 0; i < ids.length; i += concurrency) {
    const slice = ids.slice(i, i + concurrency);
    await Promise.all(slice.map((id) => syncProductListing(id, false)));
  }
  if (ids.length > 0) await incrListingCacheVersion();
}

async function rebuildAllProductListings(batchSize = 500) {
  const ids = await VendorProduct.find({}).distinct('_id');
  // for (let i = 0; i < ids.length; i += batchSize) {
  //   const batch = ids.slice(i, i + batchSize);
  //   await syncProductListings(batch);
  // }
  for (let i = 0; i < ids.length; i += batchSize) {
  const batch = ids.slice(i, i + batchSize);
  await Promise.all(batch.map((id) => syncProductListing(id, false)));
  }
  await incrListingCacheVersion();


}

module.exports = {
  syncProductListing,
  syncProductListings,
  syncProductListingsInChunks,
  rebuildAllProductListings,
  scheduleSync,
};
