const mongoose = require('mongoose');
const SpecialProduct = require('../models/specialProduct.model');
const SuppliesCart = require('../models/suppliesCart.model');
const SuppliesOrder = require('../models/suppliesOrder.model');
const isObjectId = (value) => mongoose.isValidObjectId(String(value || '').trim());

function ticketSupply() {
  const pad = () => Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SUP-${Date.now().toString(36).toUpperCase()}-${pad()}`;
}

function resolveUnitPrice(product) {
  const p = product?.prices;
  if (Array.isArray(p) && p.length > 0 && typeof p[0]?.amount === 'number') return p[0].amount;
  if (typeof p?.amount === 'number') return p.amount;
  return 0;
}

async function ensureCustomer(actor, res) {
  if (!actor?.id || actor.model !== 'Customer') {
    res.status(401).json({ success: false, message: 'Store login required for supplies cart' });
    return null;
  }
  return actor.id;
}

const getSuppliesCart = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    let cart = await SuppliesCart.findOne({ customer: customerId })
      .populate('items.specialProductId', 'name sku image stock type prices')
      .lean();

    if (!cart) {
      const doc = await SuppliesCart.create({ customer: customerId, items: [], subtotal: 0 });
      cart = await SuppliesCart.findById(doc._id)
        .populate('items.specialProductId', 'name sku image stock type prices')
        .lean();
    }

    return res.status(200).json({ success: true, data: cart });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const addSuppliesCartItem = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    const specialProductId = req.body?.specialProductId;
    const qty = Number(req.body?.quantity);
    if (!isObjectId(specialProductId)) {
      return res.status(400).json({ success: false, message: 'Invalid product' });
    }
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    const product = await SpecialProduct.findById(specialProductId).select(
      'name sku image stock type prices isActive status',
    );
    if (!product || product.isActive === false || product.status === 'inactive') {
      return res.status(404).json({ success: false, message: 'Product not available' });
    }
    if (String(product.type || '').toLowerCase() !== 'supplies') {
      return res.status(400).json({ success: false, message: 'Only supplies products can be added here' });
    }
    const stock = Number(product.stock ?? 0);
    if (stock < qty) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    const price = resolveUnitPrice(product);
    const currency = 'USD';

    let cart = await SuppliesCart.findOne({ customer: customerId });
    if (!cart) cart = await SuppliesCart.create({ customer: customerId, items: [], subtotal: 0 });

    const idx = cart.items.findIndex((it) => String(it.specialProductId) === String(specialProductId));
    const image = product.image || '';
    if (idx >= 0) {
      const nextQty = cart.items[idx].quantity + qty;
      if (stock < nextQty) {
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }
      cart.items[idx].quantity = nextQty;
      cart.items[idx].price = price;
    } else {
      cart.items.push({
        specialProductId: product._id,
        quantity: qty,
        price,
        currency,
        productName: product.name || '',
        sku: product.sku || '',
        image,
      });
    }
    cart.calculateSubtotal();
    await cart.save();

    const populated = await SuppliesCart.findById(cart._id)
      .populate('items.specialProductId', 'name sku image stock type prices')
      .lean();

    return res.status(200).json({ success: true, message: 'Added', data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateSuppliesCartItem = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    const { itemId } = req.params;
    const qty = Number(req.body?.quantity);
    if (!isObjectId(itemId)) return res.status(400).json({ success: false, message: 'Invalid item' });
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    const cart = await SuppliesCart.findOne({ customer: customerId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const product = await SpecialProduct.findById(item.specialProductId).select('stock prices').lean();
    const stock = Number(product?.stock ?? 0);
    if (stock < qty) return res.status(400).json({ success: false, message: 'Insufficient stock' });

    item.quantity = qty;
    if (product && resolveUnitPrice(product) > 0) {
      item.price = resolveUnitPrice(product);
    }
    cart.calculateSubtotal();
    await cart.save();

    const populated = await SuppliesCart.findById(cart._id)
      .populate('items.specialProductId', 'name sku image stock type prices')
      .lean();

    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const removeSuppliesCartItem = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    const { itemId } = req.params;
    if (!isObjectId(itemId)) return res.status(400).json({ success: false, message: 'Invalid item' });

    const cart = await SuppliesCart.findOne({ customer: customerId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    cart.items.pull(itemId);
    cart.calculateSubtotal();
    await cart.save();

    const populated = await SuppliesCart.findById(cart._id)
      .populate('items.specialProductId', 'name sku image stock type prices')
      .lean();

    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const clearSuppliesCart = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    await SuppliesCart.findOneAndUpdate({ customer: customerId }, { items: [], subtotal: 0 });

    const populated = await SuppliesCart.findOne({ customer: customerId }).lean();
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const placeSuppliesOrder = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    const cart = await SuppliesCart.findOne({ customer: customerId });
    if (!cart || !cart.items?.length) {
      return res.status(400).json({ success: false, message: 'Supplies cart is empty' });
    }

    const orderItems = [];
    let total = 0;
    let currency = 'USD';

    for (const line of cart.items) {
      const product = await SpecialProduct.findById(line.specialProductId).select(
        'name sku image stock type prices isActive status',
      );
      if (!product || product.isActive === false || String(product.type || '').toLowerCase() !== 'supplies') {
        return res.status(400).json({ success: false, message: 'A product in your cart is no longer available' });
      }
      const stock = Number(product.stock ?? 0);
      if (stock < line.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name || 'item'}`,
        });
      }
      const unit = resolveUnitPrice(product);
      const lineTotal = unit * line.quantity;
      total += lineTotal;
      orderItems.push({
        specialProductId: product._id,
        name: product.name || line.productName || '',
        sku: product.sku || line.sku || '',
        quantity: line.quantity,
        unitPrice: unit,
        currency: line.currency || 'USD',
        image: product.image || line.image || '',
      });
      currency = line.currency || currency;
    }

    let ticket = ticketSupply();
    let exists = await SuppliesOrder.findOne({ ticketNumber: ticket });
    while (exists) {
      ticket = ticketSupply();
      /* eslint-disable-next-line no-await-in-loop */
      exists = await SuppliesOrder.findOne({ ticketNumber: ticket });
    }

    const order = await SuppliesOrder.create({
      ticketNumber: ticket,
      customer: customerId,
      requestedByModel: 'Customer',
      items: orderItems,
      totalAmount: total,
      currency,
      status: 'PENDING_ADMIN',
    });

    cart.items = [];
    cart.subtotal = 0;
    await cart.save();

    const populated = await SuppliesOrder.findById(order._id)
      .populate('customer', 'username email phone_number')
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Supplies order submitted for approval',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const listMySuppliesOrders = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    const rows = await SuppliesOrder.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adminListSuppliesOrders = async (req, res) => {
  try {
    const role = String(req.b2bActor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      !!req.b2bActor?.isSuperUser ||
      !!req.user?.is_superuser ||
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superuser';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const status = String(req.query.status || '').trim().toUpperCase();
    const filter = {};
    if (['PENDING_ADMIN', 'APPROVED', 'REJECTED'].includes(status)) filter.status = status;

    const rows = await SuppliesOrder.find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'username email phone_number')
      .lean();

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adminApproveSuppliesOrder = async (req, res) => {
  try {
    const role = String(req.b2bActor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      !!req.b2bActor?.isSuperUser ||
      !!req.user?.is_superuser ||
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superuser';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await SuppliesOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (order.status !== 'PENDING_ADMIN') {
      return res.status(400).json({ success: false, message: 'Order cannot be approved in current status' });
    }

    order.status = 'APPROVED';
    order.approvedAt = new Date();
    await order.save();

    const populated = await SuppliesOrder.findById(order._id).populate('customer', 'username email').lean();
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adminRejectSuppliesOrder = async (req, res) => {
  try {
    const role = String(req.b2bActor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      !!req.b2bActor?.isSuperUser ||
      !!req.user?.is_superuser ||
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superuser';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { id } = req.params;
    const reason = String(req.body?.reason || '').trim();
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await SuppliesOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (order.status !== 'PENDING_ADMIN') {
      return res.status(400).json({ success: false, message: 'Order cannot be rejected in current status' });
    }

    order.status = 'REJECTED';
    order.rejection = { reason, rejectedAt: new Date() };
    await order.save();

    const populated = await SuppliesOrder.findById(order._id).populate('customer', 'username email').lean();
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSuppliesCart,
  addSuppliesCartItem,
  updateSuppliesCartItem,
  removeSuppliesCartItem,
  clearSuppliesCart,
  placeSuppliesOrder,
  listMySuppliesOrders,
  adminListSuppliesOrders,
  adminApproveSuppliesOrder,
  adminRejectSuppliesOrder,
};
