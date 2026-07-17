const mongoose = require('mongoose');
const SpecialProduct = require('../models/specialProduct.model');
const SuppliesCart = require('../models/suppliesCart.model');
const SuppliesOrder = require('../models/suppliesOrder.model');
const SuppliesWallet = require('../models/suppliesWallet.model');
const WarehouseSuppliesInventory = require('../models/warehouseSuppliesInventory.model');
const Warehouse = require('../models/warehouse.model');
const Customer = require('../models/customer.model');
const { sendSuppliesOrderEmails } = require('../utils/suppliesOrderEmail');
const isObjectId = (value) => mongoose.isValidObjectId(String(value || '').trim());

function isSuppliesAdmin(actor, user) {
  const role = String(actor?.roleName || '').toLowerCase().trim();
  return (
    !!actor?.isSuperUser ||
    !!user?.is_superuser ||
    role === 'admin' ||
    role === 'super admin' ||
    role === 'superuser'
  );
}

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

/** Login / JWT selected warehouse for store customer */
async function resolveCustomerWarehouseId(req) {
  const selected = req.user?.selectedWarehouse;
  if (selected && isObjectId(selected)) return String(selected);

  const wh = req.user?.warehouse;
  if (Array.isArray(wh) && wh.length > 0) {
    const first = wh[0];
    const id = first?._id || first;
    if (isObjectId(id)) return String(id);
  }

  if (req.user?._id) {
    const customer = await Customer.findById(req.user._id).select('warehouse').lean();
    const list = customer?.warehouse || [];
    if (list.length > 0) {
      const id = list[0]?._id || list[0];
      if (isObjectId(id)) return String(id);
    }
  }

  return null;
}

async function getMainWarehouse(session) {
  const q = Warehouse.findOne({ isMain: true }).select('_id name');
  if (session) q.session(session);
  return q.lean();
}

/** Admin catalog stock on SpecialProduct (supplies products only). */
async function getCatalogStockQty(productId, session) {
  const q = SpecialProduct.findById(productId).select('stock type');
  if (session) q.session(session);
  const product = await q.lean();
  if (!product || String(product.type || '').toLowerCase() !== 'supplies') return 0;
  return Number(product.stock ?? 0);
}

