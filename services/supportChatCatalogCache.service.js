/**
 * In-memory + Redis catalog cache for support-chat product search.
 * Rebuilds every 10 minutes (and on server start) from ProductListing + Sku.
 */
const zlib = require('zlib');
const { promisify } = require('util');
const path = require('path');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const supportChatTaxonomy = require('./supportChatTaxonomy.service');
const { getClient } = require('../config/redis');
const { productUploadPublicUrl } = require('../config/uploadPaths');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const REDIS_ITEMS_KEY = 'supportchat:catalog:v5:items:gzip';
const REDIS_META_KEY = 'supportchat:catalog:v5:meta';
const REDIS_TAXONOMY_KEY = 'supportchat:catalog:v5:taxonomy';

const SKU_ATTR_KEYS = [
  'descriptionname',
  'stonetype',
  'centerstone',
  'sidestone',
  'sidecarat',
  'sideshape',
  'sidecolor',
  'sideclarity',
  'centerclarity',
  'centershape',
  'centercarat',
  'vendor',
  'cpprice',
  'avgweight',
  'modelno',
];
const REFRESH_MS = Number(process.env.SUPPORT_CHAT_CATALOG_REFRESH_MS) || 10 * 60 * 1000;

const TYPE_MATCHERS = {
  ring: /(?<![ea])\brings?\b/i,
  chain: /\bchains?\b/i,
  necklace: /\b(?:necklaces?|chains?)\b/i,
  earring: /\bearrings?\b/i,
  bracelet: /\b(?:bracelets?|bangles?)\b/i,
  watch: /\bwatches?\b/i,
  pendant: /\bpendants?\b/i,
  diamond: /\bdiamonds?\b/i,
  band: /\bbands?\b/i,
};

const TYPE_ALIASES = {
  rings: 'ring',
  chains: 'chain',
  necklaces: 'necklace',
  earrings: 'earring',
  bracelets: 'bracelet',
  watches: 'watch',
  pendants: 'pendant',
  diamonds: 'diamond',
  bands: 'band',
};

const KEYWORD_TYPO_FIX = {
  diomands: 'diamond',
  diomand: 'diamond',
  dimonds: 'diamond',
  dimond: 'diamond',
  diamons: 'diamond',
  diamon: 'diamond',
  jewlery: 'jewelry',
  jewellry: 'jewelry',
  neckless: 'necklace',
  braclet: 'bracelet',
  earing: 'earring',
  labrown: 'labgrown',
  labrow: 'labgrown',
  brithstone: 'birthstone',
  birthston: 'birthstone',
  jewelery: 'jewelry',
  jewellery: 'jewelry',
};

const IGNORE_SEARCH_KEYWORDS = new Set([
  'hi', 'hello', 'hey', 'who', 'what', 'when', 'where', 'why', 'how', 'your', 'you', 'me', 'my',
  'founder', 'owner', 'name', 'make', 'made', 'answer', 'warehouse', 'warehouses', 'all', 'some',
  'many', 'category', 'quantity', 'available', 'show', 'sku', 'products', 'product', 'items',
  'please', 'the', 'and', 'or', 'is', 'are', 'was', 'have', 'has', 'can', 'could', 'would',
]);

const MIN_RELEVANCE_SCORE = 20;

function normalizeKeyword(kw) {
  const key = String(kw || '').toLowerCase().trim();
  return KEYWORD_TYPO_FIX[key] || key;
}

let memoryCatalog = [];
let memoryMeta = { count: 0, updatedAt: null, version: 0 };
let refreshTimer = null;
let rebuilding = false;

