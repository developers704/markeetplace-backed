const axios = require('axios');
const crypto = require('crypto');
const { getClient } = require('../config/redis');

const BASE_URL = 'https://www.laravo.com/api/v2';
const LARAVO_CACHE_TTL_SEC = Number(process.env.LARAVO_CACHE_TTL_SEC) || 60 * 60 * 24; // 24h
const LARAVO_CACHE_PREFIX = 'laravo:v1';

function requirePrivateKey() {
  const key = String(process.env.LARAVO_PRIVATE_KEY || '').trim();
  if (!key) {
    const err = new Error('LARAVO_PRIVATE_KEY is not configured on the server.');
    err.statusCode = 503;
    throw err;
  }
  return key;
}

function laravoHeaders() {
  return { privatekey: requirePrivateKey() };
}

function stableHash(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
}

function buildCacheKey(parts = []) {
  return [LARAVO_CACHE_PREFIX, ...parts.map((p) => String(p ?? '').trim() || '-')].join(':');
}

async function getCachedJson(cacheKey) {
  const redis = getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[Laravo] Redis get failed:', err.message);
    return null;
  }
}

async function setCachedJson(cacheKey, value, ttlSec = LARAVO_CACHE_TTL_SEC) {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.setex(cacheKey, ttlSec, JSON.stringify(value));
  } catch (err) {
    console.warn('[Laravo] Redis set failed:', err.message);
  }
}

async function withLaravoCache(cacheKey, loader, { force = false } = {}) {
  if (!force) {
    const cached = await getCachedJson(cacheKey);
    if (cached != null) return cached;
  }
  const fresh = await loader();
  await setCachedJson(cacheKey, fresh);
  return fresh;
}

function unwrapLaravoResponse(data) {
  const payload = data?.laravo;
  if (!payload) {
    const err = new Error('Invalid Laravo response');
    err.statusCode = 502;
    throw err;
  }
  if (payload.status !== 'success' && Number(payload.code) !== 1) {
    const err = new Error(payload.description || payload.title || 'Laravo API error');
    err.statusCode = 400;
    err.laravoBody = payload;
    throw err;
  }
  return payload;
}

function normalizeProduct(raw = {}) {
  return {
    id: String(raw.laravo_guid || raw.guid || ''),
    guid: String(raw.guid || ''),
    laravoGuid: raw.laravo_guid != null ? String(raw.laravo_guid) : null,
    title: raw.title || raw.model_number || '—',
    modelNumber: raw.model_number || '',
    brand: raw.brand || '',
    productType: raw.product_type || '',
    price: raw.price != null && raw.price !== '' ? Number(raw.price) : null,
    currency: raw.currency || 'USD',
    image: raw.image_link || raw.additional_image_link || null,
    material: raw.material || '',
    collection: raw.collection || '',
    color: raw.color || '',
    description: raw.description || raw.brand_description || '',
    raw,
  };
}

const DEFAULT_CLIENT_PAGE_SIZE = 20;

function normalizeProductsPage(payload, clientPagination = null) {
  const page = Number(payload.page) || 1;
  const pageCount = Number(payload.page_count) || 1;
  const products = Array.isArray(payload.data) ? payload.data.map(normalizeProduct) : [];
  const total = Number(payload.product_count) || products.length;

  const pagination = clientPagination || {
    page,
    pageCount,
    limit: products.length,
    total,
    returned: Number(payload.returned_products) || products.length,
    hasNextPage: page < pageCount,
    hasPrevPage: page > 1,
  };

  return {
    brand: payload.Brand || payload.brand || null,
    productType: payload.product_type || null,
    productCount: total,
    returnedProducts: pagination.returned,
    page: pagination.page,
    pageCount: pagination.pageCount,
    rowRange: payload.row_range || null,
    products,
    pagination,
  };
}

function buildClientPagination(total, page, limit, returned) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    pageCount,
    limit,
    total,
    returned,
    hasNextPage: page < pageCount,
    hasPrevPage: page > 1,
  };
}

function getVariantGroupKey(product) {
  const vid = String(product.raw?.vid || '').trim();
  return vid || String(product.id);
}

function getProductIdentity(product) {
  return String(product?.id || product?.laravoGuid || product?.guid || '').trim();
}

function sortVariantProducts(variants) {
  return [...variants].sort((a, b) => {
    const aDefault = String(a.raw?.v_default) === '1' ? 0 : 1;
    const bDefault = String(b.raw?.v_default) === '1' ? 0 : 1;
    return aDefault - bDefault;
  });
}

