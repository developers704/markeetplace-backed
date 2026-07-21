/**
 * Category / subcategory / brand taxonomy for support-chat search.
 * Loaded from MongoDB on catalog rebuild — matches user text to exact catalog structure.
 */
const { Category, SubCategory } = require('../models/productCategory.model');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC_TAXONOMY_TERMS = new Set([
  'solitaire',
  'diamond',
  'diamonds',
  'gold',
  'silver',
  'platinum',
  'stone',
  'stones',
  'loose',
  'stud',
  'studs',
  'certified',
  'natural',
  'jewelry',
  'jewellery',
  'earring',
  'earrings',
  'ring',
  'rings',
  'chain',
  'chains',
  'necklace',
  'necklaces',
  'bracelet',
  'bracelets',
  'pendant',
  'pendants',
  'watch',
  'watches',
]);

const LITERAL_QUERY_STOP_TOKENS = new Set([
  'show',
  'find',
  'search',
  'please',
  'some',
  'sku',
  'many',
  'how',
  'available',
  'me',
  'my',
  'the',
  'and',
  'or',
  'for',
  'you',
  'have',
  'got',
  'any',
  'all',
  'list',
  'display',
  'give',
]);

function isLiteralDescriptionQuery(query) {
  const raw = String(query || '').trim();
  if (!raw || raw.length < 8) return false;
  if (/\b(show\s+me|find\s+me|do\s+you\s+have|how\s+many|how\s+much)\b/i.test(raw)) return false;

  const signals = [
    /\b\d{1,2}\s*kt\b/i,
    /\b(gia|agi|egl|igi|certified|cert)\b/i,
    /["'`]/,
    /\b(solitaire|stud|studs|vermeil|lab[\s-]?grown|birthstone)\b/i,
    /\bER-[A-Z0-9]/i,
  ];
  const signalCount = signals.filter((rx) => rx.test(raw)).length;
  if (signalCount >= 2) return true;
  return signalCount >= 1 && /\b(certified|solitaire|stud|studs)\b/i.test(raw);
}

function extractLiteralSearchTokens(query) {
  return normalizeText(query)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !LITERAL_QUERY_STOP_TOKENS.has(t));
}

function buildLiteralSearchParams(base, rawQuery) {
  const raw = String(rawQuery || '').trim();
  const tokens = extractLiteralSearchTokens(raw);
  const mergedBase = base && typeof base === 'object' && !Array.isArray(base) ? base : {};

  return {
    ...mergedBase,
    displayQuery: raw,
    rawSearchPhrase: raw,
    searchKeywords: tokens.length ? tokens : extractLiteralSearchTokens(raw),
    productTypes: [],
    brandHints: [],
    categoryIds: [],
    subcategoryIds: [],
    subcategoryNames: [],
    categoryNames: [],
    explicitSubcategoryFilter: false,
    literalDescriptionSearch: true,
    taxonomyResolved: false,
    sortBy: mergedBase.sortBy && mergedBase.sortBy !== 'inventory_desc' ? mergedBase.sortBy : 'relevance',
  };
}

function descriptionMatchesQuery(raw, description) {
  const q = normalizeText(raw);
  const d = normalizeText(description);
  if (!d || !q) return false;

  if (d.includes(' ') && q.includes(d)) return true;

  const words = d.split(' ').filter((w) => w.length >= 3);
  if (!words.length) return false;
  if (words.some((w) => GENERIC_TAXONOMY_TERMS.has(w))) return false;
  return words.every((w) => q.includes(w));
}

function fixQueryTypos(query) {
  return String(query || '')
    .replace(/\byear\s+rings?\b/gi, 'earrings')
    .replace(/\byearring\b/gi, 'earring')
    .replace(/\byearrings\b/gi, 'earrings');
}