function readAttr(attrs, key) {
  if (!attrs) return '';
  if (typeof attrs.get === 'function') {
    return String(attrs.get(key) ?? attrs.get(key.toLowerCase()) ?? '').trim();
  }
  return String(attrs[key] ?? attrs[key.toLowerCase()] ?? '').trim();
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

function buildSkuImage(skuDoc) {
  if (!skuDoc) return '';
  const candidates = [];
  const feat = readAttr(skuDoc.attributes, 'featureimageslink');
  const galleryLink = readAttr(skuDoc.attributes, 'galleryimagelink');
  if (feat) candidates.push(feat);
  if (galleryLink) candidates.push(galleryLink);
  if (Array.isArray(skuDoc.images)) candidates.push(...skuDoc.images);
  if (Array.isArray(skuDoc.gallery)) candidates.push(...skuDoc.gallery);
  for (const raw of candidates) {
    const url = normalizeImageUrl(raw);
    if (url) return url;
  }
  return '';
}

function flattenAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object') return {};
  if (typeof attrs.get === 'function') {
    return Object.fromEntries(attrs.entries());
  }
  return { ...attrs };
}

function buildSearchBlob(parts) {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSkuAttributeBlob(attrs, skuDoc) {
  const parts = [];
  for (const key of SKU_ATTR_KEYS) {
    const val = readAttr(attrs, key);
    if (val) parts.push(val, `${key} ${val}`);
  }
  for (const [key, val] of Object.entries(attrs || {})) {
    const s = String(val || '').trim();
    if (s) parts.push(s, `${key} ${s}`);
  }
  if (skuDoc?.metalType) parts.push(skuDoc.metalType);
  if (skuDoc?.metalColor) parts.push(skuDoc.metalColor);
  if (skuDoc?.size) parts.push(skuDoc.size);
  if (skuDoc?.sku) parts.push(skuDoc.sku);
  return buildSearchBlob(parts);
}

function buildSkuVariant(skuDoc, inventory) {
  const attrs = flattenAttributes(skuDoc?.attributes);
  const descriptionName = readAttr(attrs, 'descriptionname') || '';
  return {
    skuId: String(skuDoc._id),
    sku: skuDoc.sku || '',
    descriptionName,
    attributes: attrs,
    attributeBlob: buildSkuAttributeBlob(attrs, skuDoc),
    price: Number(skuDoc.price || 0),
    tagPrice: Number(skuDoc.tagPrice || 0),
    imageUrl: buildSkuImage(skuDoc),
    metalType: skuDoc.metalType || '',
    metalColor: skuDoc.metalColor || '',
    size: skuDoc.size || '',
    inventory: Number(inventory || 0),
  };
}

function pickPrimaryDescription(skuVariants) {
  const counts = new Map();
  for (const v of skuVariants) {
    const d = String(v.descriptionName || '').trim();
    if (!d) continue;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [desc, count] of counts) {
    if (count > bestCount) {
      best = desc;
      bestCount = count;
    }
  }
  return best;
}

function pickBestSkuVariant(skuVariants, keywords) {
  if (!skuVariants?.length) return null;
  if (!keywords.length) {
    return [...skuVariants].sort((a, b) => b.inventory - a.inventory || a.price - b.price)[0];
  }

  let best = skuVariants[0];
  let bestScore = -1;
  for (const variant of skuVariants) {
    let score = 0;
    const desc = variant.descriptionName.toLowerCase();
    const blob = variant.attributeBlob;
    for (const kw of keywords) {
      if (desc.includes(kw)) score += 40;
      if (blob.includes(kw)) score += 20;
      for (const key of SKU_ATTR_KEYS) {
        const val = String(variant.attributes[key] || '').toLowerCase();
        if (val && val.includes(kw)) score += 15;
      }
    }
    score += variant.inventory * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = variant;
    }
  }
  return best;
}

