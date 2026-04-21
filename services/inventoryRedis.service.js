/**
 * Redis-backed inventory totals for ProductListing (no SkuInventory aggregate in read path).
 * Keys: inventory:sku:{id}, inventory:sku:{id}:main, inventory:product:{id}, inventory:product:{id}:main
 * Rebuild functions use Mongo aggregates here only (workers / hooks), not in productListingSync.
 */

const mongoose = require('mongoose');
const SkuInventory = require('../models/skuInventory.model');
const Sku = require('../models/sku.model');
const Warehouse = require('../models/warehouse.model');
const { getClient } = require('../config/redis');

const TTL_SEC = Number(process.env.INVENTORY_REDIS_TTL_SEC) || 60 * 60 * 24 * 7;
const PRODUCT_REDIS_REBUILD_CONCURRENCY =
  Number(process.env.INVENTORY_PRODUCT_REDIS_REBUILD_CONCURRENCY) || 40;
/** Avoid one giant ioredis pipeline (e.g. 80k+ SKUs × 2 SETs). */
const REDIS_SET_PIPELINE_CHUNK = Number(process.env.INVENTORY_REDIS_SET_PIPELINE_CHUNK) || 3000;

const skuTotalKey = (id) => `inventory:sku:${id}`;
const skuMainKey = (id) => `inventory:sku:${id}:main`;
const productTotalKey = (id) => `inventory:product:${id}`;
const productMainKey = (id) => `inventory:product:${id}:main`;

let mainWarehouseIdsCache = null;
let mainWarehouseIdsCacheAt = 0;
const MAIN_WH_CACHE_MS = 60_000;

async function getMainWarehouseObjectIds() {
  const now = Date.now();
  if (mainWarehouseIdsCache && now - mainWarehouseIdsCacheAt < MAIN_WH_CACHE_MS) {
    return mainWarehouseIdsCache;
  }
  const rows = await Warehouse.find({ isMain: true }).select('_id').lean();
  mainWarehouseIdsCache = rows.map((w) => w._id).filter(Boolean);
  mainWarehouseIdsCacheAt = now;
  return mainWarehouseIdsCache;
}

/**
 * Recompute one SKU's totals from Mongo and write Redis.
 */
async function rebuildSkuInventoryRedis(skuId) {
  const c = getClient();
  if (!c || !mongoose.Types.ObjectId.isValid(skuId)) return;

  const sid = new mongoose.Types.ObjectId(skuId);
  const mainIds = await getMainWarehouseObjectIds();

  const [totAgg, mainAgg] = await Promise.all([
    SkuInventory.aggregate([
      { $match: { skuId: sid } },
      { $group: { _id: null, t: { $sum: '$quantity' } } },
    ]),
    mainIds.length
      ? SkuInventory.aggregate([
          { $match: { skuId: sid, warehouse: { $in: mainIds } } },
          { $group: { _id: null, t: { $sum: '$quantity' } } },
        ])
      : Promise.resolve([]),
  ]);

  const totalQty = totAgg[0]?.t ?? 0;
  const mainQty = mainAgg[0]?.t ?? 0;

  const k = String(skuId);
  await c.set(skuTotalKey(k), String(totalQty), 'EX', TTL_SEC);
  await c.set(skuMainKey(k), String(mainQty), 'EX', TTL_SEC);
}

/**
 * Sum per-SKU Redis keys into product-level keys.
 */
async function rebuildProductInventoryRedis(productId) {
  const c = getClient();
  if (!c || !mongoose.Types.ObjectId.isValid(productId)) return;

  const skus = await Sku.find({ productId }).select('_id').lean();
  let total = 0;
  let main = 0;

  if (skus.length === 0) {
    const pid = String(productId);
    await c.set(productTotalKey(pid), '0', 'EX', TTL_SEC);
    await c.set(productMainKey(pid), '0', 'EX', TTL_SEC);
    return;
  }

  const pipeline = c.pipeline();
  for (const s of skus) {
    const id = String(s._id);
    pipeline.get(skuTotalKey(id));
    pipeline.get(skuMainKey(id));
  }
  const execRes = await pipeline.exec();
  for (let i = 0; i < skus.length; i++) {
    const tr = execRes[i * 2];
    const mr = execRes[i * 2 + 1];
    const tv = Array.isArray(tr) ? tr[1] : tr;
    const mv = Array.isArray(mr) ? mr[1] : mr;
    total += Number(tv ?? 0);
    main += Number(mv ?? 0);
  }

  const pid = String(productId);
  await c.set(productTotalKey(pid), String(total), 'EX', TTL_SEC);
  await c.set(productMainKey(pid), String(main), 'EX', TTL_SEC);
}