/** Deduct from SpecialProduct catalog stock on admin approval. */
async function deductCatalogStock(productId, qty, session) {
  const updated = await SpecialProduct.findOneAndUpdate(
    { _id: productId, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
    { new: true, session },
  );
  if (!updated) {
    throw new Error('Insufficient supplies catalog stock');
  }
  return updated;
}

/** Add purchased qty to the store warehouse supplies inventory collection. */
async function addToWarehouseSuppliesInventory(productId, qty, warehouseId, line, orderId, session) {
  await WarehouseSuppliesInventory.findOneAndUpdate(
    { warehouse: warehouseId, specialProductId: productId },
    {
      $inc: { quantity: qty },
      $set: {
        sku: line.sku || '',
        productName: line.name || '',
        image: line.image || '',
        lastOrderId: orderId,
      },
    },
    { upsert: true, new: true, session },
  );
}

const getSuppliesCart = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    const warehouseId = await resolveCustomerWarehouseId(req);

    let cart = await SuppliesCart.findOne({ customer: customerId })
      .populate('items.specialProductId', 'name sku image stock type prices')
      .populate('warehouse', 'name isMain')
      .lean();

    if (!cart) {
      const doc = await SuppliesCart.create({
        customer: customerId,
        warehouse: warehouseId || null,
        items: [],
        subtotal: 0,
      });
      cart = await SuppliesCart.findById(doc._id)
        .populate('items.specialProductId', 'name sku image stock type prices')
        .populate('warehouse', 'name isMain')
        .lean();
    } else if (warehouseId) {
      await SuppliesCart.updateOne({ _id: cart._id }, { warehouse: warehouseId });
      cart.warehouse = warehouseId;
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

    const stock = await getCatalogStockQty(product._id);
    if (stock < qty) {
      return res.status(400).json({ success: false, message: `Insufficient stock (available: ${stock})` });
    }

    const price = resolveUnitPrice(product);
    const currency = 'USD';

    const warehouseId = await resolveCustomerWarehouseId(req);
    if (!warehouseId) {
      return res.status(400).json({
        success: false,
        message: 'No warehouse selected. Please select your store warehouse first.',
      });
    }

    let cart = await SuppliesCart.findOne({ customer: customerId });
    if (!cart) {
      cart = await SuppliesCart.create({
        customer: customerId,
        warehouse: warehouseId,
        items: [],
        subtotal: 0,
      });
    } else {
      cart.warehouse = warehouseId;
    }

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
      .populate('warehouse', 'name isMain')
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
    const stock = await getCatalogStockQty(item.specialProductId);
    if (stock < qty) {
      return res.status(400).json({ success: false, message: `Insufficient stock (available: ${stock})` });
    }

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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) {
      await session.abortTransaction();
      return;
    }

    const warehouseId = await resolveCustomerWarehouseId(req);
    if (!warehouseId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'No warehouse selected. Please select your store warehouse first.',
      });
    }

    const storeWarehouse = await Warehouse.findById(warehouseId).select('_id name isActive').lean();
    if (!storeWarehouse) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Store warehouse not found' });
    }
    if (storeWarehouse.isActive === false) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Store warehouse is not active' });
    }

    const cart = await SuppliesCart.findOne({ customer: customerId }).session(session);
    if (!cart || !cart.items?.length) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Supplies cart is empty' });
    }

    cart.warehouse = warehouseId;

    const ordersPayload = [];

    for (const line of cart.items) {
      const product = await SpecialProduct.findById(line.specialProductId)
        .select('name sku image stock type prices isActive status')
        .session(session);

      if (!product || product.isActive === false || String(product.type || '').toLowerCase() !== 'supplies') {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'A product in your cart is no longer available' });
      }

      const stock = await getCatalogStockQty(product._id, session);
      if (stock < line.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name || 'item'} (available: ${stock})`,
        });
      }

      const unit = resolveUnitPrice(product);
      const lineTotal = unit * line.quantity;
      const currency = line.currency || 'USD';

      let ticket = ticketSupply();
      /* eslint-disable-next-line no-await-in-loop */
      let exists = await SuppliesOrder.findOne({ ticketNumber: ticket }).session(session);
      while (exists) {
        ticket = ticketSupply();
        /* eslint-disable-next-line no-await-in-loop */
        exists = await SuppliesOrder.findOne({ ticketNumber: ticket }).session(session);
      }

      ordersPayload.push({
        ticketNumber: ticket,
        customer: customerId,
        warehouse: warehouseId,
        requestedByModel: 'Customer',
        items: [
          {
            specialProductId: product._id,
            name: product.name || line.productName || '',
            sku: product.sku || line.sku || '',
            quantity: line.quantity,
            unitPrice: unit,
            currency,
            image: product.image || line.image || '',
          },
        ],
        totalAmount: lineTotal,
        currency,
        status: 'PENDING_ADMIN',
      });
    }

    const created = await SuppliesOrder.insertMany(ordersPayload, { session });

    cart.items = [];
    cart.subtotal = 0;
    await cart.save({ session });

    await session.commitTransaction();

    const ids = created.map((o) => o._id);
    const populated = await SuppliesOrder.find({ _id: { $in: ids } })
      .populate('customer', 'username email phone_number')
      .populate('warehouse', 'name isMain')
      .sort({ createdAt: 1 })
      .lean();

    const n = populated.length;

    const requester = await Customer.findById(customerId).select('username email phone_number').lean();
    populated.forEach((orderRow) => {
      sendSuppliesOrderEmails({
        event: 'PLACED',
        order: orderRow,
        requester: requester || orderRow.customer,
      });
    });

    return res.status(201).json({
      success: true,
      message:
        n === 1
          ? 'Supplies order submitted for approval'
          : `${n} supplies orders submitted for approval (one per item)`,
      data: populated,
      orderCount: n,
    });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

const listMySuppliesOrders = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim().toUpperCase();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();

    const filter = { customer: customerId };
    if (['PENDING_ADMIN', 'APPROVED', 'REJECTED', 'SHIPPED', 'RECEIVED'].includes(status)) {
      filter.status = status;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [
        { ticketNumber: rx },
        { 'items.name': rx },
        { 'items.sku': rx },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, rows, summaryRows] = await Promise.all([
      SuppliesOrder.countDocuments(filter),
      SuppliesOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('warehouse', 'name isMain')
        .lean(),
      SuppliesOrder.aggregate([
        { $match: { customer: new mongoose.Types.ObjectId(String(customerId)) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            spent: {
              $sum: {
                $cond: [{ $ne: ['$status', 'REJECTED'] }, '$totalAmount', 0],
              },
            },
          },
        },
      ]),
    ]);

    const summary = {
      total: 0,
      spent: 0,
      pending: 0,
      approved: 0,
      shipped: 0,
      received: 0,
      rejected: 0,
    };
    summaryRows.forEach((row) => {
      const count = Number(row.count || 0);
      summary.total += count;
      summary.spent += Number(row.spent || 0);
      if (row._id === 'PENDING_ADMIN') summary.pending = count;
      else if (row._id === 'APPROVED') summary.approved = count;
      else if (row._id === 'SHIPPED') summary.shipped = count;
      else if (row._id === 'RECEIVED') summary.received = count;
      else if (row._id === 'REJECTED') summary.rejected = count;
    });

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      summary,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getMySuppliesOrder = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const customerId = await ensureCustomer(actor, res);
    if (!customerId) return;

    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await SuppliesOrder.findById(id)
      .populate('warehouse', 'name isMain')
      .populate('customer', 'username email phone_number')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (String(order.customer?._id || order.customer) !== String(customerId)) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adminListSuppliesOrders = async (req, res) => {
  try {
    if (!isSuppliesAdmin(req.b2bActor, req.user)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const status = String(req.query.status || '').trim().toUpperCase();
    const search = String(req.query.search || '').trim();
    const warehouseId = String(req.query.warehouse || req.query.warehouseId || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();

    const filter = {};
    if (['PENDING_ADMIN', 'APPROVED', 'REJECTED', 'SHIPPED', 'RECEIVED'].includes(status)) {
      filter.status = status;
    }
    if (warehouseId && isObjectId(warehouseId)) {
      filter.warehouse = warehouseId;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');

      const matchingCustomers = await Customer.find({
        $or: [{ username: rx }, { email: rx }],
      })
        .select('_id')
        .lean();

      const matchingWarehouses = await Warehouse.find({ name: rx }).select('_id').lean();

      filter.$or = [
        { ticketNumber: rx },
        { 'items.name': rx },
        { 'items.sku': rx },
        ...(matchingCustomers.length
          ? [{ customer: { $in: matchingCustomers.map((c) => c._id) } }]
          : []),
        ...(matchingWarehouses.length
          ? [{ warehouse: { $in: matchingWarehouses.map((w) => w._id) } }]
          : []),
      ];
    }

    const [rows, summaryRows] = await Promise.all([
      SuppliesOrder.find(filter)
        .sort({ createdAt: -1 })
        .populate('customer', 'username email phone_number')
        .populate('warehouse', 'name isMain')
        .lean(),
      SuppliesOrder.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = {
      total: 0,
      pending: 0,
      approved: 0,
      shipped: 0,
      received: 0,
      rejected: 0,
    };
    summaryRows.forEach((row) => {
      const count = Number(row.count || 0);
      summary.total += count;
      if (row._id === 'PENDING_ADMIN') summary.pending = count;
      else if (row._id === 'APPROVED') summary.approved = count;
      else if (row._id === 'SHIPPED') summary.shipped = count;
      else if (row._id === 'RECEIVED') summary.received = count;
      else if (row._id === 'REJECTED') summary.rejected = count;
    });

    return res.status(200).json({
      success: true,
      data: rows,
      summary,
      filters: {
        status: status || null,
        search: search || null,
        warehouse: warehouseId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adminGetSuppliesOrder = async (req, res) => {
  try {
    if (!isSuppliesAdmin(req.b2bActor, req.user)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await SuppliesOrder.findById(id)
      .populate('customer', 'username email phone_number')
      .populate('warehouse', 'name isMain')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adminApproveSuppliesOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const role = String(req.b2bActor?.roleName || '').toLowerCase().trim();
    const isAdmin = isSuppliesAdmin(req.b2bActor, req.user);
    if (!isAdmin) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { id } = req.params;
    if (!isObjectId(id)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const order = await SuppliesOrder.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    if (order.status !== 'PENDING_ADMIN') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Order cannot be approved in current status' });
    }

    const customerWarehouseId = order.warehouse;
    if (!customerWarehouseId || !isObjectId(String(customerWarehouseId))) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Order is missing store warehouse. Customer must re-place the order.',
      });
    }

    const mainWarehouse = await getMainWarehouse(session);
    if (!mainWarehouse) {
      await session.abortTransaction();
      return res.status(500).json({ success: false, message: 'Main warehouse is not configured' });
    }

    const totalAmount = Number(order.totalAmount ?? 0);
    if (totalAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid order total' });
    }

    for (const line of order.items) {
      const product = await SpecialProduct.findById(line.specialProductId)
        .select('name sku stock type isActive status')
        .session(session);

      if (!product || product.isActive === false || String(product.type || '').toLowerCase() !== 'supplies') {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Product ${line.name || line.sku || 'item'} is no longer available`,
        });
      }

      const available = await getCatalogStockQty(product._id, session);
      if (available < line.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient supplies stock for ${product.name || line.name} (available: ${available}, requested: ${line.quantity})`,
        });
      }
    }

    const customerWallet = await SuppliesWallet.findOne({ warehouse: customerWarehouseId }).session(session);
    if (!customerWallet) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Supplies wallet not found for customer warehouse',
      });
    }
    if (customerWallet.balance < totalAmount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient supplies wallet balance. Available: ${customerWallet.balance}, Required: ${totalAmount}`,
      });
    }

    let mainWallet = await SuppliesWallet.findOne({ warehouse: mainWarehouse._id }).session(session);
    if (!mainWallet) {
      mainWallet = new SuppliesWallet({ warehouse: mainWarehouse._id, balance: 0 });
    }

    const now = new Date();
    customerWallet.balance -= totalAmount;
    customerWallet.lastTransaction = now;
    await customerWallet.save({ session });

    mainWallet.balance += totalAmount;
    mainWallet.lastTransaction = now;
    await mainWallet.save({ session });

    for (const line of order.items) {
      await deductCatalogStock(line.specialProductId, line.quantity, session);
      await addToWarehouseSuppliesInventory(
        line.specialProductId,
        line.quantity,
        customerWarehouseId,
        line,
        order._id,
        session,
      );
    }

    order.status = 'APPROVED';
    order.approvedAt = now;
    await order.save({ session });

    await session.commitTransaction();

    const populated = await SuppliesOrder.findById(order._id)
      .populate('customer', 'username email phone_number')
      .populate('warehouse', 'name isMain')
      .lean();

    sendSuppliesOrderEmails({
      event: 'APPROVED',
      order: populated,
      requester: populated?.customer,
    });

    return res.status(200).json({
      success: true,
      message: 'Supplies order approved. Wallet transferred, catalog stock deducted, warehouse supplies inventory updated.',
      data: populated,
    });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

