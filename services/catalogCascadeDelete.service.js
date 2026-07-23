/**
 * Cascade-delete v2 catalog data when a category / subcategory / sub-subcategory is removed.
 *
 * Order (children first):
 *   SkuInventory → Sku → ProductListing → VendorProduct
 *
 * Categories themselves stay soft-deleted by the caller.
 */

const mongoose = require('mongoose');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const { getClient } = require('../config/redis');

const BATCH = 500;

const toObjectId = (id) => {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(String(id));
  }
  return null;
};

const uniqObjectIds = (ids) => {
  const map = new Map();
  for (const raw of ids || []) {
    const oid = toObjectId(raw);
    if (oid) map.set(String(oid), oid);
  }
  return [...map.values()];
};

async function deleteInBatches(Model, field, ids) {
  const list = uniqObjectIds(ids);
  let deleted = 0;
  for (let i = 0; i < list.length; i += BATCH) {
    const slice = list.slice(i, i + BATCH);
    const result = await Model.deleteMany({ [field]: { $in: slice } });
    deleted += result.deletedCount || 0;
  }
  return deleted;
}

async function clearInventoryRedisKeys({ skuIds = [], productIds = [] }) {
  const client = getClient();
  if (!client) return;

  const keys = [];
  for (const id of skuIds) {
    const s = String(id);
    keys.push(`inventory:sku:${s}`, `inventory:sku:${s}:main`);
  }
  for (const id of productIds) {
    const p = String(id);
    keys.push(`inventory:product:${p}`, `inventory:product:${p}:main`);
  }

  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    if (slice.length) {
      try {
        await client.del(...slice);
      } catch (err) {
        console.warn('[catalogCascadeDelete] redis clear:', err.message);
      }
    }
  }
}

/**
 * Build a product query that matches Mixed category storage (ObjectId or string).
 */
function buildCategoryProductFilter(categoryIds) {
  const oids = uniqObjectIds(categoryIds);
  if (!oids.length) return null;
  const strings = oids.map(String);
  return {
    $or: [{ category: { $in: oids } }, { category: { $in: strings } }],
  };
}

/**
 * Cascade-delete all VendorProducts matching filter, plus their SKUs / inventories / listings.
 * @param {object} productFilter - Mongo filter for VendorProduct
 * @returns {Promise<{products, skus, inventories, listings}>}
 */
async function cascadeDeleteVendorCatalog(productFilter) {
  const empty = { products: 0, skus: 0, inventories: 0, listings: 0 };
  if (!productFilter || !Object.keys(productFilter).length) return empty;

  const products = await VendorProduct.find(productFilter)
    .select('_id skuIds defaultSku')
    .lean();

  if (!products.length) return empty;

  const productIds = products.map((p) => p._id);

  // Collect SKU ids from product refs + any SKUs still pointing at these products
  const skuIdSet = new Map();
  for (const p of products) {
    for (const sid of p.skuIds || []) {
      const oid = toObjectId(sid);
      if (oid) skuIdSet.set(String(oid), oid);
    }
    const def = toObjectId(p.defaultSku);
    if (def) skuIdSet.set(String(def), def);
  }

  const skusByProduct = await Sku.find({ productId: { $in: productIds } })
    .select('_id')
    .lean();
  for (const s of skusByProduct) {
    skuIdSet.set(String(s._id), s._id);
  }

  const skuIds = [...skuIdSet.values()];

  const inventoriesDeleted = skuIds.length
    ? await deleteInBatches(SkuInventory, 'skuId', skuIds)
    : 0;

  let skusDeleted = 0;
  if (skuIds.length) {
    for (let i = 0; i < skuIds.length; i += BATCH) {
      const slice = skuIds.slice(i, i + BATCH);
      const result = await Sku.deleteMany({ _id: { $in: slice } });
      skusDeleted += result.deletedCount || 0;
    }
  }
  // Safety: remove any leftover SKUs still linked by productId
  const leftoverSkus = await Sku.deleteMany({ productId: { $in: productIds } });
  skusDeleted += leftoverSkus.deletedCount || 0;

  let listingsDeleted = 0;
  try {
    const ProductListing = require('../models/productListing.model');
    const listingResult = await ProductListing.deleteMany({
      productId: { $in: productIds },
    });
    listingsDeleted = listingResult.deletedCount || 0;
  } catch (err) {
    console.warn('[catalogCascadeDelete] ProductListing:', err.message);
  }

  let productsDeleted = 0;
  for (let i = 0; i < productIds.length; i += BATCH) {
    const slice = productIds.slice(i, i + BATCH);
    const result = await VendorProduct.deleteMany({ _id: { $in: slice } });
    productsDeleted += result.deletedCount || 0;
  }

  await clearInventoryRedisKeys({ skuIds, productIds });

  return {
    products: productsDeleted,
    skus: skusDeleted,
    inventories: inventoriesDeleted,
    listings: listingsDeleted,
  };
}

async function cascadeDeleteByCategoryIds(categoryIds) {
  const filter = buildCategoryProductFilter(categoryIds);
  if (!filter) return { products: 0, skus: 0, inventories: 0, listings: 0 };
  return cascadeDeleteVendorCatalog(filter);
}

async function cascadeDeleteBySubcategoryIds(subcategoryIds, subSubCategoryIds = []) {
  const subIds = uniqObjectIds(subcategoryIds);
  const subSubIds = uniqObjectIds(subSubCategoryIds);
  const or = [];
  if (subIds.length) or.push({ subcategory: { $in: subIds } });
  if (subSubIds.length) or.push({ subsubcategory: { $in: subSubIds } });
  if (!or.length) return { products: 0, skus: 0, inventories: 0, listings: 0 };
  return cascadeDeleteVendorCatalog(or.length === 1 ? or[0] : { $or: or });
}

async function cascadeDeleteBySubSubCategoryIds(subSubCategoryIds) {
  const ids = uniqObjectIds(subSubCategoryIds);
  if (!ids.length) return { products: 0, skus: 0, inventories: 0, listings: 0 };
  return cascadeDeleteVendorCatalog({ subsubcategory: { $in: ids } });
}

/**
 * When deleting a parent category: products linked by category OR by any child subcategory tree.
 */
async function cascadeDeleteForCategoryTree({
  categoryIds,
  subcategoryIds = [],
  subSubCategoryIds = [],
}) {
  const catFilter = buildCategoryProductFilter(categoryIds);
  const subIds = uniqObjectIds(subcategoryIds);
  const subSubIds = uniqObjectIds(subSubCategoryIds);

  const or = [];
  if (catFilter) or.push(...catFilter.$or);
  if (subIds.length) or.push({ subcategory: { $in: subIds } });
  if (subSubIds.length) or.push({ subsubcategory: { $in: subSubIds } });

  if (!or.length) return { products: 0, skus: 0, inventories: 0, listings: 0 };
  return cascadeDeleteVendorCatalog({ $or: or });
}

module.exports = {
  cascadeDeleteVendorCatalog,
  cascadeDeleteByCategoryIds,
  cascadeDeleteBySubcategoryIds,
  cascadeDeleteBySubSubCategoryIds,
  cascadeDeleteForCategoryTree,
};
