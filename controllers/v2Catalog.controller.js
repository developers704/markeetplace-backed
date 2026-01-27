const mongoose = require('mongoose');

const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model');

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parseMulti = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const toLooseEqualsRegex = (value) => {
  const parts = String(value || '')
    .trim()
    .split(/[-_\s]+/g)
    .filter(Boolean);
  if (!parts.length) return null;
  const pattern = parts.map(escapeRegex).join('[-\\s_]+');
  return new RegExp(`^${pattern}$`, 'i');
};

/**
 * GET /api/v2/products
 *
 * Returns Vendor-Model based listings:
 * - vendorModel
 * - title
 * - default SKU image
 * - total inventory (sum of all SKUs)
 *
 * Query params:
 * - page (default 1)
 * - limit (default 20, max 100)
 * - search (optional)
 * - brand (optional)
 * - category (optional)
 */
const listVendorProducts = async (req, res) => {
  try {
    // Support both page-based and cursor-based pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const cursor = req.query.cursor || req.query.lastProductId; // Cursor: last product ID
    const skip = cursor ? 0 : (page - 1) * limit; // Only use skip for page-based

    const search = String(req.query.search || '').trim();
    const brandRaw = req.query.brand;
    const categoryRaw = req.query.category;
    const subcategoryRaw = req.query.subcategory;
    const subsubcategoryRaw = req.query.subsubcategory;
    const minPrice = parseFloat(req.query.minPrice) || null;
    const maxPrice = parseFloat(req.query.maxPrice) || null;

    const match = {};
    const brandValues = parseMulti(brandRaw);
    const categoryValues = parseMulti(categoryRaw);

    // Brand filtering (string-based)
    if (brandValues.length === 1) {
      match.brand = toLooseEqualsRegex(brandValues[0]);
    } else if (brandValues.length > 1) {
      match.brand = { $in: brandValues.map(toLooseEqualsRegex).filter(Boolean) };
    }

    // Category filtering - support both ObjectId and string
    if (categoryRaw) {
      if (mongoose.Types.ObjectId.isValid(categoryRaw)) {
        // If it's a valid ObjectId, search by ObjectId or category name
        const category = await Category.findById(categoryRaw);
        if (category) {
          // Use $or only if not already set
          if (!match.$or) {
            match.$or = [];
          }
          // Add category matching conditions
          const categoryConditions = [
            { category: category._id },
            { category: category.name }
          ];
          // If there are existing $or conditions, combine them
          if (match.$or.length > 0) {
            match.$and = [
              { $or: match.$or },
              { $or: categoryConditions }
            ];
            delete match.$or;
          } else {
            match.$or = categoryConditions;
          }
        }
      } else {
        // String-based category search (legacy)
        if (categoryValues.length === 1) {
          match.category = toLooseEqualsRegex(categoryValues[0]);
        } else if (categoryValues.length > 1) {
          match.category = { $in: categoryValues.map(toLooseEqualsRegex).filter(Boolean) };
        }
      }
    }

    // Subcategory filtering (ObjectId only)
    if (subcategoryRaw) {
      if (mongoose.Types.ObjectId.isValid(subcategoryRaw)) {
        match.subcategory = new mongoose.Types.ObjectId(subcategoryRaw);
      }
    }

    // Sub-subcategory filtering (ObjectId only)
    if (subsubcategoryRaw) {
      if (mongoose.Types.ObjectId.isValid(subsubcategoryRaw)) {
        match.subsubcategory = new mongoose.Types.ObjectId(subsubcategoryRaw);
      }
    }

    // Price range filter - will be applied after calculating minPrice/maxPrice
    const priceFilterConditions = [];
    if (minPrice !== null && !isNaN(minPrice) && minPrice > 0) {
      priceFilterConditions.push({ minPrice: { $gte: minPrice } });
    }
    if (maxPrice !== null && !isNaN(maxPrice) && maxPrice > 0) {
      priceFilterConditions.push({ maxPrice: { $lte: maxPrice } });
    }

    // Search: vendorModel, title, brand, category, and SKU
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      const searchConditions = [
        { vendorModel: searchRegex },
        { title: searchRegex },
        { brand: searchRegex },
        { category: searchRegex },
      ];

      // Also search in SKUs - find SKUs matching search, then match products
      const matchingSkus = await Sku.find({ sku: searchRegex }).select('productId').lean();
      if (matchingSkus.length > 0) {
        const productIds = matchingSkus.map((s) => s.productId).filter(Boolean);
        if (productIds.length > 0) {
          searchConditions.push({ _id: { $in: productIds } });
        }
      }

      // Combine search with existing $or if present
      if (match.$or) {
        // If $or already exists (from category filter), use $and
        if (match.$and) {
          match.$and.push({ $or: searchConditions });
        } else {
          match.$and = [
            { $or: match.$or },
            { $or: searchConditions }
          ];
          delete match.$or;
        }
      } else {
        match.$or = searchConditions;
      }
    }

    // If cursor is provided, add cursor-based filtering
    // Cursor is the last product's _id from previous page
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      // We'll filter after sorting, so we add it to the pipeline later
      // For now, just mark that we're using cursor-based pagination
    }

    const pipeline = [
      { $match: match },
      // Apply cursor filter before sorting for better performance
      ...(cursor && mongoose.Types.ObjectId.isValid(cursor)
        ? [
            {
              $match: {
                _id: { $gt: new mongoose.Types.ObjectId(cursor) },
              },
            },
          ]
        : []),
      { $sort: { updatedAt: -1, createdAt: -1, _id: 1 } },
      {
        $facet: {
          data: [
            ...(cursor ? [] : [{ $skip: skip }]), // Skip only for page-based
            { $limit: limit + 1 }, // Fetch one extra to check if there's a next page
            {
              $lookup: {
                from: 'skus',
                localField: 'defaultSku',
                foreignField: '_id',
                as: 'defaultSkuDoc',
              },
            },
            { $unwind: { path: '$defaultSkuDoc', preserveNullAndEmptyArrays: true } },
            {
              // Pull SKUs for this vendor product (only _id + price needed for ranges)
              $lookup: {
                from: 'skus',
                let: { pid: '$_id' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$productId', '$$pid'] } } },
                  { $project: { _id: 1, price: 1, sku: 1,currency: 1, images: 1, gallery: 1, metalColor: 1, metalType: 1, size: 1, attributes: 1, } },
                ],
                as: 'skuDocs',
              },
            },
            {
              $lookup: {
                from: 'skuinventories',
                let: { skuIds: '$skuDocs._id' },
                pipeline: [
                  { $match: { $expr: { $in: ['$skuId', '$$skuIds'] } } },
                  { $group: { _id: null, totalQty: { $sum: '$quantity' } } },
                ],
                as: 'inventoryAgg',
              },
            },
            {
              $addFields: {
                totalInventory: { $ifNull: [{ $first: '$inventoryAgg.totalQty' }, 0] },
                minPrice: { $ifNull: [{ $min: '$skuDocs.price' }, 0] },
                maxPrice: { $ifNull: [{ $max: '$skuDocs.price' }, 0] },
                skuCount: { $size: '$skuDocs' },
              },
            },
            // Apply price range filter after calculating minPrice/maxPrice
            ...(priceFilterConditions.length > 0
              ? [
                  {
                    $match: {
                      $and: priceFilterConditions,
                    },
                  },
                ]
              : []),
            {
              $lookup: {
                from: 'subcategories',
                localField: 'subcategory',
                foreignField: '_id',
                as: 'subcategoryDoc'
              }
            },
            {
              $lookup: {
                from: 'subsubcategories',
                localField: 'subsubcategory',
                foreignField: '_id',
                as: 'subsubcategoryDoc'
              }
            },
            {
              $project: {
                vendorModel: 1,
                title: 1,
                brand: 1,
                category: 1, // Will be populated in post-processing
                subcategory: { $ifNull: [{ $first: '$subcategoryDoc' }, null] },
                subsubcategory: { $ifNull: [{ $first: '$subsubcategoryDoc' }, null] },
                description: 1,
                createdAt: 1,
                updatedAt: 1,
                skuCount: 1,
                totalInventory: 1,
                minPrice: 1,
                maxPrice: 1,
                defaultSku: {
                  _id: '$defaultSkuDoc._id',
                  sku: '$defaultSkuDoc.sku',
                  price: '$defaultSkuDoc.price',
                  currency: '$defaultSkuDoc.currency',
                  images: '$defaultSkuDoc.images',
                  gallery: '$defaultSkuDoc.gallery',
                  metalColor: '$defaultSkuDoc.metalColor',
                  metalType: '$defaultSkuDoc.metalType',
                  size: '$defaultSkuDoc.size',
                  attributes: '$defaultSkuDoc.attributes',
                },
                // skus: '$skuDocs',
              },
            },
          ],
          meta: [{ $count: 'total' }],
        },
      },
    ];

    const agg = await VendorProduct.aggregate(pipeline);
    let data = agg?.[0]?.data || [];
    const total = agg?.[0]?.meta?.[0]?.total || 0;
    
    // For cursor-based pagination, check if we have more items
    let hasNextPage = false;
    let nextCursor = null;
    
    if (cursor) {
      // If we fetched limit + 1, we have a next page
      if (data.length > limit) {
        hasNextPage = true;
        data = data.slice(0, limit); // Remove the extra item
      }
      // Set next cursor to the last item's ID
      if (data.length > 0) {
        nextCursor = data[data.length - 1]._id.toString();
      }
    } else {
      // Page-based pagination
      const totalPages = Math.max(1, Math.ceil(total / limit));
      hasNextPage = page < totalPages;
    }

    return res.status(200).json({
      success: true,
      message: 'Vendor products retrieved successfully',
      data,
      paginatorInfo: {
        page: cursor ? null : page,
        limit,
        total: cursor ? null : total, // Don't return total for cursor-based (expensive)
        totalPages: cursor ? null : Math.max(1, Math.ceil(total / limit)),
        hasNextPage,
        hasPrevPage: cursor ? null : page > 1,
        nextPage: cursor ? null : (hasNextPage ? page + 1 : null),
        prevPage: cursor ? null : (page > 1 ? page - 1 : null),
        nextCursor, // Cursor for next page
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor products', error: error.message });
  }
};

/**
 * GET /api/v2/products/:id
 *
 * Returns vendor product details:
 * - vendorModel
 * - SKU list
 * - default SKU details
 * - available colors/sizes/metalTypes
 */
const getVendorProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const vendorProduct = await VendorProduct.findById(id)
      .populate('subcategory', 'name _id image description')
      .populate('subsubcategory', 'name _id image description')
      .lean();
    
    if (!vendorProduct) {
      return res.status(404).json({ success: false, message: 'Vendor product not found' });
    }

    // Populate category (can be ObjectId or string)
    if (vendorProduct.category) {
      if (mongoose.Types.ObjectId.isValid(vendorProduct.category)) {
        const category = await Category.findById(vendorProduct.category)
          .select('_id name image description')
          .lean();
        if (category) {
          vendorProduct.category = category;
        }
      } else if (typeof vendorProduct.category === 'string') {
        const category = await Category.findOne({ name: vendorProduct.category })
          .select('_id name image description')
          .lean();
        if (category) {
          vendorProduct.category = category;
        }
      }
    }

    const skus = await Sku.find({ productId: vendorProduct._id, isActive: true })
      .sort({ createdAt: 1 })
      .lean();

    const skuIds = skus.map((s) => s._id);

    const inventoryAgg = skuIds.length
      ? await SkuInventory.aggregate([
          { $match: { skuId: { $in: skuIds } } },
          { $group: { _id: '$skuId', totalQty: { $sum: '$quantity' } } },
        ])
      : [];

    const qtyBySku = new Map(inventoryAgg.map((x) => [String(x._id), x.totalQty]));
    const skusWithQty = skus.map((s) => ({ ...s, totalQuantity: qtyBySku.get(String(s._id)) || 0 }));

    const unique = (arr) => [...new Set(arr.filter((v) => String(v || '').trim() !== ''))];
    const availableColors = unique(skusWithQty.map((s) => s.metalColor));
    const availableSizes = unique(skusWithQty.map((s) => s.size));
    const availableMetalTypes = unique(skusWithQty.map((s) => s.metalType));

    const optionMatrix = {};
    for (const s of skusWithQty) {
      const color = String(s.metalColor || '').trim();
      const metalType = String(s.metalType || '').trim();
      const size = String(s.size || '').trim();
      if (!color && !metalType && !size) continue;
      if (!optionMatrix[color]) optionMatrix[color] = {};
      if (!optionMatrix[color][metalType]) optionMatrix[color][metalType] = [];
      if (size && !optionMatrix[color][metalType].includes(size)) {
        optionMatrix[color][metalType].push(size);
      }
    }

    const defaultSkuId = vendorProduct.defaultSku ? String(vendorProduct.defaultSku) : skusWithQty[0]?._id?.toString();
    const defaultSku = defaultSkuId ? skusWithQty.find((s) => String(s._id) === String(defaultSkuId)) : null;
    const totalInventory = skusWithQty.reduce((sum, s) => sum + (s.totalQuantity || 0), 0);

    return res.status(200).json({
      success: true,
      message: 'Vendor product retrieved successfully',
      data: {
        product: {
          ...vendorProduct,
          skuCount: skusWithQty.length,
          totalInventory,
        },
        defaultSku,
        skus: skusWithQty,
        availableColors,
        availableSizes,
        availableMetalTypes,
        optionMatrix,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor product', error: error.message });
  }
};

/**
 * GET /api/v2/skus/:skuId
 *
 * Returns SKU selection data:
 * - price
 * - images
 * - inventory (warehouse/city quantities)
 * - attributes
 */
const getSkuById = async (req, res) => {
  try {
    const { skuId } = req.params;
    if (!mongoose.isValidObjectId(skuId)) {
      return res.status(400).json({ success: false, message: 'Invalid sku id' });
    }

    const sku = await Sku.findById(skuId).populate('productId', 'vendorModel title brand category').lean();
    if (!sku) {
      return res.status(404).json({ success: false, message: 'SKU not found' });
    }

    const inventories = await SkuInventory.find({ skuId: sku._id })
      .populate('warehouse', 'name')
      .populate('city', 'name')
      .lean();

    const totalQuantity = inventories.reduce((sum, inv) => sum + (inv.quantity || 0), 0);

    return res.status(200).json({
      success: true,
      message: 'SKU retrieved successfully',
      data: {
        sku,
        inventories,
        totalQuantity,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch SKU', error: error.message });
  }
};

/**
 * PUT /api/v2/products/:id
 * Update vendor product
 */
const updateVendorProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const { title, brand, category, description, vendorModel } = req.body || {};

    const vendorProduct = await VendorProduct.findById(id);
    if (!vendorProduct) {
      return res.status(404).json({ success: false, message: 'Vendor product not found' });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = String(title).trim();
    if (brand !== undefined) updateData.brand = String(brand).trim();
    if (category !== undefined) updateData.category = String(category).trim();
    if (description !== undefined) updateData.description = String(description).trim();
    if (vendorModel !== undefined) {
      updateData.vendorModel = String(vendorModel).trim();
      // vendorModelKey will be auto-updated by pre-validate hook
    }

    Object.assign(vendorProduct, updateData);
    await vendorProduct.save();

    return res.status(200).json({
      success: true,
      message: 'Vendor product updated successfully',
      data: vendorProduct,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update vendor product', error: error.message });
  }
};

/**
 * DELETE /api/v2/skus/:skuId
 * Delete a single SKU and its inventory
 */
const deleteSku = async (req, res) => {
  try {
    const { skuId } = req.params;
    if (!mongoose.isValidObjectId(skuId)) {
      return res.status(400).json({ success: false, message: 'Invalid SKU id' });
    }

    const sku = await Sku.findById(skuId);
    if (!sku) {
      return res.status(404).json({ success: false, message: 'SKU not found' });
    }

    const productId = sku.productId;

    // Delete SKU inventory
    await SkuInventory.deleteMany({ skuId: sku._id });

    // Delete SKU
    await Sku.findByIdAndDelete(skuId);

    // Update vendor product: remove SKU from skuIds array
    const vendorProduct = await VendorProduct.findById(productId);
    if (vendorProduct) {
      vendorProduct.skuIds = vendorProduct.skuIds.filter((id) => String(id) !== String(skuId));
      
      // If deleted SKU was defaultSku, set first available SKU as default
      if (String(vendorProduct.defaultSku) === String(skuId)) {
        const remainingSkus = await Sku.find({ productId: vendorProduct._id, isActive: true })
          .sort({ createdAt: 1 })
          .limit(1)
          .select('_id')
          .lean();
        vendorProduct.defaultSku = remainingSkus[0]?._id || null;
      }
      
      await vendorProduct.save();
    }

    return res.status(200).json({
      success: true,
      message: 'SKU deleted successfully',
      data: { skuId, productId },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete SKU', error: error.message });
  }
};

/**
 * DELETE /api/v2/products/:id
 * Delete complete vendor product (all SKUs and inventory)
 */
const deleteVendorProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const vendorProduct = await VendorProduct.findById(id);
    if (!vendorProduct) {
      return res.status(404).json({ success: false, message: 'Vendor product not found' });
    }

    // Get all SKUs for this product
    const skus = await Sku.find({ productId: id }).select('_id').lean();
    const skuIds = skus.map((s) => s._id);

    // Delete all SKU inventory
    if (skuIds.length > 0) {
      await SkuInventory.deleteMany({ skuId: { $in: skuIds } });
    }

    // Delete all SKUs
    if (skuIds.length > 0) {
      await Sku.deleteMany({ _id: { $in: skuIds } });
    }

    // Delete vendor product
    await VendorProduct.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Vendor product and all SKUs deleted successfully',
      data: {
        productId: id,
        deletedSkus: skuIds.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete vendor product', error: error.message });
  }
};

/**
 * DELETE /api/v2/products/all
 * Delete ALL vendor products, SKUs, and inventory (dangerous!)
 */
const deleteAllVendorData = async (req, res) => {
  try {
    // Get confirmation from query param
    const confirm = req.query.confirm === 'true';
    if (!confirm) {
      return res.status(400).json({
        success: false,
        message: 'This action requires confirmation. Add ?confirm=true to proceed.',
      });
    }

    // Count before deletion
    const productCount = await VendorProduct.countDocuments();
    const skuCount = await Sku.countDocuments();
    const inventoryCount = await SkuInventory.countDocuments();

    // Delete all inventory
    await SkuInventory.deleteMany({});

    // Delete all SKUs
    await Sku.deleteMany({});

    // Delete all vendor products
    await VendorProduct.deleteMany({});

    return res.status(200).json({
      success: true,
      message: 'All vendor data deleted successfully',
      data: {
        deletedProducts: productCount,
        deletedSkus: skuCount,
        deletedInventory: inventoryCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete all vendor data', error: error.message });
  }
};

/**
 * GET /api/v2/templates/vendor-catalog
 * Download CSV template for vendor catalog upload
 */
const downloadVendorCatalogTemplate = async (req, res) => {
  try {
    const csvContent = `Sku,Vendor-Model,Description-Name,Tag Price,99-Price,Category,Subcategory-Department,Style,Brand-Design,Metal-Color,Metal-Type,Size,Gender,Extent-Width,AvgWeight,Stone Type,Center-Stone,Center-Carat,Center-Shape,Center-Color,Center-Clarity,Side-Stone,Side-Carat,Side-Shape,Side-Color,Side-Clarity,Dial,Year,Model-No,Featureimages_Link,Galleryimage_Link
    121431Y,SVR1074N10W,Diamond Ring,5499,4999,Diamond Jewelry,Rings,Classic,OTHERS,Yellow,14KT,7,Female,2.1,3.5,Diamond,Yes,1.2,Round,G,VS1,Diamond,0.5,Round,G,VS2,,2024,SVR1074N10W,https://example.com/feature1.jpg,https://example.com/gallery1.jpg
    160009WR,RB-7883,Gold Ring,4999,4599,Diamond Jewelry,Rings,Modern,OTHERS,White,14KT,8,Male,2.3,4.0,Diamond,Yes,1.0,Princess,F,VS2,Diamond,0.4,Princess,F,VS1,,2023,RB-7883,https://example.com/feature2.jpg,https://example.com/gallery2.jpg`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="product-template.csv"');
    res.send(csvContent);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate template', error: error.message });
  }
};

/**
 * GET /api/v2/templates/sku-inventory
 * Download CSV template for SKU inventory upload
 */
const downloadSkuInventoryTemplate = async (req, res) => {
  try {
    const csvContent = `Sku,Warehouse,City,Quantity,Stock Alert Threshold,Location Within Warehouse,Batch ID,Expiry Date,Barcode,VAT
121431Y,Main Warehouse,Houston,10,5,A-1-2,BATCH001,2025-12-31,123456789,0
160009WR,Main Warehouse,Houston,15,5,B-2-3,BATCH002,2025-12-31,987654321,0`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sku-inventory-template.csv"');
    res.send(csvContent);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate template', error: error.message });
  }
};

/**
 * ======================================================
 * CATEGORY MANAGEMENT FOR V2 CATALOG
 * ======================================================
 */

/**
 * GET /api/v2/categories
 * Get all categories with product counts
 */
const getV2Categories = async (req, res) => {
  try {
    const categories = await Category.find({ isNotShowed: false })
      .sort({ createdAt: 1 })
      .lean();

    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const productCount = await VendorProduct.countDocuments({
          $or: [
            { category: category._id.toString() },
            { category: category.name }
          ]
        });
        return {
          ...category,
          productCount
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Categories retrieved successfully',
      data: categoriesWithCount
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

/**
 * GET /api/v2/categories/:categoryId/subcategories
 * Get subcategories by category ID
 */
const getV2SubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!mongoose.isValidObjectId(categoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    const subcategories = await SubCategory.find({ parentCategory: categoryId })
      .sort({ createdAt: 1 })
      .lean();

    const subcategoriesWithCount = await Promise.all(
      subcategories.map(async (subcategory) => {
        const productCount = await VendorProduct.countDocuments({
          subcategory: subcategory._id
        });
        return {
          ...subcategory,
          productCount
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Subcategories retrieved successfully',
      data: subcategoriesWithCount
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch subcategories',
      error: error.message
    });
  }
};

/**
 * GET /api/v2/subcategories/:subCategoryId/subsubcategories
 * Get sub-subcategories by subcategory ID
 */
const getV2SubSubcategoriesBySubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    if (!mongoose.isValidObjectId(subCategoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subcategory ID'
      });
    }

    const subSubcategories = await SubSubCategory.find({ parentSubCategory: subCategoryId })
      .sort({ createdAt: 1 })
      .lean();

    const subSubcategoriesWithCount = await Promise.all(
      subSubcategories.map(async (subSubcategory) => {
        const productCount = await VendorProduct.countDocuments({
          subsubcategory: subSubcategory._id
        });
        return {
          ...subSubcategory,
          productCount
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Sub-subcategories retrieved successfully',
      data: subSubcategoriesWithCount
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sub-subcategories',
      error: error.message
    });
  }
};

/**
 * GET /api/v2/categories/with-subcategories
 * Get categories with nested subcategories and sub-subcategories
 */
const getV2CategoriesWithSubcategories = async (req, res) => {
  try {
    const categories = await Category.find({ isNotShowed: false })
      .sort({ createdAt: 1 })
      .lean();

    const categoriesWithSubs = await Promise.all(
      categories.map(async (category) => {
        const subcategories = await SubCategory.find({ parentCategory: category._id })
          .sort({ createdAt: 1 })
          .lean();

        const subcategoriesWithSubSubs = await Promise.all(
          subcategories.map(async (subcategory) => {
            const subSubcategories = await SubSubCategory.find({
              parentSubCategory: subcategory._id
            })
              .sort({ createdAt: 1 })
              .lean();

            const subSubcategoriesWithCount = await Promise.all(
              subSubcategories.map(async (subSubcategory) => {
                const productCount = await VendorProduct.countDocuments({
                  subsubcategory: subSubcategory._id
                });
                return {
                  ...subSubcategory,
                  productCount
                };
              })
            );

            const productCount = await VendorProduct.countDocuments({
              subcategory: subcategory._id
            });

            return {
              ...subcategory,
              productCount,
              subSubcategories: subSubcategoriesWithCount
            };
          })
        );

        const productCount = await VendorProduct.countDocuments({
          $or: [
            { category: category._id.toString() },
            { category: category.name }
          ]
        });

        return {
          ...category,
          productCount,
          subcategories: subcategoriesWithSubSubs
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Categories with subcategories retrieved successfully',
      data: categoriesWithSubs
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories with subcategories',
      error: error.message
    });
  }
};

module.exports = {
  listVendorProducts,
  getVendorProductById,
  getSkuById,
  updateVendorProduct,
  deleteSku,
  deleteVendorProduct,
  deleteAllVendorData,
  downloadVendorCatalogTemplate,
  downloadSkuInventoryTemplate,
  // Category management
  getV2Categories,
  getV2SubcategoriesByCategory,
  getV2SubSubcategoriesBySubCategory,
  getV2CategoriesWithSubcategories,
};