function deriveProductTypeFromLabel(label) {
  const n = String(label || '').toUpperCase();
  if (/\bEARRINGS?\b/.test(n) || /\bHOOPS?\b/.test(n) || /\bSTUDS?\b/.test(n)) return 'earring';
  if (/\bCHAINS?\b/.test(n)) return 'chain';
  if (/\bNECKLACES?\b/.test(n)) return 'necklace';
  if (/\bBRACELETS?\b/.test(n) || /\bBANGLES?\b/.test(n)) return 'bracelet';
  if (/\bPENDANTS?\b/.test(n)) return 'pendant';
  if (/\bWATCH/.test(n) || /\bROLEX\b/.test(n) || /\bMOVADO\b/.test(n) || /\bBULOVA\b/.test(n)) {
    return 'watch';
  }
  if (/(?<![EA])\bRINGS?\b/.test(n) || /\bBAND\b/.test(n) || /\bTRIO\b/.test(n)) return 'ring';
  return null;
}

function queryHasRingTerm(query) {
  return /(?<![ea])\brings?\b/i.test(query) && !/\bearrings?\b/i.test(query);
}

function queryHasEarringTerm(query) {
  return /\bearrings?\b/i.test(query);
}

function termMatchesQuery(query, term) {
  const q = normalizeText(query);
  const t = normalizeText(term);
  if (!t) return false;

  if (t.includes(' ')) {
    return q.includes(t);
  }

  if (t === 'ring' || t === 'rings') {
    return queryHasRingTerm(q);
  }
  if (t === 'earring' || t === 'earrings') {
    return queryHasEarringTerm(q);
  }

  return new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(q);
}

let taxonomy = {
  categories: [],
  subcategories: [],
  brands: [],
  loadedAt: null,
};

function getTaxonomy() {
  return taxonomy;
}

function isTaxonomyLoaded() {
  return taxonomy.categories.length > 0;
}

async function loadTaxonomyFromDb(extraBrands = []) {
  const [categories, subcategories] = await Promise.all([
    Category.find({ isDeleted: { $ne: true } })
      .select('_id name description')
      .lean(),
    SubCategory.find({ isDeleted: { $ne: true } })
      .select('_id name description parentCategory')
      .lean(),
  ]);

  const categoryMap = new Map(categories.map((c) => [String(c._id), c]));
  const enrichedSubs = subcategories.map((sub) => {
    const parent = categoryMap.get(String(sub.parentCategory));
    return {
      _id: String(sub._id),
      name: sub.name || '',
      description: sub.description || '',
      parentCategoryId: String(sub.parentCategory || ''),
      parentCategoryName: parent?.name || '',
      productType: deriveProductTypeFromLabel(sub.name),
      searchTerms: buildTermList(sub.name, sub.description, parent?.name),
    };
  });

  const enrichedCats = categories.map((cat) => ({
    _id: String(cat._id),
    name: cat.name || '',
    description: cat.description || '',
    productType: deriveProductTypeFromLabel(cat.name),
    searchTerms: buildTermList(cat.name, cat.description),
  }));

  const brandSet = new Set(
    extraBrands.map((b) => String(b || '').trim().toUpperCase()).filter(Boolean),
  );

  taxonomy = {
    categories: enrichedCats,
    subcategories: enrichedSubs,
    brands: [...brandSet].sort(),
    loadedAt: new Date().toISOString(),
  };

  return taxonomy;
}

function loadTaxonomyFromPayload(payload) {
  if (!payload || !Array.isArray(payload.categories)) return false;
  taxonomy = payload;
  return true;
}

function buildTermList(...parts) {
  const terms = new Set();
  for (const part of parts) {
    const raw = String(part || '').trim();
    if (!raw) continue;
    terms.add(normalizeText(raw));
    raw
      .split(/[\s/,-]+/)
      .map((t) => normalizeText(t))
      .filter((t) => t.length >= 2)
      .forEach((t) => terms.add(t));
  }
  return [...terms];
}

function isExplicitSubcategoryQuery(raw, matchedSubcategories) {
  const q = normalizeText(fixQueryTypos(raw));
  return matchedSubcategories.some((sub) => {
    const name = normalizeText(sub.name);
    if (!name || name === 'earrings' || name === 'rings') return false;
    if (name.includes(' ') && q.includes(name)) return true;
    const words = name.split(' ').filter((w) => w.length >= 4 && !['earrings', 'rings', 'gold', 'silver'].includes(w));
    return words.length > 0 && words.every((w) => q.includes(w));
  });
}