function vendorProductToCacheItem(vp, inStockSkuRows, catMap, subMap) {
  const skuVariants = inStockSkuRows.map((row) => buildSkuVariant(row.skuDoc, row.quantity));
  if (!skuVariants.length) return null;

  const defaultSku =
    skuVariants.find((v) => String(v.skuId) === String(vp.defaultSku)) || skuVariants[0];
  const descriptionName =
    pickPrimaryDescription(skuVariants) || defaultSku.descriptionName || vp.title || vp.vendorModel;
  const descriptionNames = [...new Set(skuVariants.map((v) => v.descriptionName).filter(Boolean))];
  const descriptionBlob = buildSearchBlob(descriptionNames);
  const attributeBlob = buildSearchBlob(skuVariants.map((v) => v.attributeBlob));

  const sub = subMap.get(String(vp.subcategory || ''));
  const categoryId = String(sub?.parentCategoryId || vp.category || '');
  const cat = catMap.get(categoryId);
  const subcategoryName = sub?.name || '';
  const categoryName = cat?.name || '';

  const productType =
    supportChatTaxonomy.deriveProductTypeFromLabel(descriptionName) ||
    supportChatTaxonomy.deriveProductTypeFromLabel(subcategoryName) ||
    supportChatTaxonomy.deriveProductTypeFromLabel(vp.title) ||
    supportChatTaxonomy.deriveProductTypeFromLabel(categoryName);

  const totalInventory = skuVariants.reduce((sum, v) => sum + v.inventory, 0);
  const prices = skuVariants.map((v) => v.price).filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;

  const searchBlob = buildSearchBlob([
    descriptionBlob,
    attributeBlob,
    vp.title,
    vp.vendorModel,
    vp.brand,
    subcategoryName,
    categoryName,
    productType,
    ...skuVariants.map((v) => v.sku),
  ]);

  return {
    productId: String(vp._id),
    sku: defaultSku.sku,
    title: descriptionName || subcategoryName || vp.title || 'Product',
    imageUrl: defaultSku.imageUrl,
    price: defaultSku.price || minPrice,
    tagPrice: defaultSku.tagPrice,
    totalInventory,
    minPrice,
    vendorModel: vp.vendorModel || '',
    brand: vp.brand || '',
    brandKey: String(vp.brand || '').trim().toUpperCase(),
    categoryId,
    subcategoryId: String(vp.subcategory || ''),
    subsubcategoryId: String(vp.subsubcategory || ''),
    subcategoryName,
    categoryName,
    subsubcategoryName: '',
    descriptionName,
    descriptionNames,
    descriptionBlob,
    attributeBlob,
    skuVariants,
    skuCount: skuVariants.length,
    productType,
    metalType: defaultSku.metalType,
    metalColor: defaultSku.metalColor,
    size: defaultSku.size,
    attributes: defaultSku.attributes,
    searchBlob,
  };
}

async function fetchInStockProductsWithSkus() {
  return SkuInventory.aggregate([
    { $match: { quantity: { $gt: 0 } } },
    {
      $group: {
        _id: '$skuId',
        quantity: { $sum: '$quantity' },
      },
    },
    {
      $lookup: {
        from: 'skus',
        localField: '_id',
        foreignField: '_id',
        as: 'skuDoc',
      },
    },
    { $unwind: '$skuDoc' },
    {
      $group: {
        _id: '$skuDoc.productId',
        totalInventory: { $sum: '$quantity' },
        skus: {
          $push: {
            quantity: '$quantity',
            skuDoc: '$skuDoc',
          },
        },
      },
    },
    { $match: { totalInventory: { $gt: 0 } } },
  ]);
}

