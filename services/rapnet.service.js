

const axios = require('axios');

// ── Endpoints ─────────────────────────────────────────────────────────────────
const AUTH_URL   = 'https://authztoken.api.rapaport.com/api/get';
const SEARCH_URL = 'https://technet.rapnetapis.com/instant-inventory/api/Diamonds';
const SINGLE_URL = 'https://technet.rapnetapis.com/instant-inventory/api/SingleDiamond';

const CLIENT_ID     = process.env.RAPNET_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.RAPNET_CLIENT_SECRET || '';

// ── Token + accountId cache ───────────────────────────────────────────────────
let _token      = null;
let _accountId  = null;   // extracted from JWT; used as request.header.username
let _expiresAt  = 0;

/**
 * Decode a JWT payload without verifying signature.
 * Used only to extract accountId — verification is done server-side by RapNet.
 */
function decodeJwtPayload(token) {
  try {
    const base64Payload = String(token).split('.')[1];
    const json = Buffer.from(base64Payload, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function fetchToken() {
  const { data } = await axios.post(
    AUTH_URL,
    { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 12000,
    }
  );

  const token = data?.access_token;
  if (!token) {
    throw new Error(`RapNet auth did not return access_token: ${JSON.stringify(data)}`);
  }

  // Extract accountId from JWT payload
  const payload = decodeJwtPayload(token);
  const accountId =
    payload?.['http://rapaport.com/user']?.accountId ??
    payload?.accountId ??
    null;

  if (!accountId) {
    console.warn('[RapNet] Could not extract accountId from JWT — requests may fail');
  }

  const expiresIn = data.expires_in ?? 86400;
  _token     = token;
  _accountId = accountId ? String(accountId) : null;
  _expiresAt = Date.now() + (expiresIn - 300) * 1000; // refresh 5 min before expiry

  console.log('[RapNet] Token acquired. accountId:', _accountId, '| expires in', expiresIn, 's');
  return _token;
}

async function getToken() {
  if (_token && Date.now() < _expiresAt) return _token;
  return fetchToken();
}

// ── POST helper ───────────────────────────────────────────────────────────────
async function rapnetPost(url, body) {
  const token = await getToken();
  try {
    const { data } = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        Accept:         'application/json',
        Authorization:  `Bearer ${token}`,
      },
      timeout: 20000,
    });
    return data;
  } catch (err) {
    const statusCode = err?.response?.status;
    const rapnetBody = err?.response?.data;
    const rapnetMsg  =
      typeof rapnetBody === 'string'
        ? rapnetBody
        : (rapnetBody?.Message ?? rapnetBody?.message ?? rapnetBody?.error ?? JSON.stringify(rapnetBody));

    const enhanced       = new Error(`RapNet ${statusCode} error on ${url}: ${rapnetMsg ?? err.message}`);
    enhanced.statusCode  = statusCode;
    enhanced.rapnetBody  = rapnetBody;
    console.error('[RapNet] POST error —', enhanced.message);
    throw enhanced;
  }
}

