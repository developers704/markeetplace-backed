const aiImageSearch = require('../services/aiImageSearch.service');

/** Debounced incremental FAISS index after product images change. */
function notifyProductImagesChanged() {
  try {
    aiImageSearch.notifyProductImagesChanged();
  } catch (err) {
    console.warn('[ai-image-search] notify failed:', err.message);
  }
}

module.exports = { notifyProductImagesChanged };
