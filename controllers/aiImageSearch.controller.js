const Product = require('../models/product.model');
const aiImageSearch = require('../services/aiImageSearch.service');

function productDisplayName(product, fallback) {
  return (
    product?.attributes?.descriptionname ||
    product?.attributes?.descriptionName ||
    product?.name ||
    fallback
  );
}

async function enrichSkuItems(items) {
  if (!items?.length) return items || [];
  const skus = [...new Set(items.map((m) => m.sku).filter(Boolean))];
  const products = await Product.find({ sku: { $in: skus } })
    .select('sku name attributes')
    .lean();
  const bySku = new Map(products.map((p) => [String(p.sku), p]));

  return items.map((item) => {
    const product = bySku.get(String(item.sku));
    return {
      ...item,
      nameSuggestion: productDisplayName(product, item.nameSuggestion),
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

    const topK = Math.min(50, Math.max(1, Number(req.query.top_k) || 12));
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
