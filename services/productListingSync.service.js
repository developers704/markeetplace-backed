/**
 * Keeps ProductListing in sync with VendorProduct + SKUs + Inventory.
 * Call after VendorProduct/SKU/Inventory changes.
 */

const mongoose = require('mongoose');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const ProductListing = require('../models/productListing.model');
const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model');

const pendingSyncs = new Map();

function scheduleSync(productId) {
  if (!productId) return;

  if (pendingSyncs.has(productId)) return;

  pendingSyncs.set(productId, true);

  setTimeout(async () => {
    try {
      await syncProductListing(productId, false); 
      await incrListingCacheVersion();
    } catch (err) {
      console.error('[ProductListing] debounced sync error', err.message);
    } finally {
      pendingSyncs.delete(productId);
    }
  }, 300); // 300ms window
}


let incrListingCacheVersion = async () => {};
try {
  const redis = require('../config/redis');
  if (redis && redis.incrListingCacheVersion) incrListingCacheVersion = redis.incrListingCacheVersion;
} catch (_) {}

const normalizeKey = (v) => String(v || '').trim().toUpperCase();

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

  const skuIds = skus.map((s) => s._id);
  const invAgg = await SkuInventory.aggregate([
    { $match: { skuId: { $in: skuIds } } },
    { $group: { _id: null, totalQty: { $sum: '$quantity' } } },
  ]);
  const totalInventory = invAgg[0]?.totalQty ?? 0;

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
  rebuildAllProductListings,
  scheduleSync,
};