async function rebuildCatalogCache() {
  if (rebuilding) return memoryMeta;
  rebuilding = true;
  const started = Date.now();

  try {
    await supportChatTaxonomy.loadTaxonomyFromDb([]);
    const taxonomy = supportChatTaxonomy.getTaxonomy();
    const catMap = new Map(taxonomy.categories.map((c) => [c._id, c]));
    const subMap = new Map(taxonomy.subcategories.map((s) => [s._id, s]));

    const productRows = await fetchInStockProductsWithSkus();
    const items = [];
    const chunkSize = 400;

    for (let i = 0; i < productRows.length; i += chunkSize) {
      const chunk = productRows.slice(i, i + chunkSize);
      const productIds = chunk.map((r) => r._id);
      const vendorProducts = await VendorProduct.find({ _id: { $in: productIds } }).lean();
      const vpMap = new Map(vendorProducts.map((vp) => [String(vp._id), vp]));

      for (const row of chunk) {
        const vp = vpMap.get(String(row._id));
        if (!vp) continue;
        const item = vendorProductToCacheItem(vp, row.skus, catMap, subMap);
        if (item) items.push(item);
      }
    }

    const brands = [...new Set(items.map((item) => item.brand).filter(Boolean))];
    await supportChatTaxonomy.loadTaxonomyFromDb(brands);

    memoryCatalog = items;
    const earringCount = items.filter((i) => itemLooksLikeEarring(i)).length;
    const ringCount = items.filter((i) => itemLooksLikeRing(i)).length;

    memoryMeta = {
      count: items.length,
      earringCount,
      ringCount,
      updatedAt: new Date().toISOString(),
      version: (memoryMeta.version || 0) + 1,
      buildMs: Date.now() - started,
    };

    const redis = getClient();
    if (redis) {
      const compressed = await gzip(JSON.stringify(items));
      await redis.set(REDIS_ITEMS_KEY, compressed);
      await redis.set(REDIS_META_KEY, JSON.stringify(memoryMeta));
      await redis.set(REDIS_TAXONOMY_KEY, JSON.stringify(supportChatTaxonomy.getTaxonomy()));
    }

    console.log(
      `[support-chat-catalog] rebuilt ${items.length} in-stock products (${earringCount} earrings, ${ringCount} rings) in ${Date.now() - started}ms`,
    );
    return memoryMeta;
  } catch (err) {
    console.error('[support-chat-catalog] rebuild failed:', err.message);
    throw err;
  } finally {
    rebuilding = false;
  }
}

async function loadCatalogFromRedis() {
  const redis = getClient();
  if (!redis) return false;

  try {
    const [compressed, metaRaw, taxRaw] = await Promise.all([
      redis.getBuffer(REDIS_ITEMS_KEY),
      redis.get(REDIS_META_KEY),
      redis.get(REDIS_TAXONOMY_KEY),
    ]);
    if (!compressed || !metaRaw) return false;

    const json = await gunzip(compressed);
    memoryCatalog = JSON.parse(json.toString('utf8'));
    memoryMeta = JSON.parse(metaRaw);
    if (taxRaw) {
      try {
        supportChatTaxonomy.loadTaxonomyFromPayload(JSON.parse(taxRaw));
      } catch (_) {
        /* rebuild will refresh taxonomy */
      }
    }
    console.log(`[support-chat-catalog] loaded ${memoryCatalog.length} products from Redis`);
    return true;
  } catch (err) {
    console.warn('[support-chat-catalog] Redis load failed:', err.message);
    return false;
  }
}

function normalizeType(type) {
  const key = String(type || '').toLowerCase().trim();
  return TYPE_ALIASES[key] || key;
}

function matchesProductType(item, type) {
  const normalized = normalizeType(type);
  const rx = TYPE_MATCHERS[normalized];
  if (!rx) return true;

  const text = `${itemDescriptionText(item)} ${item.subcategoryName} ${item.searchBlob}`;
  if (!rx.test(text)) return false;

  if (
    normalized === 'ring' &&
    (/\bearrings?\b/i.test(text) || /\bstuds?\b/i.test(text)) &&
    !/(?<![ea])\brings?\b/i.test(text)
  ) {
    return false;
  }
  if (normalized === 'chain' && /\bearrings?\b/i.test(text) && !/\bchains?\b/i.test(text)) {
    return false;
  }
  return true;
}

function itemDescriptionText(item) {
  return buildSearchBlob([
    item.descriptionBlob,
    item.descriptionName,
    ...(item.descriptionNames || []),
    ...(item.skuVariants || []).map((v) => v.descriptionName),
  ]);
}

