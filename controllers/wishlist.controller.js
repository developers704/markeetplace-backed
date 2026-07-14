const Wishlist = require('../models/wishlist.model');
const Product = require('../models/product.model');
const SpecialProduct = require('../models/specialProduct.model.js');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const Customer = require('../models/customer.model');
const UserRole = require('../models/userRole.model');

const readSkuAttr = (sku, key) => {
  if (!sku?.attributes) return '';
  const attrs = sku.attributes;
  if (attrs instanceof Map) {
    return String(attrs.get(key) ?? '').trim();
  }
  return String(attrs[key] ?? '').trim();
};

const resolveWarehouseId = (user) => {
  const sw = user?.selectedWarehouse;
  if (!sw) return null;
  if (typeof sw === 'object' && sw._id) return String(sw._id);
  return String(sw);
};

const sameWishlistEntry = (a, b) =>
  String(a.product) === String(b.product) &&
  a.productType === b.productType &&
  String(a.skuId || '') === String(b.skuId || '') &&
  String(a.sellerWarehouseId || '') === String(b.sellerWarehouseId || '');

/**
 * Wishlist is scoped by the user's LOGIN store (JWT selectedWarehouse),
 * NOT the inventory/seller warehouse picked on the product page.
 */
const matchesWarehouseFilter = (
  item,
  warehouseId,
  wishlistCustomerId,
  currentUserId,
  warehouseCustomerIdSet,
) => {
  const ownerId = String(item.addedBy || wishlistCustomerId || '');
  const stamped = item.sellerWarehouseId ? String(item.sellerWarehouseId) : '';

  // Always show the current user's own saved items (even if stamped with
  // inventory warehouse instead of login store — legacy / frontend mismatch).
  if (ownerId === String(currentUserId)) return true;

  // Shared warehouse list: items stamped for this login store
  if (stamped && stamped === String(warehouseId)) return true;

  // Legacy entries with no warehouse stamp — include if owner belongs to store
  if (!stamped && warehouseCustomerIdSet.has(String(wishlistCustomerId))) return true;

  return false;
};

async function resolveCanAddToCart(user) {
  if (!user?.role) return false;
  const role = await UserRole.findById(user.role).select('permissions').lean();
  if (!role?.permissions) return false;
  const perms = role.permissions;
  const cartPerm = perms instanceof Map ? perms.get('Cart') : perms.Cart;
  return !!(cartPerm?.View || cartPerm?.Create);
}

async function formatVendorWishlistProduct(item) {
  const vendorProduct = await VendorProduct.findById(item.product)
    .select('title vendorModel defaultSku')
    .lean();

  if (!vendorProduct) return null;

  let skuData = null;
  if (item.skuId) {
    skuData = await Sku.findById(item.skuId)
      .select('sku price tagPrice currency images gallery attributes')
      .lean();
  }
  if (!skuData && vendorProduct.defaultSku) {
    skuData = await Sku.findById(vendorProduct.defaultSku)
      .select('sku price tagPrice currency images gallery attributes')
      .lean();
  }
  if (!skuData) {
    skuData = await Sku.findOne({ productId: item.product, isActive: true })
      .select('sku price tagPrice currency images gallery attributes')
      .sort({ createdAt: 1 })
      .lean();
  }

  const descriptionName =
    readSkuAttr(skuData, 'descriptionname') ||
    vendorProduct.title ||
    '';
  const images = skuData?.images?.length
    ? skuData.images
    : (skuData?.gallery?.length ? skuData.gallery : []);
  const price = skuData?.price ?? skuData?.tagPrice ?? 0;

  return {
    _id: vendorProduct._id,
    name: descriptionName,
    descriptionName,
    vendorModel: vendorProduct.vendorModel || '',
    sku: skuData?.sku || '',
    image: images[0] || '',
    gallery: images,
    defaultSkuId: skuData?._id || null,
    prices: [{ amount: price }],
    _wishlistProductType: 'vendor',
  };
}

async function formatRegularWishlistProduct(item, city) {
  const populatedProduct = await Product.findById(item.product)
    .populate('category', 'name')
    .populate('prices.city')
    .select('name title image gallery prices category')
    .lean();

  if (!populatedProduct) return null;

  populatedProduct.name = populatedProduct.name || populatedProduct.title;

  if (city && Array.isArray(populatedProduct.prices)) {
    populatedProduct.prices = populatedProduct.prices.filter(
      (price) => price.city && String(price.city._id) === String(city),
    );
  }

  return populatedProduct;
}