// ── Normalizer ────────────────────────────────────────────────────────────────
function normalizeDiamond(d) {
  if (!d) return null;
  return {
    // ── Identity ──────────────────────────────────────────────────────────────
    id:                String(d.diamond_id ?? ''),
    rapnetId:          String(d.diamond_id ?? ''),
    lotNum:            d.stock_num         ?? null,
    title:             buildTitle(d),

    // ── Grading ───────────────────────────────────────────────────────────────
    shape:             d.shape             ?? null,
    carat:             d.size              ?? null,
    color:             d.color             ?? null,
    clarity:           d.clarity           ?? null,
    cut:               d.cut               ?? null,
    polish:            d.polish            ?? null,
    symmetry:          d.symmetry          ?? null,
    fluorescence:      d.fluor_intensity   ?? null,
    fluorescenceColor: d.fluor_color       ?? null,

    // ── Certification ─────────────────────────────────────────────────────────
    lab:               d.lab               ?? null,
    certificateNumber: d.cert_num          ?? null,
    certificateUrl:    d.cert_file         ?? null,
    brand:             d.brand             ?? null,
    keyToSymbols:      Array.isArray(d.key_to_symbols) ? d.key_to_symbols : [],

    // ── Pricing ───────────────────────────────────────────────────────────────
    price:             d.total_sales_price ?? null,
    priceInCurrency:   d.total_sales_price_in_currency ?? null,
    currencyCode:      d.currency_code     ?? 'USD',
    currencySymbol:    d.currency_symbol   ?? '$',
    pricePerCarat:
      d.total_sales_price && d.size
        ? Math.round((d.total_sales_price / d.size) * 100) / 100
        : null,

    // ── Location ──────────────────────────────────────────────────────────────
    location:          d.country           ?? null,
    city:              d.city              ?? null,
    state:             d.state             ?? null,
    supplierName:      d.seller_name       ?? null,
    supplierId:        d.seller_id         ?? null,

    // ── Media ─────────────────────────────────────────────────────────────────
    hasImage:          d.has_image_file    ?? false,
    image:             d.image_file        ?? null,
    hasVideo:          d.has_video         ?? false,
    video:             d.video_url         ?? null,
    hasSarine:         d.has_sarineloupe   ?? false,
    // Full media array: [{ type: 'Image'|'Video'|'V360', url }]
    diamondMedia:      Array.isArray(d.diamond_media) ? d.diamond_media : [],

    // ── Proportions ───────────────────────────────────────────────────────────
    depthPercent:      d.depth_percent     ?? null,
    tablePercent:      d.table_percent     ?? null,
    ratio:             d.ratio             ?? null,
    measLength:        d.meas_length       ?? null,
    measWidth:         d.meas_width        ?? null,
    measDepth:         d.meas_depth        ?? null,
    crownHeightPercent:d.crown_height_percent ?? null,
    crownAngle:        d.crown_angle       ?? null,
    pavilionDepth:     d.pavilion_depth    ?? null,
    pavilionAngle:     d.pavilion_angle    ?? null,

    // ── Girdle & Culet ────────────────────────────────────────────────────────
    girdleMin:         d.girdle_min        ?? null,
    girdleMax:         d.girdle_max        ?? null,
    girdleCondition:   d.girdle_condition  ?? null,
    culetSize:         d.culet_size        ?? null,
    culetCondition:    d.culet_condition   ?? null,

    // ── Appearance ────────────────────────────────────────────────────────────
    eyeClean:          d.eye_clean         ?? null,
    shade:             d.shade             ?? null,
    milky:             d.milky             ?? null,
    isBGM:             d.is_bgm            ?? null,
    roughSource:       d.rough_source      ?? null,

    // ── Fancy color ───────────────────────────────────────────────────────────
    fancyColor:        d.fancy_color_dominant_color   ?? null,
    fancyColorSecondary: d.fancy_color_secondary_color ?? null,
    fancyOvertone:     d.fancy_color_overtone         ?? null,
    fancyIntensity:    d.fancy_color_intensity        ?? null,

    // ── Inclusions ────────────────────────────────────────────────────────────
    blackInclusions:   Array.isArray(d.black_inclusions) ? d.black_inclusions : [],
    whiteInclusions:   Array.isArray(d.white_inclusions) ? d.white_inclusions : [],
    openInclusions:    Array.isArray(d.open_inclusions)  ? d.open_inclusions  : [],

    raw: d,
  };
}

function buildTitle(d) {
  return [
    d.size   ? `${d.size}ct`  : null,
    d.shape,
    d.color  ?? d.fancy_color_dominant_color ?? null,
    d.clarity,
  ].filter(Boolean).join(' ') || 'Diamond';
}