function itemLooksLikeEarring(item) {
  const text = `${itemDescriptionText(item)} ${item.subcategoryName} ${item.title} ${item.vendorModel}`;
  return (
    item.productType === 'earring' ||
    /\bearrings?\b/i.test(text) ||
    /\bhoops?\b/i.test(text) ||
    /\bstuds?\b/i.test(text)
  );
}

function itemLooksLikeRing(item) {
  const text = `${itemDescriptionText(item)} ${item.subcategoryName} ${item.title} ${item.vendorModel}`;
  if (/\bearrings?\b/i.test(text) || /\bstuds?\b/i.test(text)) return false;
  return (
    item.productType === 'ring' ||
    supportChatTaxonomy.queryHasRingTerm(text) ||
    supportChatTaxonomy.queryHasRingTerm(item.searchBlob)
  );
}

function passesTaxonomyFilters(item, params) {
  const explicit = params.explicitSubcategoryFilter === true;
  const types = (params.productTypes || []).map(normalizeType).filter(Boolean);

  if (params.brandHints?.length) {
    const brandUpper = String(item.brandKey || item.brand || '').toUpperCase();
    const hit = params.brandHints.some((b) => brandUpper.includes(String(b).toUpperCase()));
    if (!hit) return false;
  }

  if (explicit && params.subcategoryIds?.length) {
    if (!params.subcategoryIds.includes(String(item.subcategoryId))) return false;
  }

  if (explicit && params.categoryIds?.length) {
    if (!params.categoryIds.includes(String(item.categoryId))) return false;
  }

  if (types.includes('earring') && !types.includes('ring')) {
    if (!itemLooksLikeEarring(item)) return false;
  }

  if (types.includes('ring') && !types.includes('earring')) {
    if (!itemLooksLikeRing(item)) return false;
  }

  if (types.includes('earring') && types.includes('ring')) {
    if (!itemLooksLikeEarring(item) && !itemLooksLikeRing(item)) return false;
  }

  for (const type of types) {
    if (type === 'earring' || type === 'ring') continue;
    if (!matchesProductType(item, type)) return false;
  }

  return true;
}

function scoreLiteralDescriptionItem(item, tokens) {
  if (!tokens.length) return { score: -1, displaySku: null };

  const texts = [
    item.descriptionBlob,
    item.descriptionName,
    ...(item.descriptionNames || []),
    ...(item.skuVariants || []).map((v) => v.descriptionName),
    item.attributeBlob,
  ]
    .map((t) => supportChatTaxonomy.normalizeText(t))
    .filter(Boolean);

  let bestScore = -1;
  let bestSku = pickBestSkuVariant(item.skuVariants, tokens);

  for (const text of texts) {
    const matched = tokens.filter((t) => text.includes(t));
    if (!matched.length) continue;

    const ratio = matched.length / tokens.length;
    let score = Math.round(ratio * 90);
    if (matched.length === tokens.length) score += 120;

    const compact = tokens.join(' ');
    if (text.includes(compact)) score += 80;

    if (tokens.length >= 3 && ratio >= 0.75) score += 40;
    bestScore = Math.max(bestScore, score);
  }

  if (bestScore < 0) return { score: -1, displaySku: null };
  return { score: bestScore, displaySku: bestSku };
}

