const path = require('path');
const ProductListing = require('../models/productListing.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const VendorProduct = require('../models/vendorProduct.model');
const {
  getUserApplicablePolicies,
  policyContentSummary,
} = require('./userApplicablePolicies.service');
const aiImageSearch = require('./aiImageSearch.service');
const supportChatLlm = require('./supportChatLlm.service');
const supportChatCatalogCache = require('./supportChatCatalogCache.service');
const supportChatTaxonomy = require('./supportChatTaxonomy.service');
const { productUploadPublicUrl } = require('../config/uploadPaths');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SUPPORT_CHAT_INITIAL_PRODUCTS = 15;
const SUPPORT_CHAT_MORE_PRODUCTS = 15;
/** Visual image-search matches returned to the chat UI */
const SUPPORT_CHAT_IMAGE_MATCHES = 30;

/** Chat cards show tagPrice only (not cp/wholesale price). */
function chatProductDisplayPrice(...sources) {
  for (const src of sources) {
    if (!src) continue;
    const tag = Number(src.tagPrice);
    if (Number.isFinite(tag) && tag > 0) return tag;
  }
  return 0;
}

const CATEGORY_KEYWORDS = [
  { keys: ['ring', 'rings', 'band', 'bands'], label: 'rings' },
  { keys: ['bracelet', 'bracelets', 'bangle', 'bangles'], label: 'bracelets' },
  { keys: ['necklace', 'necklaces', 'chain', 'chains', 'pendant', 'pendants'], label: 'necklaces' },
  { keys: ['earring', 'earrings', 'stud', 'studs'], label: 'earrings' },
  { keys: ['watch', 'watches'], label: 'watches' },
  { keys: ['diamond', 'diamonds'], label: 'diamond jewelry' },
];

const HUMAN_PHRASES = [
  'connect to human',
  'talk to human',
  'speak to human',
  'human agent',
  'live agent',
  'real person',
  'customer support',
  'support agent',
  'representative',
  'connect me',
  'transfer to agent',
];

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

function buildListingImageForSku(listing, skuDoc) {
  const skuImage = buildSkuImage(skuDoc);
  if (skuImage) return skuImage;
  const img = listing?.defaultSku?.images?.[0] || listing?.defaultSku?.gallery?.[0];
  return normalizeImageUrl(img);
}

function wantsHumanAgent(text) {
  const lower = String(text || '').toLowerCase();
  return HUMAN_PHRASES.some((p) => lower.includes(p));
}

function wantsWarehouseBreakdown(text) {
  const lower = String(text || '').toLowerCase();
  return (
    /\b(warehouse|store|location)\s*(wise|level|breakdown|split)\b/.test(lower) ||
    /\b(per|each|every)\s+(warehouse|store|location)\b/.test(lower) ||
    /\bwarehouse[- ]wise\b/.test(lower)
  );
}

function extractCategoryKeyword(text) {
  return supportChatTaxonomy.extractCategoryKeyword(text);
}

function categoryLabelToProductType(label) {
  const map = {
    rings: 'ring',
    necklaces: 'necklace',
    earrings: 'earring',
    bracelets: 'bracelet',
    watches: 'watch',
    'diamond jewelry': 'diamond',
  };
  return map[label] || label;
}

const STOP_SEARCH_TERMS = new Set([
  'hi', 'hello', 'hey', 'yes', 'no', 'ok', 'okay', 'what', 'help', 'thanks', 'thank', 'you',
  'please', 'sure', 'yep', 'nope', 'nah', 'the', 'a', 'an', 'and', 'or', 'if', 'i', 'me', 'my',
  'who', 'when', 'where', 'why', 'how', 'your', 'founder', 'owner', 'name', 'make', 'made',
  'answer', 'warehouse', 'warehouses', 'all', 'some', 'many', 'category', 'quantity', 'available',
]);

const META_QUESTION_PATTERNS = [
  /\bwho\s+(is|are|was)\s+(your|the)\s+(founder|owner|creator|maker|boss)\b/i,
  /\bwho\s+(made|created|built|owns)\s+(you|this|the\s+bot)\b/i,
  /\b(your|the)\s+(founder|owner|creator|owner\s+name)\b/i,
  /\bwho\s+are\s+you\b/i,
  /\bwhat\s+are\s+you\b/i,
  /\bwho\s+make\s+you\b/i,
  /\banswer\s+me\s+(your|the)\s+owner\b/i,
];

const BROWSE_FILLER_WORDS =
  /\b(please|kindly|can you|could you|would you|i want|i need|i search|search|serach|searh|find|get|list|display|show|give|me|the|some|any|all|and|or|do|you|have|got|we|a|an|if|products?|items?|available|stock|in|for|want|like|see|check|confirm|serach)\b/gi;

const SEARCH_STOP_TOKENS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'at', 'to', 'me', 'my', 'your',
  'our', 'is', 'are', 'was', 'be', 'it', 'this', 'that', 'please', 'show', 'search', 'find',
]);

const PRODUCT_SIGNAL_WORDS =
  /\b(gold|silver|platinum|diamond|diamonds|ring|rings|chain|chains|necklace|necklaces|bracelet|bracelets|earring|earrings|watch|watches|pendant|pendants|bangle|bangles|band|bands|18kt|14kt|10kt|22kt|yellow|white|rose|ruby|sapphire|emerald|pearl|labgrown|lab\s*grown|carat|karat)\b/i;

const NON_PRODUCT_QUESTION_PATTERN =
  /\b(who|what|when|where|why|how|can|could|would|should|know|name|owner|founder|about|tell|first|my|your)\b/i;

const NON_SKU_WORDS = new Set([
  'gold', 'ring', 'rings', 'chain', 'chains', 'watch', 'watches', 'diamond', 'diamonds',
  'silver', 'platinum', 'necklace', 'necklaces', 'bracelet', 'bracelets', 'earring', 'earrings',
  'pendant', 'pendants', 'bangle', 'bangles', 'band', 'bands', 'yellow', 'white', 'rose',
  'ruby', 'sapphire', 'emerald', 'pearl', 'pearls', 'product', 'products', 'item', 'items',
  'show', 'search', 'find', 'have', 'please', 'me', 'you', 'and', 'the', 'some', 'any',
]);