async function formatSpecialWishlistProduct(item, city) {
  const populatedProduct = await SpecialProduct.findById(item.product)
    .populate('specialCategory', 'name')
    .populate('prices.city')
    .select('name title image gallery prices specialCategory')
    .lean();

  if (!populatedProduct) return null;

  populatedProduct.name = populatedProduct.name || populatedProduct.title;

  if (city && Array.isArray(populatedProduct.prices)) {
    populatedProduct.prices = populatedProduct.prices.filter(
      (price) => price.city && String(price.city._id) === String(city),
    );
  }

  return populatedProduct;
}

const addToWishlist = async (req, res) => {
  try {
    const { productId, productType, isMain, skuId } = req.body;
    const customerId = req.user._id;
    const addedByUsername = req.user.username || '';
    // Always stamp with LOGIN selected warehouse (JWT) — not inventory warehouse from product page
    const loginWarehouseId = resolveWarehouseId(req.user);

    if (!loginWarehouseId) {
      return res.status(400).json({
        message: 'No store selected. Please select a warehouse / store and try again.',
      });
    }

    let product;
    if (productType === 'regular') {
      product = await Product.findById(productId);
    } else if (productType === 'special') {
      product = await SpecialProduct.findById(productId);
    } else if (productType === 'vendor') {
      product = await VendorProduct.findById(productId);
      if (product && skuId) {
        const sku = await Sku.findOne({ _id: skuId, productId });
        if (!sku) {
          return res.status(404).json({ message: 'SKU not found for this vendor product' });
        }
      }
    }

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const wishlistEntry = {
      productType,
      product: productId,
      isMain,
      sellerWarehouseId: loginWarehouseId,
      addedBy: customerId,
      addedByUsername,
    };

    if (productType === 'vendor' && skuId) {
      wishlistEntry.skuId = skuId;
    }

    let wishlist = await Wishlist.findOne({ customer: customerId });
    if (!wishlist) {
      wishlist = new Wishlist({ customer: customerId, products: [wishlistEntry] });
      await wishlist.save();
      return res.status(200).json({ message: 'Product added to wishlist', wishlist });
    }

    const alreadyExists = wishlist.products.some((item) => sameWishlistEntry(item, wishlistEntry));
    if (alreadyExists) {
      return res.status(200).json({ message: 'Product already in wishlist', wishlist });
    }

    // Same product+sku stamped under a different warehouse (e.g. inventory WH) — replace stamp
    const sameProductSkuIndex = wishlist.products.findIndex(
      (item) =>
        String(item.product) === String(productId) &&
        item.productType === productType &&
        String(item.skuId || '') === String(skuId || ''),
    );
    if (sameProductSkuIndex > -1) {
      wishlist.products[sameProductSkuIndex].sellerWarehouseId = loginWarehouseId;
      wishlist.products[sameProductSkuIndex].addedBy = customerId;
      wishlist.products[sameProductSkuIndex].addedByUsername = addedByUsername;
      if (isMain !== undefined) wishlist.products[sameProductSkuIndex].isMain = isMain;
      await wishlist.save();
      return res.status(200).json({ message: 'Product added to wishlist', wishlist });
    }

    wishlist.products.push(wishlistEntry);
    await wishlist.save();

    res.status(200).json({ message: 'Product added to wishlist', wishlist });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const { productId, productType } = req.params;
    const { skuId, sellerWarehouseId } = req.query;
    const customerId = req.user._id;

    const wishlist = await Wishlist.findOne({ customer: customerId });
    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    const beforeCount = wishlist.products.length;
    // Own wishlist document only — remove by product + sku (ignore warehouse stamp mismatch)
    wishlist.products = wishlist.products.filter((item) => {
      if (String(item.product) !== String(productId) || item.productType !== productType) {
        return true;
      }
      if (skuId && String(item.skuId || '') !== String(skuId)) {
        return true;
      }
      return false;
    });

    if (wishlist.products.length === beforeCount) {
      return res.status(404).json({ message: 'Wishlist item not found' });
    }

    await wishlist.save();
    res.status(200).json({ message: 'Product removed from wishlist', wishlist });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const toggleWishlistProduct = async (req, res) => {
  try {
    const { productId, productType } = req.body;
    const customerId = req.user._id;

    let product;
    if (productType === 'regular') {
      product = await Product.findById(productId);
    } else if (productType === 'special') {
      product = await SpecialProduct.findById(productId);
    } else if (productType === 'vendor') {
      product = await VendorProduct.findById(productId);
    }

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let wishlist = await Wishlist.findOne({ customer: customerId });

    if (!wishlist) {
      wishlist = new Wishlist({
        customer: customerId,
        products: [{
          productType,
          product: productId,
          addedBy: customerId,
          addedByUsername: req.user.username || '',
          sellerWarehouseId: resolveWarehouseId(req.user),
        }],
      });
      await wishlist.save();
      return res.status(200).json({ message: 'Product added to wishlist', wishlist });
    }

    const productIndex = wishlist.products.findIndex(
      (item) => String(item.product) === String(productId) && item.productType === productType,
    );

    if (productIndex > -1) {
      wishlist.products.splice(productIndex, 1);
    } else {
      wishlist.products.push({
        productType,
        product: productId,
        addedBy: customerId,
        addedByUsername: req.user.username || '',
        sellerWarehouseId: resolveWarehouseId(req.user),
      });
    }

    await wishlist.save();

    res.status(200).json({
      message: productIndex > -1 ? 'Product removed from wishlist' : 'Product added to wishlist',
      wishlist,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const getWishlist = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { city } = req.query;
    const warehouseId = resolveWarehouseId(req.user);

    if (!warehouseId) {
      return res.status(200).json({
        warehouseId: null,
        canAddToCart: await resolveCanAddToCart(req.user),
        products: [],
      });
    }

    const warehouseCustomers = await Customer.find({ warehouse: warehouseId })
      .select('_id')
      .lean();
    const warehouseCustomerIds = warehouseCustomers.map((c) => c._id);
    const warehouseCustomerIdSet = new Set(warehouseCustomerIds.map(String));

    // Always include current user even if warehouse membership query misses them
    if (!warehouseCustomerIdSet.has(String(customerId))) {
      warehouseCustomerIds.push(customerId);
      warehouseCustomerIdSet.add(String(customerId));
    }

    const wishlists = await Wishlist.find({ customer: { $in: warehouseCustomerIds } }).lean();
    const canAddToCart = await resolveCanAddToCart(req.user);

    const warehouseItems = [];
    for (const wishlist of wishlists) {
      for (const item of wishlist.products || []) {
        if (
          !matchesWarehouseFilter(
            item,
            warehouseId,
            wishlist.customer,
            customerId,
            warehouseCustomerIdSet,
          )
        ) {
          continue;
        }
        warehouseItems.push({
          ...item,
          isOwn: String(item.addedBy || wishlist.customer) === String(customerId),
        });
      }
    }

    const products = (
      await Promise.all(
        warehouseItems.map(async (item) => {
          let populatedProduct = null;

          if (item.productType === 'regular') {
            populatedProduct = await formatRegularWishlistProduct(item, city);
          } else if (item.productType === 'special') {
            populatedProduct = await formatSpecialWishlistProduct(item, city);
          } else if (item.productType === 'vendor') {
            populatedProduct = await formatVendorWishlistProduct(item);
          }

          if (!populatedProduct) return null;
          if (item.productType !== 'vendor') {
            if (!populatedProduct.prices || populatedProduct.prices.length === 0) {
              return null;
            }
          }

          return {
            _id: item._id,
            productType: item.productType,
            skuId: item.skuId || null,
            sellerWarehouseId: item.sellerWarehouseId || warehouseId,
            addedByUsername: item.addedByUsername || '',
            isOwn: item.isOwn,
            canAddToCart,
            product: populatedProduct,
          };
        }),
      )
    ).filter(Boolean);

    res.status(200).json({
      warehouseId,
      canAddToCart,
      products,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const clearWishlist = async (req, res) => {
  try {
    const customerId = req.user._id;
    const warehouseId = resolveWarehouseId(req.user);

    const wishlist = await Wishlist.findOne({ customer: customerId });
    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    if (warehouseId) {
      wishlist.products = wishlist.products.filter(
        (item) => String(item.sellerWarehouseId || '') !== String(warehouseId),
      );
    } else {
      wishlist.products = [];
    }

    await wishlist.save();
    res.status(200).json({ message: 'All products removed from wishlist', wishlist });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  clearWishlist,
  toggleWishlistProduct,
};
