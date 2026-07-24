const path = require('path');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const ProductListing = require('../models/productListing.model');
const aiImageSearch = require('../services/aiImageSearch.service');
const { productUploadPublicUrl } = require('../config/uploadPaths');

function readAttr(attrs, key) {
  if (!attrs) return null;
  if (typeof attrs.get === 'function') {
    return attrs.get(key) ?? attrs.get(key.toLowerCase()) ?? null;
  }
  return attrs[key] ?? attrs[key.toLowerCase()] ?? null;
}

function normalizeImageUrl(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('/uploads/')) return s;
  const base = path.basename(s);
  return productUploadPublicUrl(base) || `/uploads/products/${base}`;
}

function displayPrice(...sources) {
  for (const src of sources) {
    if (!src) continue;
    const tag = Number(src.tagPrice);
    if (Number.isFinite(tag) && tag > 0) return tag;
    const price = Number(src.price);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return 0;
}

function skuTitle(skuDoc, listing) {
  const desc =
    readAttr(skuDoc?.attributes, 'descriptionname') ||
    listing?.title ||
    skuDoc?.sku;
  return String(desc || 'Product').trim();
}

function mapWarehouseRows(inventories) {
  return inventories
    .map((inv) => ({
      name: inv?.warehouse?.name || 'Warehouse',
      quantity: Number(inv?.quantity || 0),
      isMain: inv?.warehouse?.isMain === true,
    }))
    .filter((row) => row.quantity > 0)
    .sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
      return b.quantity - a.quantity;
    });
}

/**
 * Enrich AI visual matches with catalog product details + live inventory
 * (same shape support-chat image search uses for cards).
 */
async function enrichSkuItems(items) {
  if (!items?.length) return items || [];

  const skus = [...new Set(items.map((m) => m.sku).filter(Boolean))];
  const skuDocs = await Sku.find({ sku: { $in: skus } })
    .select('sku productId price tagPrice images gallery attributes')
    .lean();
  const skuMap = new Map(skuDocs.map((s) => [String(s.sku), s]));
  const productIds = [...new Set(skuDocs.map((s) => String(s.productId)).filter(Boolean))];
  const listings = await ProductListing.find({ productId: { $in: productIds } })
    .select('productId title totalInventory defaultSku')
    .lean();
  const listingMap = new Map(listings.map((l) => [String(l.productId), l]));

  const skuObjectIds = skuDocs.map((s) => s._id).filter(Boolean);
  const allInvRows = skuObjectIds.length
    ? await SkuInventory.find({ skuId: { $in: skuObjectIds } })
        .populate('warehouse', 'name isMain')
        .lean()
    : [];

  const invBySkuId = new Map();
  for (const row of allInvRows) {
    const key = String(row.skuId);
    if (!invBySkuId.has(key)) invBySkuId.set(key, []);
    invBySkuId.get(key).push(row);
  }

  return items.map((item) => {
    const skuDoc = skuMap.get(String(item.sku));
    const listing = skuDoc ? listingMap.get(String(skuDoc.productId)) : null;
    const invRows = skuDoc?._id ? invBySkuId.get(String(skuDoc._id)) || [] : [];
    const warehouses = mapWarehouseRows(invRows);
    const totalInventory = invRows.reduce((sum, inv) => sum + Number(inv.quantity || 0), 0);

    const imageUrl =
      normalizeImageUrl(item.imageUrl) ||
      (skuDoc?.images?.[0] ? normalizeImageUrl(skuDoc.images[0]) : '') ||
      item.imageUrl;

    return {
      ...item,
      productId: listing
        ? String(listing.productId)
        : skuDoc
          ? String(skuDoc.productId)
          : '',
      title: skuDoc ? skuTitle(skuDoc, listing) : item.nameSuggestion || item.sku,
      nameSuggestion: skuDoc
        ? skuTitle(skuDoc, listing)
        : item.nameSuggestion || `Product ${item.sku}`,
      imageUrl,
      price: displayPrice(skuDoc, listing?.defaultSku),
      totalInventory,
      warehouses,
    };
  });
}

async function enrichMatchesWithProductNames(matches) {
  return enrichSkuItems(matches);
}

async function enrichPickSuggestions(suggestions) {
  return enrichSkuItems(suggestions);
}

exports.analyzeByImage = async (req, res) => {
  try {
    if (!aiImageSearch.isEnabled()) {
      return res.status(503).json({ success: false, message: 'AI image search is disabled' });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const result = await aiImageSearch.analyzeByImage(
      req.file.buffer,
      req.file.originalname,
    );
    return res.json(result);
  } catch (err) {
    const status = err.response?.status || 500;
    const detail = err.response?.data?.detail || err.message || 'Image analysis failed';
    console.error('[ai-image-search/analyze]', detail);
    return res.status(status).json({ success: false, message: detail });
  }
};

exports.searchByImage = async (req, res) => {
  try {
    if (!aiImageSearch.isEnabled()) {
      return res.status(503).json({ success: false, message: 'AI image search is disabled' });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const topK = Math.min(50, Math.max(1, Number(req.query.top_k) || 25));
    const result = await aiImageSearch.searchByImage(
      req.file.buffer,
      req.file.originalname,
      topK,
    );

    const [matches, pickSuggestions] = await Promise.all([
      enrichMatchesWithProductNames(result.matches),
      enrichPickSuggestions(result.pickSuggestions || []),
    ]);
    return res.json({ ...result, matches, pickSuggestions });
  } catch (err) {
    const status = err.response?.status || 500;
    const detail = err.response?.data?.detail || err.message || 'Image search failed';
    console.error('[ai-image-search/search]', detail);
    return res.status(status).json({ success: false, message: detail });
  }
};

exports.getStats = async (req, res) => {
  try {
    const stats = await aiImageSearch.fetchStats();
    const job = aiImageSearch.getIndexJobState();
    return res.json({
      success: true,
      stats,
      indexJob: job,
      imageRoot: aiImageSearch.getProductImagesDir(),
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      message: err.response?.data?.detail || err.message || 'AI service unavailable',
    });
  }
};

exports.getHealth = async (req, res) => {
  try {
    const health = await aiImageSearch.fetchHealth();
    return res.json({ success: true, health });
  } catch (err) {
    return res.status(503).json({ success: false, message: err.message });
  }
};

exports.reloadIndex = async (req, res) => {
  try {
    const data = await aiImageSearch.reloadIndex();
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.runIncrementalSync = async (req, res) => {
  try {
    aiImageSearch.runBuildIndex({ rebuild: false, resume: true }).catch((err) => {
      console.error('[ai-image-search/sync]', err.message);
    });
    return res.status(202).json({
      success: true,
      message: 'Incremental index sync started',
      indexJob: aiImageSearch.getIndexJobState(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.runFullRebuild = async (req, res) => {
  try {
    aiImageSearch.runBuildIndex({ rebuild: true, resume: false }).catch((err) => {
      console.error('[ai-image-search/rebuild]', err.message);
    });
    return res.status(202).json({
      success: true,
      message: 'Full index rebuild started (this may take several minutes)',
      indexJob: aiImageSearch.getIndexJobState(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getIndexJobStatus = async (req, res) => {
  return res.json({
    success: true,
    indexJob: aiImageSearch.getIndexJobState(),
    imageRoot: aiImageSearch.getProductImagesDir(),
    enabled: aiImageSearch.isEnabled(),
  });
};