const JEWELRY_TYPE_MATCHERS = {
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

const TYPE_TOKEN_ALIASES = {
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

function normalizeBrowseQuery(text) {
  let q = supportChatTaxonomy.fixQueryTypos(String(text || ''))
    .replace(/^(no\s*,?\s*)/i, '')
    .replace(BROWSE_FILLER_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return q.length >= 2 ? q : null;
}

function tokenizeSearchQuery(query) {
  const normalized = normalizeBrowseQuery(query) || String(query || '').trim();
  const tokens = normalized
    .toLowerCase()
    .split(/[\s,./-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !SEARCH_STOP_TOKENS.has(t));
  return [...new Set(tokens)];
}

function hasProductQuerySignals(text) {
  if (isMetaQuestion(text)) return false;
  const q = normalizeBrowseQuery(text) || String(text || '').toLowerCase();
  if (!q || q.length < 3) return false;
  const tokens = tokenizeSearchQuery(q).filter((t) => !STOP_SEARCH_TERMS.has(t));
  if (PRODUCT_SIGNAL_WORDS.test(q)) return true;
  if (NON_PRODUCT_QUESTION_PATTERN.test(q)) return false;
  return tokens.length >= 1 && q.split(/\s+/).length <= 3;
}

function isMetaQuestion(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  return META_QUESTION_PATTERNS.some((p) => p.test(raw));
}

function isWarehouseListWithoutSku(text) {
  const raw = String(text || '').trim();
  return (
    /\b(warehouse|warehouses|store|stores|location)\b/i.test(raw) &&
    /\b(all|show|list|every)\b/i.test(raw) &&
    !extractSkuFromQuery(raw)
  );
}

const NON_PRODUCT_LOOKUP_PATTERN =
  /\b(polic(?:y|ies)|(?:total|all|list|show)\s+(?:brand|brands|categor(?:y|ies)|subcategor(?:y|ies))|how\s+many\s+(?:brand|brands|categor(?:y|ies)|subcategor(?:y|ies)))\b/i;

const NON_PRODUCT_SEARCH_TERMS = new Set([
  'policy',
  'policies',
  'brand',
  'brands',
  'category',
  'categories',
  'subcategory',
  'subcategories',
  'warehouse',
  'warehouses',
  'store',
  'stores',
  'total',
  'count',
  'complete',
  'full',
  'content',
  'assigned',
  'my',
  'your',
]);

function isNonProductLookupQuery(text) {
  return NON_PRODUCT_LOOKUP_PATTERN.test(String(text || ''));
}

function hasMeaningfulSearchKeywords(params) {
  if (!params) return false;
  const keywords = (params.searchKeywords || [])
    .map((k) => String(k).trim().toLowerCase())
    .filter(
      (k) =>
        k.length >= 2 &&
        !STOP_SEARCH_TERMS.has(k) &&
        !SEARCH_STOP_TOKENS.has(k) &&
        !NON_PRODUCT_SEARCH_TERMS.has(k),
    );
  return keywords.length >= 1;
}

function hasValidProductSearchParams(params) {
  if (!params) return false;
  if (params.taxonomyResolved) return true;
  if ((params.productTypes?.length || 0) > 0) return true;
  if ((params.subcategoryIds?.length || 0) > 0 || (params.categoryIds?.length || 0) > 0) {
    return true;
  }
  if ((params.brandHints?.length || 0) > 0) return true;
  if (hasMeaningfulSearchKeywords(params)) return true;

  const keywords = (params.searchKeywords || []).filter((k) => !STOP_SEARCH_TERMS.has(String(k).toLowerCase()));
  const types = params.productTypes || [];
  const hints = [...(params.metalHints || []), ...(params.stoneHints || []), ...(params.brandHints || [])];
  const jewelryTerms = [...keywords, ...types, ...hints].filter(
    (term) =>
      PRODUCT_SIGNAL_WORDS.test(String(term)) ||
      Boolean(resolveTypeMatcher(String(term).toLowerCase())),
  );
  return jewelryTerms.length >= 1;
}

function buildProductSearchIntentFromText(text) {
  if (isNonProductLookupQuery(text)) return null;
  if (!hasProductQuerySignals(text)) return null;
  if (!wantsProductBrowse(text) && !isDirectProductKeywordQuery(text)) return null;

  const browseQuery = extractProductBrowseQuery(text);
  if (!browseQuery) return null;

  const searchParams = normalizeSearchParams(
    {
      displayQuery: browseQuery,
      searchKeywords: tokenizeSearchQuery(browseQuery),
      productTypes: [categoryLabelToProductType(extractCategoryKeyword(text))].filter(Boolean),
      sortBy: /\b(low\s+to\s+high|cheapest)\b/i.test(text) ? 'price_asc' : 'inventory_desc',
      rawQuery: text,
    },
    text,
  );

  if (!hasValidProductSearchParams(searchParams)) return null;

  return {
    intent: 'product_search',
    sku: null,
    searchTerm: searchParams.displayQuery,
    searchParams,
    category: extractCategoryKeyword(text),
    includeWarehouseBreakdown: false,
    includeProducts: true,
  };
}

function isKeywordInventoryQuestion(text) {
  const raw = String(text || '').trim();
  if (isMetaQuestion(raw)) return false;
  return (
    /\b(how many|count|total|quantity|qty)\b/i.test(raw) &&
    /\b(available|stock|inventory|in\s+stock)\b/i.test(raw)
  );
}

const INVENTORY_TYPO_FIX = {
  brithstone: 'birthstone',
  birthston: 'birthstone',
  jewelery: 'jewelry',
};

function normalizeInventoryToken(token) {
  const key = String(token || '').toLowerCase().trim();
  return INVENTORY_TYPO_FIX[key] || key;
}

function hasValidInventorySearchParams(params) {
  if (!params) return false;
  const keywords = (params.searchKeywords || [])
    .map((k) => normalizeInventoryToken(k))
    .filter((k) => k.length >= 3 && !STOP_SEARCH_TERMS.has(k));
  return keywords.length >= 1 || hasValidProductSearchParams(params);
}

function extractInventorySearchParams(text) {
  let cleaned = String(text || '')
    .replace(
      /\b(how many|how much|count|total|quantity|qty|available|products?|items?|category|show|some|sample|list|sku|stock|inventory|in)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = normalizeBrowseQuery(cleaned) || cleaned;
  const keywords = tokenizeSearchQuery(cleaned)
    .map((t) => normalizeInventoryToken(t))
    .filter((t) => !STOP_SEARCH_TERMS.has(t) && t.length >= 3);
  const productTypes = [categoryLabelToProductType(extractCategoryKeyword(cleaned))].filter(Boolean);
  const displayQuery = keywords.join(' ') || cleaned;
  return normalizeSearchParams({
    displayQuery,
    searchKeywords: keywords,
    productTypes,
    sortBy: 'inventory_desc',
    rawQuery: text,
  });
}

function isAvailabilityProductQuestion(text) {
  const lower = String(text || '').toLowerCase();
  return (
    /\b(you have|do you have|have you got|got any|any\s+.+\s+in\s+stock|we have)\b/.test(lower) &&
    hasProductQuerySignals(text)
  );
}

function isDirectProductKeywordQuery(text) {
  const q = normalizeBrowseQuery(text);
  if (!q) return false;
  if (/\b(how many|how much|count|total|stock|inventory|quantity|qty)\b/i.test(String(text || ''))) {
    return false;
  }
  if (NON_PRODUCT_QUESTION_PATTERN.test(q)) return false;
  return hasProductQuerySignals(text) && q.split(/\s+/).length <= 4;
}

function resolveTypeMatcher(token) {
  const key = TYPE_TOKEN_ALIASES[token.toLowerCase()] || token.toLowerCase();
  return JEWELRY_TYPE_MATCHERS[key] || null;
}

function tokenFieldMatchers(token) {
  const typeRx = resolveTypeMatcher(token);
  if (typeRx) {
    return {
      $or: [
        { 'subcategoryDoc.name': typeRx },
        { 'defaultSku.attributes.descriptionname': typeRx },
        { searchText: typeRx },
      ],
    };
  }

  const rx = new RegExp(`\\b${escapeRegex(token)}\\b`, 'i');
  return {
    $or: [
      { searchText: rx },
      { title: rx },
      { vendorModel: rx },
      { vendorModelKey: rx },
      { brand: rx },
      { 'categoryDoc.name': rx },
      { 'subcategoryDoc.name': rx },
      { 'subsubcategoryDoc.name': rx },
      { 'defaultSku.sku': rx },
      { 'defaultSku.metalType': rx },
      { 'defaultSku.metalColor': rx },
      { 'defaultSku.size': rx },
      { metalTypeKeys: rx },
      { 'defaultSku.attributes.descriptionname': rx },
      { 'defaultSku.attributes.vendor': rx },
      { 'defaultSku.attributes.stonetype': rx },
      { 'defaultSku.attributes.centerclarity': rx },
      { 'defaultSku.attributes.centershape': rx },
      { 'defaultSku.attributes.avgweight': rx },
    ],
  };
}

function buildMultiTokenListingMatch(tokens, productTypes = []) {
  const uniqueTokens = [...new Set(tokens.map((t) => String(t).toLowerCase()).filter(Boolean))];
  const typeTokens = [
    ...new Set(
      (productTypes || [])
        .map((t) => TYPE_TOKEN_ALIASES[String(t).toLowerCase()] || String(t).toLowerCase())
        .filter((t) => JEWELRY_TYPE_MATCHERS[t]),
    ),
  ];

  const keywordTokens = uniqueTokens.filter((t) => !resolveTypeMatcher(t));
  const allClauses = [];

  for (const typeToken of typeTokens) {
    allClauses.push(tokenFieldMatchers(typeToken));
  }

  for (const token of keywordTokens) {
    if (!typeTokens.includes(TYPE_TOKEN_ALIASES[token] || token)) {
      allClauses.push(tokenFieldMatchers(token));
    }
  }

  if (!allClauses.length) return null;

  const match = { totalInventory: { $gt: 0 } };
  if (allClauses.length === 1) {
    Object.assign(match, allClauses[0]);
  } else {
    match.$and = allClauses;
  }
  return match;
}

function getSortSpec(sortBy) {
  switch (sortBy) {
    case 'price_asc':
      return { minPrice: 1, _id: 1 };
    case 'price_desc':
      return { minPrice: -1, _id: 1 };
    case 'inventory_desc':
    default:
      return { totalInventory: -1, _id: 1 };
  }
}

function normalizeSearchParams(input, rawQuery = '') {
  let base;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const keywords = (input.searchKeywords || [])
      .map((k) => String(k).trim().toLowerCase())
      .filter((k) => k.length >= 2 && !SEARCH_STOP_TOKENS.has(k));
    const productTypes = (input.productTypes || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    const displayQuery =
      String(input.displayQuery || '').trim() ||
      [...new Set([...keywords, ...productTypes])].join(' ') ||
      normalizeBrowseQuery(input.rawQuery || rawQuery || '') ||
      '';

    base = {
      searchKeywords: keywords.length ? keywords : tokenizeSearchQuery(displayQuery),
      productTypes,
      metalHints: (input.metalHints || []).map((m) => String(m).trim().toLowerCase()).filter(Boolean),
      stoneHints: (input.stoneHints || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean),
      sortBy: input.sortBy || 'inventory_desc',
      displayQuery,
    };
  } else {
    const raw = String(input || rawQuery || '').trim();
    const displayQuery = normalizeBrowseQuery(raw) || raw;
    base = {
      searchKeywords: tokenizeSearchQuery(displayQuery),
      productTypes: [],
      metalHints: [],
      stoneHints: [],
      sortBy: /\b(low\s+to\s+high|cheapest|low\s+price|ascending)\b/i.test(raw)
        ? 'price_asc'
        : /\b(high\s+to\s+low|expensive|descending)\b/i.test(raw)
          ? 'price_desc'
          : 'inventory_desc',
      displayQuery,
    };
  }

  return supportChatTaxonomy.enrichSearchParams(base, rawQuery || base.displayQuery || input);
}

function isLikelySkuCode(value) {
  const code = String(value || '').trim();
  if (!code || code.length < 3) return false;
  if (NON_SKU_WORDS.has(code.toLowerCase())) return false;
  if (/^\d{4,}$/.test(code)) return true;
  if (/\d/.test(code) && code.length >= 4) return true;
  return false;
}

const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|yo|sup)[\s!.?]*$/i,
  /^(good\s+(morning|afternoon|evening))[\s!.?]*$/i,
  /^(thanks|thank\s+you|thx)[\s!.?]*$/i,
  /^(ok|okay|sure|alright)[\s!.?]*$/i,
  /^(yes|no|yep|nope|nah)[\s!.?]*$/i,
  /^(what|huh|\?)[\s!.?]*$/i,
  /^(can you help|could you help|help me|healp me|can you healp)[\s!.?]*$/i,
  /^i\s+need[\s!.?]*$/i,
];

function extractSkuFromQuery(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const explicit = raw.match(/\bsku\s*[#:.-]?\s*([A-Za-z0-9-]+)/i);
  if (explicit?.[1] && isLikelySkuCode(explicit[1])) return explicit[1].trim();

  const check = raw.match(
    /\b(?:check|find|lookup|search|show|get|confirm)\s+sku\s+([A-Za-z0-9-]+)\b/i,
  );
  if (check?.[1] && isLikelySkuCode(check[1])) return check[1].trim();

  const checkCode = raw.match(
    /\b(?:check|find|lookup|search|show|get|confirm)\s+([A-Za-z0-9-]+)\b/i,
  );
  if (checkCode?.[1] && isLikelySkuCode(checkCode[1])) return checkCode[1].trim();

  if (/\b(sku|stock|inventory|quantity|warehouse|check|find|confirm)\b/i.test(raw)) {
    const nums = raw.match(/\b\d{4,}\b/g);
    if (nums?.length) return nums[nums.length - 1].trim();
  }

  return null;
}

function isConversationalMessage(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (CONVERSATIONAL_PATTERNS.some((p) => p.test(t))) return true;
  if (t.length <= 4 && !/\d{4,}/.test(t)) return true;
  if (/^(can you|could you)\s+help/i.test(t)) return true;
  return false;
}

function wantsProductBrowse(text) {
  const raw = String(text || '');
  return (
    /\b(show\s+me|give\s+me|list|display|find\s+me|get\s+me|search\s+for|please\s+search|please\s+serach|i\s+need\s+.+\s+products?)\b/i.test(
      raw,
    ) ||
    (/\b(show|search|serach|find)\b/i.test(raw) && hasProductQuerySignals(raw))
  );
}

function extractProductBrowseQuery(text) {
  return normalizeBrowseQuery(text);
}

function isExploratoryAvailabilityQuestion(text) {
  const lower = String(text || '').toLowerCase();
  if (isAvailabilityProductQuestion(text)) return true;
  return (
    /\b(do you have|have you got|if you have|any\s+.+\s+available|do we have)\b/.test(lower) &&
    extractCategoryKeyword(lower) !== null
  );
}

function isCategoryInventoryQuestion(text) {
  const lower = String(text || '').toLowerCase();
  const hasCategory = extractCategoryKeyword(lower) !== null;
  const hasInventoryWord = /\b(how many|stock|inventory|quantity|qty|available|in stock)\b/.test(lower);
  return hasCategory && hasInventoryWord;
}

function isValidSearchTerm(term) {
  const t = String(term || '').trim().toLowerCase();
  if (!t || t.length < 3) return false;
  if (STOP_SEARCH_TERMS.has(t)) return false;
  return true;
}

function extractSearchTerm(text) {
  if (isMetaQuestion(text) || isKeywordInventoryQuestion(text) || isWarehouseListWithoutSku(text)) {
    return '';
  }
  const cleaned = String(text || '')
    .replace(/\b(find|search|show|lookup|check|sku|product|item|model|vendor|warehouse|wise|quantity|stock|please|me|the)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!isValidSearchTerm(cleaned) || !hasProductQuerySignals(cleaned)) return '';
  return cleaned;
}

function sanitizeLlmIntent(intent, text) {
  if (!intent) return null;
  const normalizedTerm = normalizeBrowseQuery(intent.searchTerm || text) || null;
  const term = String(normalizedTerm || intent.searchTerm || '').trim().toLowerCase();
  if (
    (intent.intent === 'product_search' || intent.intent === 'product_browse') &&
    (STOP_SEARCH_TERMS.has(term) || term.length < 2)
  ) {
    if (hasProductQuerySignals(text)) {
      return {
        ...intent,
        intent: 'product_search',
        searchTerm: normalizeBrowseQuery(text),
        includeProducts: true,
      };
    }
    return { ...intent, intent: 'conversational', searchTerm: null, includeProducts: false };
  }
  if (intent.intent === 'product_browse') {
    intent.intent = 'product_search';
    intent.includeProducts = true;
  }
  if (intent.intent === 'product_search' || intent.intent === 'product_browse') {
    intent.searchTerm = normalizedTerm || intent.searchTerm;
    intent.includeProducts = intent.includeProducts === true || wantsProductBrowse(text) || isAvailabilityProductQuestion(text);
  }
  if (intent.intent === 'inventory_summary' && intent.includeProducts !== true) {
    intent.includeProducts = isAvailabilityProductQuestion(text) || wantsProductBrowse(text);
  }
  if (
    isConversationalMessage(text) &&
    !intent.sku &&
    intent.intent !== 'human_handoff' &&
    !hasProductQuerySignals(text)
  ) {
    return { ...intent, intent: 'conversational', searchTerm: null, includeProducts: false };
  }
  return intent;
}

function skuTitle(skuDoc, listing, vendorProduct) {
  const desc =
    readAttr(skuDoc?.attributes, 'descriptionname') ||
    vendorProduct?.title ||
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

function formatWarehouseLines(warehouses) {
  if (!warehouses.length) return ['No warehouse stock rows found for this SKU.'];
  return warehouses.map(
    (w) => `• **${w.name}**${w.isMain ? ' (MAIN)' : ''}: **${w.quantity}** unit${w.quantity === 1 ? '' : 's'}`,
  );
}

async function lookupSkuByCode(skuCode, options = {}) {
  const code = String(skuCode || '').trim();
  if (!code) return null;

  let skuDoc = await Sku.findOne({ sku: code }).lean();
  if (!skuDoc) {
    skuDoc = await Sku.findOne({ skuKey: code.toUpperCase() }).lean();
  }
  if (!skuDoc) {
    const regex = new RegExp(`^${escapeRegex(code)}$`, 'i');
    skuDoc = await Sku.findOne({ sku: regex }).lean();
  }
  if (!skuDoc) return null;

  const [inventories, listing, vendorProduct] = await Promise.all([
    SkuInventory.find({ skuId: skuDoc._id })
      .populate('warehouse', 'name isMain')
      .lean(),
    ProductListing.findOne({ productId: skuDoc.productId })
      .select('productId title brand totalInventory vendorModel defaultSku')
      .lean(),
    VendorProduct.findById(skuDoc.productId).select('title vendorModel brand').lean(),
  ]);

  const warehouses = mapWarehouseRows(inventories);
  const totalQty = inventories.reduce((sum, inv) => sum + Number(inv.quantity || 0), 0);
  const includeWarehouse = options.includeWarehouseBreakdown !== false;

  const title = skuTitle(skuDoc, listing, vendorProduct);
  const imageUrl = buildListingImageForSku(listing, skuDoc);

  const textLines = [
    `**SKU ${skuDoc.sku}** — ${title}`,
    '',
    `• Vendor model: **${vendorProduct?.vendorModel || listing?.vendorModel || '—'}**`,
    `• Metal: **${[skuDoc.metalColor, skuDoc.metalType, skuDoc.size].filter(Boolean).join(' / ') || '—'}**`,
    `• Tag price: **$${Number(skuDoc.tagPrice || skuDoc.price || 0).toLocaleString()}**`,
    `• Total live quantity: **${totalQty}** unit${totalQty === 1 ? '' : 's'}`,
  ];

  if (includeWarehouse) {
    textLines.push('', '**Warehouse breakdown (SkuInventory):**', ...formatWarehouseLines(warehouses));
  }

  textLines.push('', 'Open the product card below for full marketplace details.');

  const product = {
    productId: String(skuDoc.productId),
    sku: skuDoc.sku,
    title,
    imageUrl,
    price: chatProductDisplayPrice(skuDoc),
    totalInventory: totalQty,
    similarityPercentage: null,
    warehouses,
  };

  return {
    text: textLines.join('\n'),
    products: [product],
    factual: {
      type: 'sku_lookup',
      sku: skuDoc.sku,
      title,
      totalQty,
      warehouses,
      vendorModel: vendorProduct?.vendorModel || listing?.vendorModel || '',
    },
  };
}

async function getInventorySummary(categoryLabel, options = {}) {
  const includeProducts = options.includeProducts !== false;
  const regex = categoryLabel ? new RegExp(escapeRegex(categoryLabel), 'i') : null;
  const match = { totalInventory: { $gt: 0 } };
  if (regex) {
    match.$or = [
      { searchText: regex },
      { title: regex },
      { brand: regex },
      { 'categoryDoc.name': regex },
      { 'subcategoryDoc.name': regex },
      { 'subsubcategoryDoc.name': regex },
    ];
  }

  const [agg, samples] = await Promise.all([
    ProductListing.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          productCount: { $sum: 1 },
          totalUnits: { $sum: '$totalInventory' },
          mainUnits: { $sum: '$mainWarehouseInventory' },
        },
      },
    ]),
    ProductListing.find(match)
      .select('productId title brand totalInventory mainWarehouseInventory defaultSku vendorModel')
      .sort({ totalInventory: -1 })
      .limit(6)
      .lean(),
  ]);

  const skuIds = samples.map((s) => s.defaultSku?._id).filter(Boolean);
  const skuDocs = skuIds.length
    ? await Sku.find({ _id: { $in: skuIds } }).select('_id images gallery attributes tagPrice').lean()
    : [];
  const skuImageMap = new Map(skuDocs.map((s) => [String(s._id), s]));

  const stats = agg[0] || { productCount: 0, totalUnits: 0, mainUnits: 0 };
  const products = samples.map((row) => {
    const skuDoc = row.defaultSku?._id ? skuImageMap.get(String(row.defaultSku._id)) : null;
    const title = skuTitle(skuDoc || row.defaultSku, row) || row.title || row.defaultSku?.sku || 'Product';
    return {
      productId: String(row.productId),
      sku: row.defaultSku?.sku || '',
      title,
      imageUrl: buildListingImageForSku(row, skuDoc || row.defaultSku),
      price: chatProductDisplayPrice(skuDoc, row.defaultSku),
      totalInventory: row.totalInventory ?? 0,
      similarityPercentage: null,
      warehouses: [],
    };
  });

  const scope = categoryLabel ? categoryLabel : 'marketplace catalog';
  const lines = [
    `Yes — we have live **${scope}** inventory in the marketplace.`,
    '',
    `• **${stats.productCount.toLocaleString()}** active product models`,
    `• **${stats.totalUnits.toLocaleString()}** total units (SkuInventory)`,
    `• **${stats.mainUnits.toLocaleString()}** units in MAIN warehouse`,
  ];

  if (includeProducts && products.length) {
    lines.push('', 'Here are top in-stock models:');
  } else if (!stats.productCount) {
    lines.push('', 'No in-stock items matched that category right now.');
  } else {
    lines.push(
      '',
      'Would you like me to **show product cards**? Try: "Show me gold chain products" or share a **SKU** to check warehouse quantities.',
    );
  }

  return {
    text: lines.join('\n'),
    products: includeProducts ? products : [],
    factual: { type: 'inventory_summary', category: scope, stats, includeProducts },
  };
}

async function mapListingRowsToProducts(rows) {
  const defaultSkuIds = rows.map((r) => r.defaultSku?._id).filter(Boolean);
  const defaultSkuDocs = defaultSkuIds.length
    ? await Sku.find({ _id: { $in: defaultSkuIds } })
        .select('_id images gallery attributes price tagPrice metalColor metalType size')
        .lean()
    : [];
  const defaultSkuMap = new Map(defaultSkuDocs.map((s) => [String(s._id), s]));

  return rows.map((row) => {
    const defaultSkuDoc = row.defaultSku?._id
      ? defaultSkuMap.get(String(row.defaultSku._id))
      : null;
    const skuDoc = defaultSkuDoc || row.defaultSku;
    const title =
      skuTitle(skuDoc, row) ||
      row.subcategoryDoc?.name ||
      row.title ||
      row.vendorModel ||
      row.defaultSku?.sku ||
      'Product';
    return {
      productId: String(row.productId),
      sku: row.defaultSku?.sku || '',
      title,
      imageUrl: buildListingImageForSku(row, skuDoc),
      price: chatProductDisplayPrice(skuDoc, row.defaultSku),
      totalInventory: row.totalInventory ?? 0,
      similarityPercentage: null,
      warehouses: [],
    };
  });
}

async function searchCatalogProductsByListingText(phrase, options = {}) {
  const search = String(phrase || '').trim();
  const limit = Number(options.limit) || SUPPORT_CHAT_INITIAL_PRODUCTS;
  const offset = Number(options.offset) || 0;
  if (!search) return { products: [], totalMatches: 0 };

  const regex = new RegExp(escapeRegex(search), 'i');
  const match = { totalInventory: { $gt: 0 }, searchText: regex };
  const [rows, totalMatches] = await Promise.all([
    ProductListing.find(match)
      .select('productId title brand totalInventory minPrice defaultSku vendorModel subcategoryDoc')
      .sort({ totalInventory: -1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    ProductListing.countDocuments(match),
  ]);

  return {
    products: await mapListingRowsToProducts(rows),
    totalMatches,
  };
}

async function searchCatalogProductsMongoFallback(params, options = {}) {
  const limit = Number(options.limit) || SUPPORT_CHAT_INITIAL_PRODUCTS;
  const offset = Number(options.offset) || 0;
  const tokens = [
    ...new Set([...params.searchKeywords, ...params.metalHints, ...params.stoneHints]),
  ];
  const productTypes = params.productTypes.length
    ? params.productTypes
    : tokens.filter((t) => resolveTypeMatcher(t)).map((t) => TYPE_TOKEN_ALIASES[t] || t);

  const sortSpec = getSortSpec(params.sortBy);
  let rows = [];
  let totalMatches = 0;

  if (tokens.length > 0 || productTypes.length > 0) {
    const tokenMatch = buildMultiTokenListingMatch(tokens, productTypes);
    if (tokenMatch) {
      [rows, totalMatches] = await Promise.all([
        ProductListing.find(tokenMatch)
          .select('productId title brand totalInventory minPrice defaultSku vendorModel subcategoryDoc')
          .sort(sortSpec)
          .skip(offset)
          .limit(limit)
          .lean(),
        ProductListing.countDocuments(tokenMatch),
      ]);
    }
  }

  return {
    products: await mapListingRowsToProducts(rows),
    totalMatches,
  };
}

function buildProductSearchMeta(params, totalMatches, loadedCount) {
  if (!params?.displayQuery) return null;
  return {
    searchParams: params,
    totalMatches: Number(totalMatches || 0),
    hasMore: Number(totalMatches || 0) > Number(loadedCount || 0),
  };
}

async function searchCatalogProducts(queryOrParams, options = {}) {
  const limit = Number(options.limit) || SUPPORT_CHAT_INITIAL_PRODUCTS;
  const offset = Number(options.offset) || 0;
  const includeMessage = options.includeMessage !== false;

  const params = normalizeSearchParams(
    typeof queryOrParams === 'object' ? queryOrParams : { displayQuery: queryOrParams, rawQuery: queryOrParams },
    typeof queryOrParams === 'string' ? queryOrParams : queryOrParams?.rawQuery || queryOrParams?.displayQuery,
  );
  const displayQuery = params.displayQuery;
  if (!displayQuery) {
    return { text: '', products: [], factual: null, productSearch: null };
  }

  if (isLikelySkuCode(displayQuery)) {
    const exactSku = await lookupSkuByCode(displayQuery, { includeWarehouseBreakdown: true });
    if (exactSku) {
      return {
        text: exactSku.text,
        products: exactSku.products,
        factual: exactSku.factual,
        productSearch: null,
      };
    }
  }

  let products = [];
  let totalMatches = 0;
  let fromCache = false;

  if (params.literalDescriptionSearch) {
    const listingResult = await searchCatalogProductsByListingText(params.rawSearchPhrase || displayQuery, {
      limit,
      offset,
    });
    products = listingResult.products;
    totalMatches = listingResult.totalMatches;
  }

  if (!products.length) {
    await supportChatCatalogCache.ensureCatalogCache();
    const cacheResult = supportChatCatalogCache.searchCachedCatalog(params, limit, offset);
    products = cacheResult.products;
    totalMatches = cacheResult.totalMatches;
    fromCache = cacheResult.fromCache;
  }

  if (!products.length) {
    const fallbackResult = await searchCatalogProductsMongoFallback(params, { limit, offset });
    products = fallbackResult.products;
    totalMatches = fallbackResult.totalMatches || products.length;
  }

  const loadedCount = offset + products.length;
  const productSearch = buildProductSearchMeta(params, totalMatches, loadedCount);

  const sortLabel =
    params.sortBy === 'price_asc'
      ? ' (lowest price first)'
      : params.sortBy === 'price_desc'
        ? ' (highest price first)'
        : '';

  const text = includeMessage
    ? products.length > 0
      ? `Here are **${loadedCount}** in-stock match${loadedCount === 1 ? '' : 'es'} for **${displayQuery}**${sortLabel}${totalMatches > loadedCount ? ` (${totalMatches} total in catalog)` : ''}. Tap a card for details.`
      : `No in-stock products matched **${displayQuery}**. Try an exact SKU (e.g. 106322), vendor model, or a photo upload.`
    : '';

  return {
    text,
    products,
    productSearch,
    factual: {
      type: 'product_search',
      query: displayQuery,
      count: products.length,
      totalMatches,
      loadedCount,
      sortBy: params.sortBy,
      searchKeywords: params.searchKeywords,
      productTypes: params.productTypes,
      fromCache: fromCache && products.length > 0,
      literalDescriptionSearch: params.literalDescriptionSearch === true,
    },
  };
}

async function loadMoreCatalogProducts(searchParams, loadedCount, options = {}) {
  const limit = Number(options.limit) || SUPPORT_CHAT_MORE_PRODUCTS;
  const offset = Number(loadedCount) || 0;
  return searchCatalogProducts(searchParams, { limit, offset, includeMessage: false });
}

async function enrichAiMatches(matches = [], limit = SUPPORT_CHAT_IMAGE_MATCHES) {
  if (!matches.length) return [];
  const skus = [...new Set(matches.map((m) => m.sku).filter(Boolean))];
  const skuDocs = await Sku.find({ sku: { $in: skus } })
    .select('sku productId price tagPrice images gallery attributes metalColor metalType size')
    .lean();
  const skuMap = new Map(skuDocs.map((s) => [String(s.sku), s]));
  const productIds = [...new Set(skuDocs.map((s) => String(s.productId)).filter(Boolean))];
  const listings = await ProductListing.find({ productId: { $in: productIds } })
    .select('productId title totalInventory defaultSku vendorModel')
    .lean();
  const listingMap = new Map(listings.map((l) => [String(l.productId), l]));

  const max = Math.max(1, Number(limit) || SUPPORT_CHAT_IMAGE_MATCHES);

  return Promise.all(
    matches.slice(0, max).map(async (match) => {
      const skuDoc = skuMap.get(String(match.sku));
      const listing = skuDoc ? listingMap.get(String(skuDoc.productId)) : null;
      let warehouses = [];
      let totalInventory = listing?.totalInventory ?? 0;

      if (skuDoc?._id) {
        const invRows = await SkuInventory.find({ skuId: skuDoc._id })
          .populate('warehouse', 'name isMain')
          .lean();
        warehouses = mapWarehouseRows(invRows);
        totalInventory = invRows.reduce((sum, inv) => sum + Number(inv.quantity || 0), 0);
      }

      const imageUrl =
        buildSkuImage(skuDoc) ||
        normalizeImageUrl(match.imageUrl) ||
        buildListingImageForSku(listing, skuDoc);

      return {
        productId: listing ? String(listing.productId) : skuDoc ? String(skuDoc.productId) : '',
        sku: match.sku,
        title: skuTitle(skuDoc, listing, null) || match.nameSuggestion || match.sku,
        imageUrl,
        price: chatProductDisplayPrice(skuDoc, listing?.defaultSku),
        totalInventory,
        similarityPercentage: match.similarityPercentage ?? null,
        warehouses,
      };
    }),
  );
}

async function getCatalogStatsFacts(statsType = 'brands') {
  await supportChatCatalogCache.ensureCatalogCache();
  if (!supportChatTaxonomy.isTaxonomyLoaded()) {
    await supportChatTaxonomy.loadTaxonomyFromDb();
  }
  const taxonomy = supportChatTaxonomy.getTaxonomy();
  const meta = supportChatCatalogCache.getCatalogCacheMeta();

  if (statsType === 'categories') {
    return {
      type: 'catalog_stats',
      statsType: 'categories',
      count: taxonomy.categories.length,
      samples: taxonomy.categories.slice(0, 20).map((c) => c.name),
      totalInStockModels: meta.count || 0,
    };
  }

  if (statsType === 'subcategories') {
    return {
      type: 'catalog_stats',
      statsType: 'subcategories',
      count: taxonomy.subcategories.length,
      samples: taxonomy.subcategories.slice(0, 20).map((s) => s.name),
      totalInStockModels: meta.count || 0,
    };
  }

  return {
    type: 'catalog_stats',
    statsType: 'brands',
    count: taxonomy.brands.length,
    samples: taxonomy.brands.slice(0, 20),
    totalInStockModels: meta.count || 0,
  };
}

async function getCustomerPolicyFacts(customerId, context = {}) {
  const roleId = context.roleId || null;
  const warehouseId = context.selectedWarehouseId || context.warehouseId || null;

  const applicable = await getUserApplicablePolicies({
    customerId,
    roleId,
    warehouseId,
  });

  const mapPolicyForRag = (p) => ({
    id: String(p._id),
    title: p.title,
    policyType: p.policyType,
    version: p.version,
    isSigned: p.isSigned,
    signedAt: p.signedAt,
    policyVersion: p.policyVersion,
    summary: policyContentSummary(p.content),
  });

  return {
    type: 'policy_info',
    customerId: customerId ? String(customerId) : null,
    roleId: applicable.roleId,
    warehouseId: applicable.warehouseId,
    statistics: applicable.statistics,
    allPolicies: applicable.allPolicies.map(mapPolicyForRag),
    signedPolicies: applicable.signedPolicies.map(mapPolicyForRag),
    unsignedPolicies: applicable.unsignedPolicies.map(mapPolicyForRag),
    activePolicies: applicable.allPolicies.map(mapPolicyForRag),
    acceptedPolicies: applicable.signedPolicies.map(mapPolicyForRag),
  };
}

function detectCatalogStatsType(text) {
  const raw = String(text || '').toLowerCase();
  if (/\bsubcategor/.test(raw)) return 'subcategories';
  if (/\bcategor/.test(raw)) return 'categories';
  return 'brands';
}

function shouldAcceptLlmIntent(mapped, text) {
  if (!mapped) return false;

  if (
    (mapped.intent === 'needs_clarification' ||
      mapped.intent === 'conversational' ||
      mapped.intent === 'greeting') &&
    !isNonProductLookupQuery(text) &&
    (wantsProductBrowse(text) || isDirectProductKeywordQuery(text) || isAvailabilityProductQuestion(text))
  ) {
    const browseQuery = extractProductBrowseQuery(text);
    if (browseQuery) {
      const params = normalizeSearchParams(
        {
          displayQuery: browseQuery,
          searchKeywords: tokenizeSearchQuery(browseQuery),
          rawQuery: text,
        },
        text,
      );
      if (hasValidProductSearchParams(params)) return false;
    }
  }

  if (mapped.intent === 'product_search') {
    if (isMetaQuestion(text) || isNonProductLookupQuery(text)) return false;
    if (NON_PRODUCT_QUESTION_PATTERN.test(text) && !PRODUCT_SIGNAL_WORDS.test(text)) return false;
    if (!hasValidProductSearchParams(mapped.searchParams)) return false;
  }

  if (
    (mapped.intent === 'conversational' || mapped.intent === 'greeting') &&
    hasProductQuerySignals(text) &&
    wantsProductBrowse(text)
  ) {
    return false;
  }

  return true;
}

async function buildCatalogStatsReply(text, context = {}, statsType = 'brands') {
  const facts = await getCatalogStatsFacts(statsType);
  const llmText = await supportChatLlm.ragReply(text, context, facts);
  if (llmText) {
    return { text: llmText, products: [], escalate: false };
  }

  const label =
    statsType === 'categories' ? 'categories' : statsType === 'subcategories' ? 'subcategories' : 'brands';
  const samples = facts.samples?.length ? facts.samples.slice(0, 8).join(', ') : 'N/A';
  return {
    text: [
      `Our live catalog has **${facts.count.toLocaleString()}** ${label}.`,
      facts.totalInStockModels
        ? `There are **${Number(facts.totalInStockModels).toLocaleString()}** in-stock product models indexed.`
        : '',
      samples !== 'N/A' ? `Examples: ${samples}.` : '',
      '',
      'Ask me to **search products**, **check a SKU**, or **show stock** for a keyword.',
    ]
      .filter(Boolean)
      .join('\n'),
    products: [],
    escalate: false,
  };
}

async function buildPolicyReply(text, context = {}) {
  const facts = await getCustomerPolicyFacts(context.customerId, context);
  const llmText = await supportChatLlm.ragReply(text, { ...context, retrievedFacts: facts }, facts);
  if (llmText) {
    return { text: llmText, products: [], escalate: false };
  }

  const stats = facts.statistics || {};
  const header = [
    'Here are **your assigned policies** for your role and store:',
    '',
    `• Total: **${stats.totalPolicies || 0}**`,
    `• Signed: **${stats.signedCount || 0}**`,
    `• Pending signature: **${stats.unsignedCount || 0}**`,
  ].join('\n');

  if (facts.unsignedPolicies?.length) {
    const pending = facts.unsignedPolicies.slice(0, 8).map(
      (p) => `• **${p.title}** (${p.policyType}, v${p.version}) — *pending*`,
    );
    return {
      text: [
        header,
        '',
        '**Pending your signature:**',
        ...pending,
        '',
        'Ask about a policy by name for a short summary, or say **connect to human** for help.',
      ].join('\n'),
      products: [],
      escalate: false,
    };
  }

  if (facts.signedPolicies?.length) {
    const signed = facts.signedPolicies.slice(0, 8).map(
      (p) => `• **${p.title}** (v${p.policyVersion || p.version}) — signed`,
    );
    return {
      text: [
        header,
        '',
        '**Signed policies:**',
        ...signed,
        '',
        'Ask about a specific policy title for more detail.',
      ].join('\n'),
      products: [],
      escalate: false,
    };
  }

  return {
    text: [
      'No policies are assigned to your **role and warehouse** right now.',
      '',
      'If you expected policies here, confirm your store selection in the marketplace, or say **connect to human**.',
    ].join('\n'),
    products: [],
    escalate: false,
  };
}

async function maybePolish(userMessage, payload) {
  if (!supportChatLlm.isPolishEnabled() || !payload?.factual) return payload.text;
  const polished = await supportChatLlm.polishResponse(userMessage, {
    ...payload.factual,
    draftText: payload.text,
  });
  return polished || payload.text;
}

async function processImageUpload(buffer, filename) {
  if (!aiImageSearch.isEnabled()) {
    return {
      text: 'Visual AI search is temporarily offline. You can still ask about stock by SKU or connect to a human agent.',
      imageAnalysis: null,
      products: [],
    };
  }

  const [analysisRes, searchRes] = await Promise.all([
    aiImageSearch.analyzeByImage(buffer, filename).catch(() => null),
    aiImageSearch.searchByImage(buffer, filename, SUPPORT_CHAT_IMAGE_MATCHES).catch(() => null),
  ]);

  const imageAnalysis = analysisRes?.imageAnalysis || searchRes?.imageAnalysis || null;
  const products = await enrichAiMatches(searchRes?.matches || [], SUPPORT_CHAT_IMAGE_MATCHES);

  const parts = [];
  if (imageAnalysis?.summary) parts.push(imageAnalysis.summary);
  else if (imageAnalysis?.detectedType) parts.push(`Detected type: **${imageAnalysis.detectedType}**.`);
  else parts.push('Image analyzed against live catalog index.');

  if (products.length) {
    const onHand = products.filter((p) => Number(p.totalInventory || 0) > 0).length;
    parts.push(
      `\n**${products.length}** visually similar SKU${products.length === 1 ? '' : 's'} found (${onHand} on hand). Warehouse quantities are included where available.`,
    );
  } else {
    parts.push('\nNo close visual matches found. Try an exact SKU lookup.');
  }

  return {
    text: parts.join(''),
    imageAnalysis,
    products,
  };
}

async function buildMetaReply(text, context = {}) {
  const llmText = await supportChatLlm.metaQuestionReply(text, context);
  if (llmText) {
    return { text: llmText, products: [], escalate: false };
  }

  return {
    text: [
      'I am **Valliani Marketplace Support AI** — I help with **live jewelry inventory**, not company biography.',
      '',
      'I can look up **SKU stock by warehouse**, **search products** (e.g. gold rings, birthstone jewelry), match **photos**, or **connect you to a human agent**.',
      '',
      'What would you like to check in inventory?',
    ].join('\n'),
    products: [],
    escalate: false,
  };
}

async function buildClarificationReply(text, context = {}) {
  const clarificationType = context.clarificationType || 'general';
  const llmText = await supportChatLlm.clarificationReply(text, {
    ...context,
    clarificationType,
  });
  if (llmText) {
    return { text: llmText, products: [], escalate: false };
  }

  if (clarificationType === 'warehouse') {
    return {
      text: [
        'I can show **warehouse-wise quantities**, but I need a **SKU** first.',
        '',
        'Try: **Check SKU 106322 warehouse wise** or **Find SKU 171884R all warehouses**.',
      ].join('\n'),
      products: [],
      escalate: false,
    };
  }

  return {
    text: [
      'I want to make sure I help correctly. Are you looking for:',
      '',
      '• **Product search** — e.g. "show gold rings"',
      '• **Stock count** — e.g. "how many birthstone rings available"',
      '• **SKU lookup** — e.g. "find SKU 106322"',
      '• **Human agent** — say **Connect to human**',
    ].join('\n'),
    products: [],
    escalate: false,
  };
}

async function getKeywordInventorySummary(searchParams, options = {}) {
  const includeProducts = options.includeProducts === true;
  await supportChatCatalogCache.ensureCatalogCache();
  const summary = supportChatCatalogCache.summarizeCachedCatalog(searchParams, 6);
  const scope = summary.displayQuery || 'catalog';

  const lines = [
    `Live inventory for **${scope}**:`,
    '',
    `• **${summary.totalModels.toLocaleString()}** in-stock product models`,
    `• **${summary.totalUnits.toLocaleString()}** total units`,
  ];

  if (includeProducts && summary.products.length) {
    lines.push('', 'Sample SKUs below — tap any card for details.');
  } else if (!summary.totalModels) {
    lines.push('', 'No in-stock items matched that keyword right now.');
  } else {
    lines.push('', 'Say **show me some SKUs** to list product cards.');
  }

  return {
    text: lines.join('\n'),
    products: includeProducts ? summary.products : [],
    factual: {
      type: 'inventory_summary',
      category: scope,
      stats: {
        productCount: summary.totalModels,
        totalUnits: summary.totalUnits,
      },
      includeProducts,
    },
  };
}

async function buildConversationalReply(text, context = {}) {
  const name = context.customerName || 'there';

  if (/^(yes|sure|ok|okay|yep)\b/i.test(String(text).trim())) {
    const lastAssistant = [...(context.recentMessages || [])]
      .reverse()
      .find((m) => m.role === 'assistant');
    const skuFromHistory =
      extractSkuFromQuery(lastAssistant?.text || '') ||
      (lastAssistant?.text?.match(/\b\d{5,6}\b/) || [])[0];
    if (skuFromHistory) {
      const result = await lookupSkuByCode(skuFromHistory, { includeWarehouseBreakdown: true });
      if (result) {
        return {
          text: await maybePolish(text, result),
          products: result.products,
          escalate: false,
        };
      }
    }
  }

  const llmText = await supportChatLlm.conversationalReply(text, {
    ...context,
    retrievedFacts: {
      customerName: context.customerName || null,
      canAnswerName: Boolean(context.customerName && context.customerName !== 'Customer'),
    },
  });
  if (llmText) {
    return { text: llmText, products: [], escalate: false };
  }

  return {
    text: [
      `Hello ${name}! How can I help you today?`,
      '',
      'I can check **SKU stock by warehouse**, **show product categories**, match **photos**, or **connect you to a human agent**.',
      '',
      'What would you like to look up?',
    ].join('\n'),
    products: [],
    escalate: false,
  };
}

function mapAnalysisToIntent(analysis, text) {
  if (!analysis?.intent) return null;

  const intentName = analysis.intent === 'product_browse' ? 'product_search' : analysis.intent;
  const sku =
    analysis.sku && isLikelySkuCode(analysis.sku) ? String(analysis.sku).trim() : extractSkuFromQuery(text);

  const searchParams = normalizeSearchParams({
    displayQuery: analysis.displayQuery || normalizeBrowseQuery(text),
    searchKeywords: analysis.searchKeywords || [],
    productTypes: analysis.productTypes || [],
    metalHints: analysis.metalHints || [],
    stoneHints: analysis.stoneHints || [],
    sortBy: analysis.sortBy || 'inventory_desc',
    rawQuery: text,
  }, text);

  if (intentName === 'sku_lookup' && sku) {
    return {
      intent: 'sku_lookup',
      sku,
      searchTerm: sku,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown:
        analysis.includeWarehouseBreakdown === true || wantsWarehouseBreakdown(text),
      includeProducts: true,
    };
  }

  if (intentName === 'meta_question' || isMetaQuestion(text)) {
    return {
      intent: 'meta_question',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if (intentName === 'catalog_stats') {
    return {
      intent: 'catalog_stats',
      statsType: analysis.statsType || detectCatalogStatsType(text),
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if (intentName === 'policy_info' || /\bpolic(?:y|ies)\b/i.test(text)) {
    return {
      intent: 'policy_info',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if (intentName === 'needs_clarification' || isWarehouseListWithoutSku(text)) {
    return {
      intent: 'needs_clarification',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      clarificationType: analysis.clarificationType || (isWarehouseListWithoutSku(text) ? 'warehouse' : 'general'),
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if ((intentName === 'product_search' || intentName === 'product_browse') && !isMetaQuestion(text)) {
    let finalParams = searchParams;
    if (!hasValidProductSearchParams(finalParams)) {
      const fallbackQuery = normalizeBrowseQuery(text);
      if (fallbackQuery) {
        const fallbackParams = normalizeSearchParams(
          {
            displayQuery: fallbackQuery,
            searchKeywords: tokenizeSearchQuery(fallbackQuery),
            productTypes: [categoryLabelToProductType(extractCategoryKeyword(text))].filter(Boolean),
            rawQuery: text,
          },
          text,
        );
        if (hasValidProductSearchParams(fallbackParams)) {
          finalParams = fallbackParams;
        }
      }
    }

    if (hasValidProductSearchParams(finalParams)) {
      return {
        intent: 'product_search',
        sku: null,
        searchTerm: finalParams.displayQuery,
        searchParams: finalParams,
        category:
          analysis.category ||
          extractCategoryKeyword(finalParams.displayQuery) ||
          extractCategoryKeyword(text),
        includeWarehouseBreakdown: false,
        includeProducts: true,
      };
    }
  }

  if (intentName === 'inventory_summary' || isKeywordInventoryQuestion(text)) {
    const invParams = hasValidProductSearchParams(searchParams)
      ? searchParams
      : extractInventorySearchParams(text);
    return {
      intent: 'inventory_summary',
      sku: null,
      searchTerm: invParams.displayQuery || null,
      searchParams: invParams,
      category: analysis.category || extractCategoryKeyword(text),
      includeWarehouseBreakdown: false,
      includeProducts:
        analysis.includeProducts === true ||
        /\b(show|some|sku|sample|list)\b/i.test(text),
    };
  }

  if (intentName === 'human_handoff') {
    return {
      intent: 'human_handoff',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if (intentName === 'greeting' || intentName === 'conversational') {
    return {
      intent: intentName,
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  return null;
}

async function resolveIntent(text, context = {}) {
  if (wantsHumanAgent(text)) {
    return {
      intent: 'human_handoff',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if (supportChatLlm.isAvailable()) {
    const analysis = await supportChatLlm.analyzeUserRequest(text, context);
    const mapped = mapAnalysisToIntent(analysis, text);
    if (mapped && shouldAcceptLlmIntent(mapped, text)) {
      return mapped;
    }
  }

  if (isMetaQuestion(text)) {
    return {
      intent: 'meta_question',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if (isWarehouseListWithoutSku(text)) {
    return {
      intent: 'needs_clarification',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      clarificationType: 'warehouse',
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if (isKeywordInventoryQuestion(text)) {
    const searchParams = extractInventorySearchParams(text);
    return {
      intent: 'inventory_summary',
      sku: null,
      searchTerm: searchParams.displayQuery || null,
      searchParams,
      category: extractCategoryKeyword(text),
      includeWarehouseBreakdown: false,
      includeProducts: /\b(show|some|sku|sample|list)\b/i.test(text),
    };
  }

  if (isNonProductLookupQuery(text)) {
    if (/\bpolic(?:y|ies)\b/i.test(text)) {
      return {
        intent: 'policy_info',
        sku: null,
        searchTerm: null,
        searchParams: null,
        category: null,
        includeWarehouseBreakdown: false,
        includeProducts: false,
      };
    }
    return {
      intent: 'catalog_stats',
      statsType: detectCatalogStatsType(text),
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  if (isConversationalMessage(text) && !hasProductQuerySignals(text)) {
    return {
      intent: 'conversational',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  const skuEarly = extractSkuFromQuery(text);
  if (skuEarly) {
    return {
      intent: 'sku_lookup',
      sku: skuEarly,
      searchTerm: skuEarly,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: wantsWarehouseBreakdown(text) || true,
      includeProducts: true,
    };
  }

  if (supportChatTaxonomy.isLiteralDescriptionQuery(text)) {
    const searchParams = normalizeSearchParams({ displayQuery: text, rawQuery: text }, text);
    return {
      intent: 'product_search',
      sku: null,
      searchTerm: text,
      searchParams,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: true,
    };
  }

  const browseQueryEarly = extractProductBrowseQuery(text);
  const browseParamsEarly = browseQueryEarly
    ? normalizeSearchParams(
        {
          displayQuery: browseQueryEarly,
          searchKeywords: tokenizeSearchQuery(browseQueryEarly),
          productTypes: [categoryLabelToProductType(extractCategoryKeyword(text))].filter(Boolean),
          sortBy: /\b(low\s+to\s+high|cheapest)\b/i.test(text) ? 'price_asc' : 'inventory_desc',
          rawQuery: text,
        },
        text,
      )
    : null;

  if (
    browseParamsEarly &&
    hasValidProductSearchParams(browseParamsEarly) &&
    !isNonProductLookupQuery(text) &&
    (wantsProductBrowse(text) ||
      isAvailabilityProductQuestion(text) ||
      isDirectProductKeywordQuery(text) ||
      supportChatTaxonomy.queryHasEarringTerm(text) ||
      supportChatTaxonomy.queryHasRingTerm(text))
  ) {
    return {
      intent: 'product_search',
      sku: null,
      searchTerm: browseParamsEarly.displayQuery,
      searchParams: browseParamsEarly,
      category: extractCategoryKeyword(text),
      includeWarehouseBreakdown: false,
      includeProducts: true,
    };
  }

  const sku = extractSkuFromQuery(text);
  if (sku) {
    return {
      intent: 'sku_lookup',
      sku,
      searchTerm: sku,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: wantsWarehouseBreakdown(text) || true,
      includeProducts: true,
    };
  }

  if (isExploratoryAvailabilityQuestion(text)) {
    const availabilityQuery = extractProductBrowseQuery(text);
    if (availabilityQuery && isAvailabilityProductQuestion(text)) {
      const searchParams = normalizeSearchParams({
        displayQuery: availabilityQuery,
        searchKeywords: tokenizeSearchQuery(availabilityQuery),
        productTypes: [categoryLabelToProductType(extractCategoryKeyword(availabilityQuery))].filter(
          Boolean,
        ),
        rawQuery: text,
      });
      return {
        intent: 'product_search',
        sku: null,
        searchTerm: availabilityQuery,
        searchParams,
        category: extractCategoryKeyword(availabilityQuery) || extractCategoryKeyword(text),
        includeWarehouseBreakdown: false,
        includeProducts: true,
      };
    }
    return {
      intent: 'inventory_summary',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: extractCategoryKeyword(text),
      includeWarehouseBreakdown: false,
      includeProducts: wantsProductBrowse(text),
    };
  }

  if (isCategoryInventoryQuestion(text)) {
    return {
      intent: 'inventory_summary',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: extractCategoryKeyword(text),
      includeWarehouseBreakdown: false,
      includeProducts: wantsProductBrowse(text),
    };
  }

  if (
    /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(text) &&
    !hasProductQuerySignals(text)
  ) {
    return {
      intent: 'greeting',
      sku: null,
      searchTerm: null,
      searchParams: null,
      category: null,
      includeWarehouseBreakdown: false,
      includeProducts: false,
    };
  }

  const searchTerm = extractSearchTerm(text);
  const searchParams = searchTerm ? normalizeSearchParams(searchTerm) : null;
  if (
    searchTerm &&
    searchParams &&
    hasValidProductSearchParams(searchParams) &&
    !isNonProductLookupQuery(text)
  ) {
    return {
      intent: 'product_search',
      sku: null,
      searchTerm,
      searchParams,
      category: null,
      includeWarehouseBreakdown: wantsWarehouseBreakdown(text),
      includeProducts: true,
    };
  }

  const forcedProductSearch = buildProductSearchIntentFromText(text);
  if (forcedProductSearch) {
    return forcedProductSearch;
  }

  return {
    intent: 'conversational',
    sku: null,
    searchTerm: null,
    searchParams: null,
    category: null,
    includeWarehouseBreakdown: false,
    includeProducts: false,
  };
}

async function processTextMessage(text, context = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return {
      text: 'How can I help you today? Ask about a SKU, category, or upload a product photo.',
      products: [],
      escalate: false,
    };
  }

  const intent = await resolveIntent(trimmed, context);

  if (intent.intent === 'human_handoff' || wantsHumanAgent(trimmed)) {
    return {
      text: 'Connecting you with a support specialist. Please stay in this chat.',
      products: [],
      escalate: true,
    };
  }

  if (intent.intent === 'meta_question') {
    return buildMetaReply(trimmed, context);
  }

  if (intent.intent === 'needs_clarification') {
    return buildClarificationReply(trimmed, {
      ...context,
      clarificationType: intent.clarificationType || 'general',
    });
  }

  if (intent.intent === 'catalog_stats') {
    return buildCatalogStatsReply(trimmed, context, intent.statsType || detectCatalogStatsType(trimmed));
  }

  if (intent.intent === 'policy_info') {
    return buildPolicyReply(trimmed, context);
  }

  if (intent.intent === 'conversational' || intent.intent === 'greeting') {
    return buildConversationalReply(trimmed, context);
  }

  if (intent.intent === 'sku_lookup' && intent.sku) {
    const result = await lookupSkuByCode(intent.sku, {
      includeWarehouseBreakdown: intent.includeWarehouseBreakdown !== false,
    });
    if (result) {
      return {
        text: await maybePolish(trimmed, result),
        products: result.products,
        escalate: false,
      };
    }
    return {
      text: `SKU **${intent.sku}** was not found in the catalog. Please verify the code or upload a product photo.`,
      products: [],
      escalate: false,
    };
  }

  if (intent.intent === 'inventory_summary') {
    const result =
      intent.searchParams && hasValidInventorySearchParams(intent.searchParams)
        ? await getKeywordInventorySummary(intent.searchParams, {
            includeProducts: intent.includeProducts === true,
          })
        : await getInventorySummary(intent.category, {
            includeProducts: intent.includeProducts === true,
          });
    return {
      text: await maybePolish(trimmed, result),
      products: result.products,
      escalate: false,
    };
  }

  const shouldSearchProducts =
    intent.intent === 'product_search' &&
    intent.searchParams &&
    hasValidProductSearchParams(intent.searchParams) &&
    !isMetaQuestion(trimmed);

  if (shouldSearchProducts) {
    const result = await searchCatalogProducts(
      intent.searchParams || intent.searchTerm,
    );
    const displayQuery =
      intent.searchParams?.displayQuery ||
      normalizeBrowseQuery(intent.searchTerm) ||
      intent.searchTerm;
    if (result.products.length) {
      return {
        text: await maybePolish(trimmed, result),
        products: result.products,
        productSearch: result.productSearch,
        escalate: false,
      };
    }
    if (isMetaQuestion(trimmed) || isWarehouseListWithoutSku(trimmed)) {
      return buildClarificationReply(trimmed, {
        ...context,
        clarificationType: isWarehouseListWithoutSku(trimmed) ? 'warehouse' : 'general',
      });
    }
    return {
      text: `I couldn't find in-stock products for **${displayQuery}**. Try a SKU, different keywords, or upload a photo.`,
      products: [],
      escalate: false,
    };
  }

  return buildClarificationReply(trimmed, { ...context, clarificationType: 'general' });
}

module.exports = {
  processTextMessage,
  processImageUpload,
  wantsHumanAgent,
  enrichAiMatches,
  lookupSkuByCode,
  searchCatalogProducts,
  loadMoreCatalogProducts,
  SUPPORT_CHAT_INITIAL_PRODUCTS,
  SUPPORT_CHAT_MORE_PRODUCTS,
  SUPPORT_CHAT_IMAGE_MATCHES,
  __test__: {
    resolveIntent,
    hasValidProductSearchParams,
    hasMeaningfulSearchKeywords,
    buildProductSearchIntentFromText,
    normalizeSearchParams,
  },
};
