const laravoService = require('../services/laravo.service');

function parseSearchParam(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const getActiveData = async (req, res) => {
  try {
    const data = await laravoService.getActiveData();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to fetch Laravo brands',
      laravoError: error.laravoBody || null,
    });
  }
};

const getBrandProducts = async (req, res) => {
  try {
    const { brandId } = req.params;
    const page = req.query.page;
    const limit = req.query.limit;
    const vendorId = req.query.vendorId;
    const search = parseSearchParam(req.query.search);

    const data = await laravoService.getBrandProducts(brandId, { page, limit, vendorId, search });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to fetch Laravo brand products',
      laravoError: error.laravoBody || null,
    });
  }
};

const getBrandProductTypeProducts = async (req, res) => {
  try {
    const { brandId, productTypeId } = req.params;
    const page = req.query.page;
    const limit = req.query.limit;
    const vendorId = req.query.vendorId;
    const search = parseSearchParam(req.query.search);

    const data = await laravoService.getBrandProductTypeProducts(brandId, productTypeId, {
      page,
      limit,
      vendorId,
      search,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to fetch Laravo products',
      laravoError: error.laravoBody || null,
    });
  }
};

const getProductById = async (req, res) => {
  try {
    const { brandId, productId } = req.params;
    const productTypeId = req.query.productTypeId;
    const vendorId = req.query.vendorId;

    const data = await laravoService.getProductById(brandId, productId, {
      productTypeId,
      vendorId,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to fetch Laravo product',
      laravoError: error.laravoBody || null,
    });
  }
};

module.exports = {
  getActiveData,
  getBrandProducts,
  getBrandProductTypeProducts,
  getProductById,
};