// ── Public: Search diamonds ───────────────────────────────────────────────────
const parseMultiFilter = (value) =>
  String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const applyOrderedRangeFilter = (requestBody, filters, key, fromKey, toKey, order) => {
  const selected = parseMultiFilter(filters[key]);
  if (selected.length === 0) return;
  const indexed = selected
    .map((v) => ({ value: v, index: order.findIndex((o) => o.toLowerCase() === v.toLowerCase()) }))
    .filter((x) => x.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (indexed.length > 0) {
    requestBody[fromKey] = indexed[0].value;
    requestBody[toKey] = indexed[indexed.length - 1].value;
  } else {
    requestBody[fromKey] = selected[0];
    requestBody[toKey] = selected[selected.length - 1];
  }
};

async function searchDiamonds(filters = {}) {
  // Ensure token + accountId are ready
  await getToken();

  const page  = Math.max(1, parseInt(filters.page  ?? 1,  10));
  const limit = Math.min(Math.max(1, parseInt(filters.limit ?? 20, 10)), 100);

  // Build body exactly matching the working demo structure
  const requestBody = {
    page_number: page,
    page_size:   limit,
  };

  // Carat
  if (filters.caratFrom) requestBody.carat_from = parseFloat(filters.caratFrom);
  if (filters.caratTo)   requestBody.carat_to   = parseFloat(filters.caratTo);

  // Shapes — array
  const shapes = parseMultiFilter(filters.shape);
  if (shapes.length > 0) requestBody.shapes = shapes;

  // Ordered ranges; multi-select becomes min/max range for RapNet API.
  applyOrderedRangeFilter(requestBody, filters, 'color', 'color_from', 'color_to', [
    'D','E','F','G','H','I','J','K','L','M','N',
  ]);
  applyOrderedRangeFilter(requestBody, filters, 'clarity', 'clarity_from', 'clarity_to', [
    'FL','IF','VVS1','VVS2','VS1','VS2','SI1','SI2','I1','I2','I3',
  ]);
  applyOrderedRangeFilter(requestBody, filters, 'cut', 'cut_from', 'cut_to', [
    'Ideal','Excellent','Very Good','Good','Fair','Poor',
  ]);
  applyOrderedRangeFilter(requestBody, filters, 'polish', 'polish_from', 'polish_to', [
    'Ideal','Excellent','Very Good','Good','Fair','Poor',
  ]);
  applyOrderedRangeFilter(requestBody, filters, 'symmetry', 'symmetry_from', 'symmetry_to', [
    'Ideal','Excellent','Very Good','Good','Fair','Poor',
  ]);

  // Fluorescence / labs — arrays
  const fluorescence = parseMultiFilter(filters.fluorescence);
  if (fluorescence.length > 0) requestBody.fluorescence_intensities = fluorescence;

  const labs = parseMultiFilter(filters.lab);
  if (labs.length > 0) requestBody.labs = labs;

  // Price
  if (filters.priceFrom) requestBody.price_total_from = parseFloat(filters.priceFrom);
  if (filters.priceTo)   requestBody.price_total_to   = parseFloat(filters.priceTo);

  // Certificate
  if (filters.certificate) requestBody.cert_num = filters.certificate;

  // Location
  if (filters.location) requestBody.country = filters.location;

  // Sort
  if (filters.sort) {
    const [sortField, sortDir] = filters.sort.split('_');
    requestBody.sort_by        = capitalize(sortField);
    requestBody.sort_direction = capitalize(sortDir) || 'Asc';
  }

  const body = {
    request: {
      header: { username: _accountId },   // accountId from JWT — required
      body:   requestBody,
    },
  };

  const data        = await rapnetPost(SEARCH_URL, body);
  const header      = data?.response?.header;

  if (header?.error_code && header.error_code !== 0) {
    throw new Error(`RapNet API error ${header.error_code}: ${header.error_message}`);
  }

  const respBody      = data?.response?.body ?? {};
  const diamonds      = respBody?.diamonds   ?? [];
  const searchResults = respBody?.search_results ?? {};
  const total         = searchResults.total_diamonds_found ?? diamonds.length;

  return {
    success: true,
    data:    diamonds.map(normalizeDiamond).filter(Boolean),
    paginatorInfo: {
      total,
      page,
      limit,
      totalPages:  Math.ceil(total / limit) || 1,
      hasNextPage: page < Math.ceil(total / limit),
    },
  };
}

// ── Public: Single diamond ────────────────────────────────────────────────────
async function getDiamondById(diamondId) {
  await getToken();

  const body = {
    request: {
      header: { username: _accountId },
      body:   { diamond_id: String(diamondId) },
    },
  };

  const data   = await rapnetPost(SINGLE_URL, body);
  const header = data?.response?.header;

  if (header?.error_code && header.error_code !== 0) {
    throw new Error(`RapNet single-stone error ${header.error_code}: ${header.error_message}`);
  }

  const diamond = data?.response?.body?.diamond ?? data?.response?.body ?? null;
  if (!diamond) throw new Error('Diamond not found in RapNet response');

  return { success: true, data: normalizeDiamond(diamond) };
}

// ── Public: Submit inquiry (local record only) ────────────────────────────────
async function submitOrder(payload = {}) {
  return { status: 'SUBMITTED_TO_RAPNET', order_id: null, payload };
}

function capitalize(str) {
  if (!str) return '';
  return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
}

module.exports = { getToken, searchDiamonds, getDiamondById, submitOrder, normalizeDiamond };