/** Laravo brand ("all types") pages can repeat the same SKU — keep one row per product id. */
function dedupeVariants(variants) {
  const seen = new Set();
  const unique = [];
  for (const product of variants) {
    const id = getProductIdentity(product);
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    unique.push(product);
  }
  return unique;
}

function normalizeProductGroup(vid, variants) {
  const sorted = sortVariantProducts(dedupeVariants(variants));
  return {
    vid,
    variants: sorted,
    defaultVariantId: sorted[0]?.id ?? null,
  };
}

/** Card grid only needs id/images/name/price/material/qty — strip heavy description + full raw. */
function toCatalogCardVariant(product) {
  const raw = product?.raw || {};
  return {
    id: product.id,
    guid: product.guid || '',
    laravoGuid: product.laravoGuid ?? null,
    title: product.title,
    modelNumber: product.modelNumber || '',
    brand: product.brand || '',
    productType: product.productType || '',
    price: product.price,
    currency: product.currency || 'USD',
    image: product.image || null,
    material: product.material || '',
    color: product.color || '',
    raw: {
      qty: raw.qty != null ? String(raw.qty) : undefined,
      image_link: raw.image_link || undefined,
      additional_image_link: raw.additional_image_link || undefined,
      additional_image_link_more: raw.additional_image_link_more || undefined,
      vid: raw.vid || undefined,
      v_default: raw.v_default || undefined,
    },
  };
}

function toCatalogCardGroup(group) {
  return {
    vid: group.vid,
    defaultVariantId: group.defaultVariantId ?? null,
    variants: (group.variants || []).map(toCatalogCardVariant),
  };
}

async function loadAllGroupedProducts(fetchPage) {
  const groupMap = new Map();
  const seenInGroup = new Map();
  let laravoPage = 1;
  let laravoPageCount = 1;
  let meta = null;
  let rawProductCount = 0;

  while (laravoPage <= laravoPageCount) {
    const payload = await fetchPage(laravoPage);
    laravoPageCount = Number(payload.page_count) || 1;
    rawProductCount = Number(payload.product_count) || rawProductCount;
    meta = payload;

    const products = Array.isArray(payload.data) ? payload.data.map(normalizeProduct) : [];
    products.forEach((product) => {
      const key = getVariantGroupKey(product);
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        seenInGroup.set(key, new Set());
      }
      const id = getProductIdentity(product);
      if (id) {
        const seen = seenInGroup.get(key);
        if (seen.has(id)) return;
        seen.add(id);
      }
      groupMap.get(key).push(product);
    });

    laravoPage += 1;
  }

  const groups = Array.from(groupMap.entries()).map(([vid, variants]) =>
    normalizeProductGroup(vid, variants),
  );

  return { groups, meta, rawProductCount };
}

function groupedCatalogCacheKey(url, options = {}) {
  const vendorId = options.vendorId != null && options.vendorId !== '' ? String(options.vendorId) : '-';
  // v2: catalog groups are deduped by product id (old caches had duplicate variants).
  return buildCacheKey(['grouped-catalog-v2', stableHash(url), `v${vendorId}`]);
}

function matchesProductId(product, id) {
  const needle = String(id);
  return (
    String(product?.id) === needle ||
    String(product?.laravoGuid) === needle ||
    String(product?.guid) === needle
  );
}

async function getCachedGroupedCatalog(url, options = {}) {
  const force = !!options.forceRefresh;
  const cacheKey = groupedCatalogCacheKey(url, options);

  return withLaravoCache(
    cacheKey,
    () =>
      loadAllGroupedProducts((laravoPage) =>
        fetchLaravoProductsPage(url, buildLaravoRequestConfig(laravoPage, options), { force }),
      ),
    { force },
  );
}

/** Resolve product+variants from an already-warm Redis catalog (no Laravo HTTP). */
async function findProductInCachedGroupedCatalog(brandId, productId, options = {}) {
  const id = String(productId || '').trim();
  if (!id || !brandId) return null;

  const urls = [];
  if (options.productTypeId) {
    urls.push(`${BASE_URL}/active-data/brands/${brandId}/product-types/${options.productTypeId}`);
  }
  urls.push(`${BASE_URL}/active-data/brands/${brandId}`);

  for (const url of urls) {
    const cached = await getCachedJson(groupedCatalogCacheKey(url, options));
    const groups = Array.isArray(cached?.groups) ? cached.groups : [];
    if (!groups.length) continue;

    for (const group of groups) {
      const variants = Array.isArray(group?.variants) ? group.variants : [];
      const product = variants.find((item) => matchesProductId(item, id));
      if (product) {
        const unique = variants.length ? sortVariantProducts(dedupeVariants(variants)) : [product];
        return {
          product,
          variants: unique,
        };
      }
    }
  }

  return null;
}