function resolveQueryToFilters(query) {
  const raw = fixQueryTypos(String(query || '').trim());
  const normalized = normalizeText(raw);
  if (!normalized) {
    return emptyFilters();
  }

  const matchedCategories = [];
  const matchedSubcategories = [];
  const matchedBrands = [];
  const consumedTerms = new Set();

  for (const cat of taxonomy.categories) {
    const hit =
      termMatchesQuery(raw, cat.name) ||
      descriptionMatchesQuery(raw, cat.description) ||
      cat.searchTerms.some((t) => t.length >= 4 && !GENERIC_TAXONOMY_TERMS.has(t) && termMatchesQuery(raw, t));
    if (hit) {
      matchedCategories.push(cat);
      cat.searchTerms.forEach((t) => consumedTerms.add(t));
    }
  }

  const subsSorted = [...taxonomy.subcategories].sort(
    (a, b) => b.name.length - a.name.length,
  );

  for (const sub of subsSorted) {
    const hit =
      termMatchesQuery(raw, sub.name) ||
      descriptionMatchesQuery(raw, sub.description) ||
      sub.searchTerms.some(
        (t) => t.length >= 4 && !GENERIC_TAXONOMY_TERMS.has(t) && termMatchesQuery(raw, t),
      );
    if (hit) {
      matchedSubcategories.push(sub);
      sub.searchTerms.forEach((t) => consumedTerms.add(t));
    }
  }

  if (queryHasEarringTerm(raw)) {
    taxonomy.subcategories
      .filter((s) => s.productType === 'earring')
      .forEach((s) => {
        if (!matchedSubcategories.some((m) => m._id === s._id)) matchedSubcategories.push(s);
      });
  }

  if (queryHasRingTerm(raw)) {
    taxonomy.subcategories
      .filter((s) => s.productType === 'ring')
      .forEach((s) => {
        if (!matchedSubcategories.some((m) => m._id === s._id)) matchedSubcategories.push(s);
      });
  }

  const explicitSubcategoryFilter = isExplicitSubcategoryQuery(raw, matchedSubcategories);

  for (const brand of taxonomy.brands) {
    if (termMatchesQuery(raw, brand)) {
      matchedBrands.push(brand);
      consumedTerms.add(normalizeText(brand));
    }
  }

  const productTypes = [
    ...new Set(
      matchedSubcategories.map((s) => s.productType).filter(Boolean),
    ),
  ];

  if (!productTypes.length) {
    if (queryHasEarringTerm(raw)) productTypes.push('earring');
    if (queryHasRingTerm(raw)) productTypes.push('ring');
    if (/\bchains?\b/i.test(raw)) productTypes.push('chain');
    if (/\bbracelets?\b/i.test(raw)) productTypes.push('bracelet');
    if (/\bpendants?\b/i.test(raw)) productTypes.push('pendant');
    if (/\bwatch/.test(raw)) productTypes.push('watch');
  }

  const searchKeywords = normalized
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !consumedTerms.has(t))
    .filter(
      (t) =>
        !['show', 'find', 'search', 'please', 'some', 'sku', 'many', 'how', 'available', 'me', 'my'].includes(
          t,
        ),
    );

  let displayQuery = raw;
  if (explicitSubcategoryFilter && matchedSubcategories.length) {
    displayQuery = matchedSubcategories.map((s) => s.name).slice(0, 2).join(' / ');
  } else if (queryHasEarringTerm(raw)) {
    displayQuery = 'earrings';
  } else if (queryHasRingTerm(raw)) {
    displayQuery = 'rings';
  } else if (matchedCategories.length) {
    displayQuery = matchedCategories.map((c) => c.name).join(' / ');
  }

  return {
    categoryIds: [...new Set(matchedCategories.map((c) => c._id))],
    categoryNames: matchedCategories.map((c) => c.name),
    subcategoryIds: [...new Set(matchedSubcategories.map((s) => s._id))],
    subcategoryNames: matchedSubcategories.map((s) => s.name),
    brandHints: matchedBrands,
    productTypes,
    searchKeywords,
    explicitSubcategoryFilter,
    displayQuery,
  };
}