function scoreCatalogItem(item, params) {
  if (params.literalDescriptionSearch) {
    const tokens = [
      ...new Set([
        ...(params.searchKeywords || []),
        ...supportChatTaxonomy.extractLiteralSearchTokens(params.rawSearchPhrase || params.displayQuery || ''),
      ]),
    ]
      .map((k) => normalizeKeyword(k))
      .filter((k) => k.length >= 2 && !IGNORE_SEARCH_KEYWORDS.has(k));

    const literal = scoreLiteralDescriptionItem(item, tokens);
    if (literal.score < MIN_RELEVANCE_SCORE) return { score: -1, displaySku: null };

    const matchedCount = tokens.filter((t) => itemDescriptionText(item).includes(t)).length;
    if (tokens.length >= 3 && matchedCount < Math.ceil(tokens.length * 0.6)) {
      return { score: -1, displaySku: null };
    }

    return literal;
  }

  if (!passesTaxonomyFilters(item, params)) return { score: -1, displaySku: null };

  const keywords = [
    ...new Set([
      ...(params.searchKeywords || []),
      ...(params.metalHints || []),
      ...(params.stoneHints || []),
    ]
      .map((k) => normalizeKeyword(k))
      .filter((k) => k.length >= 2 && !IGNORE_SEARCH_KEYWORDS.has(k))),
  ];

  const productTypes = (params.productTypes || []).map(normalizeType).filter(Boolean);
  const hasTaxonomyFilter =
    (params.subcategoryIds?.length || 0) > 0 ||
    (params.categoryIds?.length || 0) > 0 ||
    (params.brandHints?.length || 0) > 0;

  if (!keywords.length && !productTypes.length && !hasTaxonomyFilter) {
    return { score: 0, displaySku: null };
  }

  let score = productTypes.length ? 35 : hasTaxonomyFilter ? 25 : 0;

  const descText = itemDescriptionText(item);
  const attrText = item.attributeBlob || '';
  const blob = item.searchBlob;

  if (params.subcategoryIds?.length && params.subcategoryIds.includes(String(item.subcategoryId))) {
    score += 60;
  }
  if (params.categoryIds?.length && params.categoryIds.includes(String(item.categoryId))) {
    score += 35;
  }
  if (params.brandHints?.length) score += 25;

  for (const type of productTypes) {
    if (item.productType === type) score += 30;
    if (type === 'earring' && itemLooksLikeEarring(item)) score += 25;
    if (type === 'ring' && itemLooksLikeRing(item)) score += 25;
    const rx = TYPE_MATCHERS[type];
    if (rx && rx.test(descText)) score += 20;
  }

  for (const kw of keywords) {
    if (supportChatTaxonomy.queryHasRingTerm(kw) && item.productType === 'earring') continue;

    if (descText.includes(kw)) {
      score += 50;
      const wordRx = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (wordRx.test(item.descriptionName || '')) score += 30;
      if (wordRx.test(descText)) score += 15;
    }

    if (attrText.includes(kw)) score += 18;

    if (blob.includes(kw)) score += 8;
    if (item.subcategoryName.toLowerCase().includes(kw)) score += 12;
    if (item.categoryName.toLowerCase().includes(kw)) score += 10;
    if (String(item.brand || '').toLowerCase().includes(kw)) score += 20;
  }

  if (keywords.length >= 2 && keywords.every((kw) => descText.includes(kw))) {
    score += 35;
  }

  const displaySku = pickBestSkuVariant(item.skuVariants, keywords);
  if (displaySku && keywords.length) score += 10;

  return { score, displaySku };
}

function sortScoredItems(items, sortBy) {
  if (sortBy === 'price_asc') {
    return items.sort((a, b) => a.price - b.price || b.score - a.score);
  }
  if (sortBy === 'price_desc') {
    return items.sort((a, b) => b.price - a.price || b.score - a.score);
  }
  if (sortBy === 'inventory_desc') {
    return items.sort((a, b) => b.totalInventory - a.totalInventory || b.score - a.score);
  }
  return items.sort((a, b) => b.score - a.score || b.totalInventory - a.totalInventory);
}

function collectScoredCatalog(params) {
  if (!memoryCatalog.length) return [];

  const scoreAll = (searchParams) => {
    const scored = [];
    for (const item of memoryCatalog) {
      const result = scoreCatalogItem(item, searchParams);
      if (result.score >= MIN_RELEVANCE_SCORE) {
        scored.push({ ...item, score: result.score, _displaySku: result.displaySku });
      }
    }
    return scored;
  };

  let scored = scoreAll(params);
  if (!scored.length && (params.productTypes?.length || 0) > 0) {
    const softParams = {
      ...params,
      subcategoryIds: [],
      subcategoryNames: [],
      categoryIds: [],
      explicitSubcategoryFilter: false,
      searchKeywords: [],
    };
    scored = scoreAll(softParams);
  }
  return scored;
}