async function paginateGroupedLaravoProducts(url, options = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit) || DEFAULT_CLIENT_PAGE_SIZE));
  const page = Math.max(1, Number(options.page) || 1);

  const { groups, meta, rawProductCount } = await getCachedGroupedCatalog(url, options);
  const startIndex = (page - 1) * limit;
  const pageGroups = groups
    .slice(startIndex, startIndex + limit)
    .map(toCatalogCardGroup);
  const totalGroups = groups.length;
  const clientPagination = buildClientPagination(totalGroups, page, limit, pageGroups.length);

  return {
    brand: meta?.Brand || meta?.brand || null,
    productType: meta?.product_type || null,
    productCount: rawProductCount,
    groupedProductCount: totalGroups,
    returnedProducts: pageGroups.length,
    page: clientPagination.page,
    pageCount: clientPagination.pageCount,
    rowRange: null,
    groupedProducts: pageGroups,
    pagination: {
      ...clientPagination,
      rawProductCount,
      groupedTotal: totalGroups,
    },
  };
}

function listCacheKey(scope, brandId, productTypeId, options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || DEFAULT_CLIENT_PAGE_SIZE));
  const vendorId = options.vendorId != null && options.vendorId !== '' ? String(options.vendorId) : '-';
  const searchHash = Array.isArray(options.search) && options.search.length
    ? stableHash(options.search)
    : 'nosearch';
  return buildCacheKey([
    `${scope}-v3`,
    brandId,
    productTypeId || '-',
    `p${page}`,
    `l${limit}`,
    `v${vendorId}`,
    searchHash,
  ]);
}

async function getActiveData(options = {}) {
  const force = !!options.forceRefresh;
  const cacheKey = buildCacheKey(['active-data']);
  return withLaravoCache(
    cacheKey,
    async () => {
      const { data } = await axios.get(`${BASE_URL}/active-data`, {
        headers: laravoHeaders(),
        timeout: 30000,
      });
      const payload = unwrapLaravoResponse(data);
      const summary = Array.isArray(payload.summary) ? payload.summary : [];

      return {
        numberOfBrands: Number(payload.number_of_brands) || summary.length,
        summary: summary.map((brand) => ({
          brand: brand.brand,
          brandId: brand.brand_id,
          productTypeCount: brand.product_type_count,
          productTypes: Array.isArray(brand.product_types)
            ? brand.product_types.map((pt) => ({
                productType: pt.product_type,
                fileName: pt.file_name,
                fileId: pt.file_id,
                productTypeId: pt.product_type_id ?? pt.file_id,
                createdAt: pt.created_at,
                productCount: pt.product_count,
              }))
            : [],
        })),
      };
    },
    { force },
  );
}

function buildLaravoRequestConfig(laravoPage, options = {}) {
  const config = {
    headers: { ...laravoHeaders(), 'Content-Type': 'application/json' },
    params: { page: laravoPage },
    timeout: 45000,
  };

  const body = {};
  if (options.vendorId != null && options.vendorId !== '') body.vendor_id = options.vendorId;
  if (Array.isArray(options.search) && options.search.length) body.search = options.search;
  if (Object.keys(body).length) config.data = body;

  return config;
}

async function getBrandProducts(brandId, options = {}) {
  const force = !!options.forceRefresh;
  const cacheKey = listCacheKey('brand-products', brandId, null, options);
  return withLaravoCache(
    cacheKey,
    async () => {
      const url = `${BASE_URL}/active-data/brands/${brandId}`;
      const hasSearch = Array.isArray(options.search) && options.search.length > 0;

      if (hasSearch) {
        const laravoPage = Math.max(1, Number(options.page) || 1);
        const payload = await fetchLaravoProductsPage(
          url,
          buildLaravoRequestConfig(laravoPage, options),
          { force },
        );
        return normalizeProductsPage(payload);
      }

      return paginateGroupedLaravoProducts(url, options);
    },
    { force },
  );
}