/**
 * After inventory bulk changes: refresh all touched SKUs then their products.
 * Uses batched Mongo aggregates + Redis pipeline (not per-SKU sequential queries).
 */
async function rebuildInventoryRedisForSkuIds(skuIds) {
  const uniq = [...new Set((skuIds || []).map(String).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  if (uniq.length === 0) return [];

  const oids = uniq.map((id) => new mongoose.Types.ObjectId(id));
  const mainIds = await getMainWarehouseObjectIds();

  const c = getClient();
  if (c) {
    const [totGroups, mainGroups] = await Promise.all([
      SkuInventory.aggregate([
        { $match: { skuId: { $in: oids } } },
        { $group: { _id: '$skuId', t: { $sum: '$quantity' } } },
      ]),
      mainIds.length
        ? SkuInventory.aggregate([
            { $match: { skuId: { $in: oids }, warehouse: { $in: mainIds } } },
            { $group: { _id: '$skuId', t: { $sum: '$quantity' } } },
          ])
        : Promise.resolve([]),
    ]);

    const totMap = new Map(totGroups.map((g) => [String(g._id), g.t ?? 0]));
    const mainMap = new Map(mainGroups.map((g) => [String(g._id), g.t ?? 0]));

    for (let pi = 0; pi < uniq.length; pi += REDIS_SET_PIPELINE_CHUNK) {
      const slice = uniq.slice(pi, pi + REDIS_SET_PIPELINE_CHUNK);
      const pipe = c.pipeline();
      for (const id of slice) {
        const k = String(id);
        const totalQty = totMap.get(k) ?? 0;
        const mainQty = mainMap.get(k) ?? 0;
        pipe.set(skuTotalKey(k), String(totalQty), 'EX', TTL_SEC);
        pipe.set(skuMainKey(k), String(mainQty), 'EX', TTL_SEC);
      }
      await pipe.exec();
    }
  }

  const productIds = await Sku.distinct('productId', { _id: { $in: oids } });
  const pids = productIds.filter(Boolean);
  const conc = Math.max(1, PRODUCT_REDIS_REBUILD_CONCURRENCY);

  for (let i = 0; i < pids.length; i += conc) {
    const slice = pids.slice(i, i + conc);
    await Promise.all(slice.map((pid) => rebuildProductInventoryRedis(pid)));
  }

  return [...new Set(pids.map(String))];
}

/**
 * Read product totals for ProductListing (no DB aggregate).
 * @returns {null|{ totalInventory: number, mainWarehouseInventory: number }}
 */
async function getProductInventoryFromRedis(productId) {
  const c = getClient();
  if (!c || !mongoose.Types.ObjectId.isValid(productId)) return null;
  const pid = String(productId);
  const t = await c.get(productTotalKey(pid));
  const m = await c.get(productMainKey(pid));
  if (t == null && m == null) return null;
  return {
    totalInventory: Number(t ?? 0),
    mainWarehouseInventory: Number(m ?? 0),
  };
}

/**
 * Ensure Redis has product totals (one-time rebuild from DB for cold cache).
 */
async function ensureProductInventoryRedis(productId) {
  let v = await getProductInventoryFromRedis(productId);
  if (v != null) return v;
  const skus = await Sku.find({ productId }).select('_id').lean();
  const skuIds = skus.map((s) => String(s._id)).filter(Boolean);
  if (skuIds.length) await rebuildInventoryRedisForSkuIds(skuIds);
  else await rebuildProductInventoryRedis(productId);
  v = await getProductInventoryFromRedis(productId);
  return v || { totalInventory: 0, mainWarehouseInventory: 0 };
}

module.exports = {
  rebuildSkuInventoryRedis,
  rebuildProductInventoryRedis,
  rebuildInventoryRedisForSkuIds,
  getProductInventoryFromRedis,
  ensureProductInventoryRedis,
};