function emptyFilters() {
  return {
    categoryIds: [],
    categoryNames: [],
    subcategoryIds: [],
    subcategoryNames: [],
    brandHints: [],
    productTypes: [],
    searchKeywords: [],
    explicitSubcategoryFilter: false,
    displayQuery: '',
  };
}

function enrichSearchParams(params, rawQuery) {
  const raw = String(rawQuery || params?.displayQuery || '').trim();
  if (isLiteralDescriptionQuery(raw)) {
    return buildLiteralSearchParams(params, raw);
  }

  const filters = resolveQueryToFilters(raw);
  const base = params && typeof params === 'object' ? params : { displayQuery: raw };

  const mergedKeywords = [
    ...new Set([...(base.searchKeywords || []), ...filters.searchKeywords]),
  ].filter(Boolean);

  const mergedTypes = [...new Set([...(base.productTypes || []), ...filters.productTypes])].filter(
    Boolean,
  );

  const displayQuery = filters.explicitSubcategoryFilter && filters.subcategoryNames.length
    ? filters.subcategoryNames.slice(0, 2).join(' / ')
    : filters.displayQuery || base.displayQuery || String(rawQuery || '');

  const useExplicitTaxonomy = filters.explicitSubcategoryFilter === true;

  return {
    ...base,
    displayQuery,
    searchKeywords: mergedKeywords,
    productTypes: mergedTypes,
    brandHints: [...new Set([...(base.brandHints || []), ...filters.brandHints])],
    categoryIds: useExplicitTaxonomy ? filters.categoryIds : [],
    categoryNames: filters.categoryNames,
    subcategoryIds: useExplicitTaxonomy ? filters.subcategoryIds : [],
    subcategoryNames: useExplicitTaxonomy ? filters.subcategoryNames : [],
    explicitSubcategoryFilter: useExplicitTaxonomy,
    taxonomyResolved:
      useExplicitTaxonomy ||
      mergedTypes.length > 0 ||
      filters.categoryIds.length > 0 ||
      filters.subcategoryIds.length > 0 ||
      filters.brandHints.length > 0,
  };
}

function extractCategoryKeyword(text) {
  const filters = resolveQueryToFilters(text);
  if (filters.subcategoryNames.length) {
    const type = filters.productTypes[0];
    const map = {
      ring: 'rings',
      earring: 'earrings',
      chain: 'necklaces',
      necklace: 'necklaces',
      bracelet: 'bracelets',
      watch: 'watches',
      pendant: 'necklaces',
    };
    return map[type] || filters.subcategoryNames[0].toLowerCase();
  }
  if (filters.categoryNames.length) {
    return filters.categoryNames[0].toLowerCase();
  }

  const lower = normalizeText(text);
  if (queryHasEarringTerm(lower)) return 'earrings';
  if (queryHasRingTerm(lower)) return 'rings';
  if (/\bchains?\b/.test(lower)) return 'necklaces';
  if (/\bbracelets?\b/.test(lower)) return 'bracelets';
  if (/\bwatch/.test(lower)) return 'watches';
  if (/\bdiamonds?\b/.test(lower)) return 'diamond jewelry';
  return null;
}

module.exports = {
  loadTaxonomyFromDb,
  loadTaxonomyFromPayload,
  getTaxonomy,
  isTaxonomyLoaded,
  resolveQueryToFilters,
  enrichSearchParams,
  extractCategoryKeyword,
  deriveProductTypeFromLabel,
  queryHasRingTerm,
  queryHasEarringTerm,
  fixQueryTypos,
  isLiteralDescriptionQuery,
  extractLiteralSearchTokens,
  normalizeText,
};