async function fetchLaravoProductsPage(url, config, { force = false } = {}) {
  // Cache raw Laravo API pages too — avoids re-fetching every page during grouping
  const page = config?.params?.page ?? 1;
  const bodyHash = config?.data ? stableHash(config.data) : 'nobody';
  const cacheKey = buildCacheKey(['raw-page', stableHash(url), `p${page}`, bodyHash]);

  return withLaravoCache(
    cacheKey,
    async () => {
      const { data } = await axios.get(url, config);
      return unwrapLaravoResponse(data);
    },
    { force },
  );
}

async function getBrandProductTypeProducts(brandId, productTypeId, options = {}) {
  const force = !!options.forceRefresh;
  const cacheKey = listCacheKey('brand-type-products', brandId, productTypeId, options);
  return withLaravoCache(
    cacheKey,
    async () => {
      const url = `${BASE_URL}/active-data/brands/${brandId}/product-types/${productTypeId}`;
      const hasSearch = Array.isArray(options.search) && options.search.length > 0;

      if (hasSearch) {
        const laravoPage = Math.max(1, Number(options.page) || 1);
        const payload = await fetchLaravoProductsPage(
          url,
          buildLaravoRequestConfig(laravoPage, options),
          { force },
        );
        return normalizeProductsPage(payload);
      }

      return paginateGroupedLaravoProducts(url, options);
    },
    { force },
  );
}

async function fetchProductByIdFromLaravo(brandId, productId, options = {}) {
  const id = String(productId);
  const force = !!options.forceRefresh;
  const numericId = Number(id);
  const searchValue = Number.isFinite(numericId) && String(numericId) === id ? numericId : id;
  const searchByLaravoGuid = [{ header: 'laravo_guid', operator: '=', value: searchValue }];
  const fetchOptions = {
    page: 1,
    vendorId: options.vendorId,
    search: searchByLaravoGuid,
    forceRefresh: force,
  };

  let page = options.productTypeId
    ? await getBrandProductTypeProducts(brandId, options.productTypeId, fetchOptions)
    : await getBrandProducts(brandId, fetchOptions);

  let product = page.products.find((item) => matchesProductId(item, id)) || null;

  if (!product) {
    const searchByGuid = [{ header: 'guid', operator: '=', value: id }];
    page = options.productTypeId
      ? await getBrandProductTypeProducts(brandId, options.productTypeId, {
          ...fetchOptions,
          search: searchByGuid,
        })
      : await getBrandProducts(brandId, { ...fetchOptions, search: searchByGuid });

    product = page.products.find((item) => matchesProductId(item, id)) || null;
  }

  if (!product) {
    const err = new Error('Laravo product not found');
    err.statusCode = 404;
    throw err;
  }

  const vid = product.raw?.vid ? String(product.raw.vid) : '';
  let variants = [product];

  if (vid) {
    const variantPage = options.productTypeId
      ? await getBrandProductTypeProducts(brandId, options.productTypeId, {
          page: 1,
          vendorId: options.vendorId,
          search: [{ header: 'vid', operator: '=', value: vid }],
          forceRefresh: force,
        })
      : await getBrandProducts(brandId, {
          page: 1,
          vendorId: options.vendorId,
          search: [{ header: 'vid', operator: '=', value: vid }],
          forceRefresh: force,
        });

    if (variantPage.products.length) {
      variants = sortVariantProducts(dedupeVariants(variantPage.products));
    }
  }

  return { product, variants };
}

async function getProductById(brandId, productId, options = {}) {
  const id = String(productId || '').trim();
  if (!id) {
    const err = new Error('Product id is required');
    err.statusCode = 400;
    throw err;
  }

  const force = !!options.forceRefresh;
  const cacheKey = buildCacheKey([
    'product-v2',
    brandId,
    id,
    options.productTypeId || '-',
    options.vendorId != null && options.vendorId !== '' ? String(options.vendorId) : '-',
  ]);

  return withLaravoCache(
    cacheKey,
    async () => {
      // Prefer warm Redis catalog (list/warmup already loaded) — ms, no Laravo HTTP.
      if (!force) {
        const fromCatalog = await findProductInCachedGroupedCatalog(brandId, id, options);
        if (fromCatalog) return fromCatalog;
      }

      // Cold catalog only: targeted Laravo search (then cached for next hit).
      return fetchProductByIdFromLaravo(brandId, id, options);
    },
    { force },
  );
}

module.exports = {
  getActiveData,
  getBrandProducts,
  getBrandProductTypeProducts,
  getProductById,
  LARAVO_CACHE_TTL_SEC,
  DEFAULT_CLIENT_PAGE_SIZE,
};
