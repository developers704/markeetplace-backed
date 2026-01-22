const mongoose = require('mongoose');
const B2BCart = require('../models/b2bCart.model');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const Warehouse = require('../models/warehouse.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const Customer = require('../models/customer.model');

const isObjectId = (value) => mongoose.isValidObjectId(String(value || '').trim());

/**
 * GET /api/v2/b2b/cart
 * Get or create B2B cart for logged-in customer
 */
const getB2BCart = async (req, res) => {
  try {
    const actor = req.b2bActor;
    if (!actor || actor.model !== 'Customer') {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    const storeWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!storeWarehouseId || !isObjectId(storeWarehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'No warehouse selected. Please select a warehouse first.',
        data: { requiresWarehouseSelection: true },
      });
    }

    let cart = await B2BCart.findOne({
      customer: actor.id,
      storeWarehouseId,
    })
      .populate('items.vendorProductId', 'vendorModel title brand category')
      .populate('items.skuId', 'sku price currency metalColor metalType size images')
      .populate('storeWarehouseId', 'name isMain')
      .lean();

    if (!cart) {
      // Create empty cart
      const newCart = await B2BCart.create({
        customer: actor.id,
        storeWarehouseId,
        items: [],
        subtotal: 0,
      });
      cart = await B2BCart.findById(newCart._id)
        .populate('items.vendorProductId', 'vendorModel title brand category')
        .populate('items.skuId', 'sku price currency metalColor metalType size images')
        .populate('storeWarehouseId', 'name isMain')
        .lean();
    }

    // Get warehouse wallet balance
    const inventoryWallet = await InventoryWallet.findOne({ warehouse: storeWarehouseId }).lean();
    const walletBalance = inventoryWallet?.balance || 0;

    return res.status(200).json({
      success: true,
      message: 'Cart retrieved',
      data: {
        ...cart,
        walletBalance,
        remainingBalance: walletBalance - (cart.subtotal || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch cart', error: error.message });
  }
};

/**
 * POST /api/v2/b2b/cart/add
 * Add SKU to B2B cart
 */
const addToB2BCart = async (req, res) => {
  try {
    const actor = req.b2bActor;
    if (!actor || actor.model !== 'Customer') {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { vendorProductId, skuId, quantity } = req.body || {};

    if (!isObjectId(vendorProductId) || !isObjectId(skuId)) {
      return res.status(400).json({ success: false, message: 'Invalid vendorProductId or skuId' });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    const storeWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!storeWarehouseId || !isObjectId(storeWarehouseId)) {
      return res.status(400).json({
        success: false,
        message: 'No warehouse selected. Please select a warehouse first.',
        data: { requiresWarehouseSelection: true },
      });
    }

    // Validate SKU exists and belongs to vendor product
    const [vendorProduct, sku, storeWarehouse] = await Promise.all([
      VendorProduct.findById(vendorProductId).select('_id vendorModel title').lean(),
      Sku.findById(skuId).select('_id sku productId price currency metalColor metalType size').lean(),
      Warehouse.findById(storeWarehouseId).select('_id name isActive').lean(),
    ]);

    if (!vendorProduct) return res.status(404).json({ success: false, message: 'Vendor product not found' });
    if (!sku) return res.status(404).json({ success: false, message: 'SKU not found' });
    if (String(sku.productId) !== String(vendorProduct._id)) {
      return res.status(400).json({ success: false, message: 'SKU does not belong to the provided vendor product' });
    }
    if (!storeWarehouse) return res.status(404).json({ success: false, message: 'Store warehouse not found' });
    if (storeWarehouse.isActive === false) {
      return res.status(400).json({ success: false, message: 'Store warehouse is not active' });
    }

    // Get or create cart
    let cart = await B2BCart.findOne({
      customer: actor.id,
      storeWarehouseId,
    });

    if (!cart) {
      cart = await B2BCart.create({
        customer: actor.id,
        storeWarehouseId,
        items: [],
        subtotal: 0,
      });
    }

    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(
      (item) => String(item.vendorProductId) === String(vendorProductId) && String(item.skuId) === String(skuId)
    );

    if (existingItemIndex > -1) {
      // Update quantity
      cart.items[existingItemIndex].quantity += qty;
      cart.items[existingItemIndex].price = sku.price; // Update price in case it changed
    } else {
      // Add new item
      cart.items.push({
        vendorProductId: vendorProduct._id,
        skuId: sku._id,
        quantity: qty,
        price: sku.price,
        currency: sku.currency || 'USD',
      });
    }

    cart.calculateSubtotal();
    await cart.save();

    const populated = await B2BCart.findById(cart._id)
      .populate('items.vendorProductId', 'vendorModel title brand category')
      .populate('items.skuId', 'sku price currency metalColor metalType size images')
      .populate('storeWarehouseId', 'name isMain')
      .lean();

    // Get wallet balance
    const inventoryWallet = await InventoryWallet.findOne({ warehouse: storeWarehouseId }).lean();
    const walletBalance = inventoryWallet?.balance || 0;

    return res.status(200).json({
      success: true,
      message: 'Item added to cart',
      data: {
        ...populated,
        walletBalance,
        remainingBalance: walletBalance - populated.subtotal,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to add item to cart', error: error.message });
  }
};

/**
 * PUT /api/v2/b2b/cart/update/:itemId
 * Update cart item quantity
 */
const updateB2BCartItem = async (req, res) => {
  try {
    const actor = req.b2bActor;
    if (!actor || actor.model !== 'Customer') {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { itemId } = req.params;
    const { quantity } = req.body || {};

    if (!isObjectId(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid itemId' });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    const storeWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!storeWarehouseId) {
      return res.status(400).json({ success: false, message: 'No warehouse selected' });
    }

    const cart = await B2BCart.findOne({
      customer: actor.id,
      storeWarehouseId,
    });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex((item) => String(item._id) === String(itemId));
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }

    cart.items[itemIndex].quantity = qty;
    cart.calculateSubtotal();
    await cart.save();

    const populated = await B2BCart.findById(cart._id)
      .populate('items.vendorProductId', 'vendorModel title brand category')
      .populate('items.skuId', 'sku price currency metalColor metalType size images')
      .populate('storeWarehouseId', 'name isMain')
      .lean();

    const inventoryWallet = await InventoryWallet.findOne({ warehouse: storeWarehouseId }).lean();
    const walletBalance = inventoryWallet?.balance || 0;

    return res.status(200).json({
      success: true,
      message: 'Cart item updated',
      data: {
        ...populated,
        walletBalance,
        remainingBalance: walletBalance - populated.subtotal,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update cart item', error: error.message });
  }
};

/**
 * DELETE /api/v2/b2b/cart/remove/:itemId
 * Remove item from cart
 */
const removeFromB2BCart = async (req, res) => {
  try {
    const actor = req.b2bActor;
    if (!actor || actor.model !== 'Customer') {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { itemId } = req.params;

    if (!isObjectId(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid itemId' });
    }

    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    const storeWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!storeWarehouseId) {
      return res.status(400).json({ success: false, message: 'No warehouse selected' });
    }

    const cart = await B2BCart.findOne({
      customer: actor.id,
      storeWarehouseId,
    });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = cart.items.filter((item) => String(item._id) !== String(itemId));
    cart.calculateSubtotal();
    await cart.save();

    const populated = await B2BCart.findById(cart._id)
      .populate('items.vendorProductId', 'vendorModel title brand category')
      .populate('items.skuId', 'sku price currency metalColor metalType size images')
      .populate('storeWarehouseId', 'name isMain')
      .lean();

    const inventoryWallet = await InventoryWallet.findOne({ warehouse: storeWarehouseId }).lean();
    const walletBalance = inventoryWallet?.balance || 0;

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: {
        ...populated,
        walletBalance,
        remainingBalance: walletBalance - (populated.subtotal || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to remove item from cart', error: error.message });
  }
};

/**
 * DELETE /api/v2/b2b/cart/clear
 * Clear all items from cart
 */
const clearB2BCart = async (req, res) => {
  try {
    const actor = req.b2bActor;
    if (!actor || actor.model !== 'Customer') {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    const storeWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!storeWarehouseId) {
      return res.status(400).json({ success: false, message: 'No warehouse selected' });
    }

    const cart = await B2BCart.findOne({
      customer: actor.id,
      storeWarehouseId,
    });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = [];
    cart.subtotal = 0;
    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Cart cleared',
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to clear cart', error: error.message });
  }
};

module.exports = {
  getB2BCart,
  addToB2BCart,
  updateB2BCartItem,
  removeFromB2BCart,
  clearB2BCart,
};