const adminRejectSuppliesOrder = async (req, res) => {
  try {
    if (!isSuppliesAdmin(req.b2bActor, req.user)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

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

    const populated = await SuppliesOrder.findById(order._id)
      .populate('customer', 'username email phone_number')
      .populate('warehouse', 'name isMain')
      .lean();

    sendSuppliesOrderEmails({
      event: 'REJECTED',
      order: populated,
      requester: populated?.customer,
      rejectionReason: reason,
    });

    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adminShipSuppliesOrder = async (req, res) => {
  try {
    if (!isSuppliesAdmin(req.b2bActor, req.user)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await SuppliesOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (order.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Only approved orders can be marked as shipped' });
    }

    order.status = 'SHIPPED';
    order.shippedAt = new Date();
    await order.save();

    const populated = await SuppliesOrder.findById(order._id)
      .populate('customer', 'username email phone_number')
      .populate('warehouse', 'name isMain')
      .lean();

    sendSuppliesOrderEmails({
      event: 'SHIPPED',
      order: populated,
      requester: populated?.customer,
    });

    return res.status(200).json({
      success: true,
      message: 'Order marked as shipped',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const markSuppliesOrderReceived = async (req, res) => {
  try {
    const customerId = await ensureCustomer(req.b2bActor, res);
    if (!customerId) return;

    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await SuppliesOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (String(order.customer) !== String(customerId)) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }
    if (order.status !== 'SHIPPED') {
      return res.status(400).json({ success: false, message: 'Order must be shipped before marking received' });
    }

    order.status = 'RECEIVED';
    order.receivedAt = new Date();
    await order.save();

    const populated = await SuppliesOrder.findById(order._id)
      .populate('customer', 'username email phone_number')
      .populate('warehouse', 'name isMain')
      .lean();

    sendSuppliesOrderEmails({
      event: 'RECEIVED',
      order: populated,
      requester: populated?.customer,
    });

    return res.status(200).json({
      success: true,
      message: 'Order marked as received',
      data: populated,
    });
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
  getMySuppliesOrder,
  adminListSuppliesOrders,
  adminGetSuppliesOrder,
  adminApproveSuppliesOrder,
  adminRejectSuppliesOrder,
  adminShipSuppliesOrder,
  markSuppliesOrderReceived,
};
