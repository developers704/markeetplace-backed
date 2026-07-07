const axios = require('axios');

const BASE_URL = 'https://www.laravo.com/api/v2';

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

const LARAVO_API_PAGE_SIZE = 500;
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

function sortVariantProducts(variants) {
  return [...variants].sort((a, b) => {
    const aDefault = String(a.raw?.v_default) === '1' ? 0 : 1;
    const bDefault = String(b.raw?.v_default) === '1' ? 0 : 1;
    return aDefault - bDefault;
  });
}

function normalizeProductGroup(vid, variants) {
  const sorted = sortVariantProducts(variants);
  return {
    vid,
    variants: sorted,
    defaultVariantId: sorted[0]?.id ?? null,
  };
}

async function loadAllGroupedProducts(fetchPage) {
  const groupMap = new Map();
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
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(product);
    });

    laravoPage += 1;
  }

  const groups = Array.from(groupMap.entries()).map(([vid, variants]) =>
    normalizeProductGroup(vid, variants),
  );

  return { groups, meta, rawProductCount };
}

async function paginateGroupedLaravoProducts(fetchPage, options = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit) || DEFAULT_CLIENT_PAGE_SIZE));
  const page = Math.max(1, Number(options.page) || 1);

  const { groups, meta, rawProductCount } = await loadAllGroupedProducts(fetchPage);
  const startIndex = (page - 1) * limit;
  const pageGroups = groups.slice(startIndex, startIndex + limit);
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
    products: pageGroups.flatMap((group) => group.variants),
    pagination: {
      ...clientPagination,
      rawProductCount,
      groupedTotal: totalGroups,
    },
  };
}

async function getActiveData() {
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
  const url = `${BASE_URL}/active-data/brands/${brandId}`;
  const hasSearch = Array.isArray(options.search) && options.search.length > 0;

  if (hasSearch) {
    const laravoPage = Math.max(1, Number(options.page) || 1);
    const payload = await fetchLaravoProductsPage(
      url,
      buildLaravoRequestConfig(laravoPage, options),
    );
    return normalizeProductsPage(payload);
  }

  return paginateGroupedLaravoProducts(
    (laravoPage) => fetchLaravoProductsPage(url, buildLaravoRequestConfig(laravoPage, options)),
    options,
  );
}

async function fetchLaravoProductsPage(url, config) {
  const { data } = await axios.get(url, config);
  return unwrapLaravoResponse(data);
}

async function getBrandProductTypeProducts(brandId, productTypeId, options = {}) {
  const url = `${BASE_URL}/active-data/brands/${brandId}/product-types/${productTypeId}`;
  const hasSearch = Array.isArray(options.search) && options.search.length > 0;

  if (hasSearch) {
    const laravoPage = Math.max(1, Number(options.page) || 1);
    const payload = await fetchLaravoProductsPage(
      url,
      buildLaravoRequestConfig(laravoPage, options),
    );
    return normalizeProductsPage(payload);
  }

  return paginateGroupedLaravoProducts(
    (laravoPage) => fetchLaravoProductsPage(url, buildLaravoRequestConfig(laravoPage, options)),
    options,
  );
}

async function getProductById(brandId, productId, options = {}) {
  const id = String(productId || '').trim();
  if (!id) {
    const err = new Error('Product id is required');
    err.statusCode = 400;
    throw err;
  }

  const numericId = Number(id);
  const searchValue = Number.isFinite(numericId) && String(numericId) === id ? numericId : id;
  const searchByLaravoGuid = [{ header: 'laravo_guid', operator: '=', value: searchValue }];
  const fetchOptions = {
    page: 1,
    vendorId: options.vendorId,
    search: searchByLaravoGuid,
  };

  let page = options.productTypeId
    ? await getBrandProductTypeProducts(brandId, options.productTypeId, fetchOptions)
    : await getBrandProducts(brandId, fetchOptions);

  let product =
    page.products.find(
      (item) =>
        String(item.id) === id ||
        String(item.laravoGuid) === id ||
        String(item.guid) === id,
    ) || null;

  if (!product) {
    const searchByGuid = [{ header: 'guid', operator: '=', value: id }];
    page = options.productTypeId
      ? await getBrandProductTypeProducts(brandId, options.productTypeId, {
          ...fetchOptions,
          search: searchByGuid,
        })
      : await getBrandProducts(brandId, { ...fetchOptions, search: searchByGuid });

    product =
      page.products.find(
        (item) =>
          String(item.id) === id ||
          String(item.laravoGuid) === id ||
          String(item.guid) === id,
      ) || null;
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
        })
      : await getBrandProducts(brandId, {
          page: 1,
          vendorId: options.vendorId,
          search: [{ header: 'vid', operator: '=', value: vid }],
        });

    if (variantPage.products.length) {
      variants = variantPage.products;
    }
  }

  return {
    product,
    variants,
  };
}

module.exports = {
  getActiveData,
  getBrandProducts,
  getBrandProductTypeProducts,
  getProductById,
};