function mapScoredToProducts(scored, limit, sortBy, offset = 0) {
  const sorted = sortScoredItems([...scored], sortBy || 'relevance');
  const top = sorted.slice(offset, offset + limit);
  const maxScore = sorted[0]?.score || 0;

  const products = top.map((item) => {
    const sku = item._displaySku || item.skuVariants?.[0];
    return {
      productId: item.productId,
      sku: sku?.sku || item.sku,
      title: sku?.descriptionName || item.descriptionName || item.title,
      imageUrl: sku?.imageUrl || item.imageUrl,
      price: sku?.tagPrice ?? item.tagPrice ?? 0,
      totalInventory: item.totalInventory,
      similarityPercentage:
        maxScore > 0 ? Math.min(99, Math.round((item.score / maxScore) * 100)) : null,
      warehouses: [],
    };
  });

  return { products, maxScore, totalMatches: scored.length };
}

function searchCachedCatalog(params, limit = 15, offset = 0) {
  if (!memoryCatalog.length) {
    return { products: [], totalMatches: 0, fromCache: false };
  }

  const scored = collectScoredCatalog(params);
  const { products, maxScore, totalMatches } = mapScoredToProducts(
    scored,
    limit,
    params.sortBy || 'relevance',
    offset,
  );

  return {
    products,
    totalMatches,
    fromCache: true,
    maxScore,
  };
}

function summarizeCachedCatalog(params, sampleLimit = 6) {
  const scored = collectScoredCatalog(params);
  const { products, totalMatches } = mapScoredToProducts(
    scored,
    sampleLimit,
    params.sortBy || 'inventory_desc',
  );
  const totalUnits = scored.reduce((sum, item) => sum + Number(item.totalInventory || 0), 0);

  return {
    products,
    totalModels: totalMatches,
    totalUnits,
    displayQuery: params.displayQuery || '',
  };
}

function isCacheReady() {
  return memoryCatalog.length > 0;
}

function getCatalogCacheMeta() {
  return { ...memoryMeta, ready: isCacheReady() };
}

async function ensureCatalogCache() {
  if (isCacheReady() && supportChatTaxonomy.isTaxonomyLoaded()) return memoryMeta;
  try {
    return await rebuildCatalogCache();
  } catch (err) {
    const loaded = await loadCatalogFromRedis();
    if (loaded && isCacheReady()) {
      if (!supportChatTaxonomy.isTaxonomyLoaded()) {
        await supportChatTaxonomy.loadTaxonomyFromDb(
          [...new Set(memoryCatalog.map((i) => i.brand).filter(Boolean))],
        );
      }
      return memoryMeta;
    }
    throw err;
  }
}

let refreshScheduled = false;

function scheduleCatalogCacheRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;

  if (refreshTimer) clearInterval(refreshTimer);

  rebuildCatalogCache().catch((err) => {
    console.error('[support-chat-catalog] initial build failed:', err.message);
  });

  refreshTimer = setInterval(() => {
    rebuildCatalogCache().catch((err) => {
      console.error('[support-chat-catalog] scheduled rebuild failed:', err.message);
    });
  }, REFRESH_MS);

  if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
  console.log(`[support-chat-catalog] refresh scheduled every ${Math.round(REFRESH_MS / 60000)} min`);
}

module.exports = {
  rebuildCatalogCache,
  loadCatalogFromRedis,
  ensureCatalogCache,
  scheduleCatalogCacheRefresh,
  searchCachedCatalog,
  summarizeCachedCatalog,
  isCacheReady,
  getCatalogCacheMeta,
};
