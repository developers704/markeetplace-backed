const mongoose = require('mongoose');

const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const Warehouse = require('../models/warehouse.model');
const Customer = require('../models/customer.model');
const User = require('../models/user.model');

const B2BPurchaseRequest = require('../models/b2bPurchaseRequest.model');
const StoreInventory = require('../models/storeInventory.model');
const Notification = require('../models/notification.model');
const AdminNotification = require('../models/adminNotification.model');
const { sendEmail } = require('../config/sendMails');
const B2BCart = require('../models/b2bCart.model');
const InventoryWallet = require('../models/inventoryWallet.model');

const isObjectId = (value) => mongoose.isValidObjectId(String(value || '').trim());

const sumSkuInventory = async (skuId, session) => {
  const pipeline = [
    { $match: { skuId: new mongoose.Types.ObjectId(String(skuId)) } },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ];
  const q = SkuInventory.aggregate(pipeline);
  if (session) q.session(session);
  const agg = await q;
  return agg?.[0]?.total || 0;
};

const deductSkuInventory = async ({ skuId, quantity, session }) => {
  let remaining = quantity;
  const deductions = [];

  const invQuery = SkuInventory.find({ skuId, quantity: { $gt: 0 } }).sort({ quantity: -1, updatedAt: 1 });
  if (session) invQuery.session(session);
  const inventories = await invQuery.lean();

  for (const inv of inventories) {
    if (remaining <= 0) break;
    const updateOpts = session ? { session } : {};

    // Defensive loop to avoid negative stock under concurrent approvals
    for (let attempt = 0; attempt < 3; attempt++) {
      const currentQuery = SkuInventory.findById(inv._id).select('quantity');
      if (session) currentQuery.session(session);
      const current = await currentQuery.lean();

      const available = Number(current?.quantity || 0);
      if (available <= 0) break;

      const take = Math.min(remaining, available);
      const updateRes = await SkuInventory.updateOne(
        { _id: inv._id, quantity: { $gte: take } },
        { $inc: { quantity: -take } },
        updateOpts
      );

      if (updateRes.modifiedCount === 1) {
        deductions.push({ inventoryId: inv._id, deducted: take });
        remaining -= take;
        break;
      }
    }
  }

  if (remaining > 0) {
    throw new Error('Vendor inventory changed. Not enough stock to fulfill request.');
  }

  return deductions;
};

const resolveRequestedByDetails = async (requests) => {
  const customerIds = [];
  const userIds = [];

  for (const r of requests) {
    if (r.requestedByModel === 'Customer') customerIds.push(r.requestedBy);
    if (r.requestedByModel === 'User') userIds.push(r.requestedBy);
  }

  const [customers, users] = await Promise.all([
    customerIds.length ? Customer.find({ _id: { $in: customerIds } }).select('_id username email phone_number').lean() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('_id username email phone_number').lean() : [],
  ]);

  const customerMap = new Map(customers.map((c) => [String(c._id), c]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return requests.map((r) => {
    const key = String(r.requestedBy);
    const requestedByUser =
      r.requestedByModel === 'Customer' ? customerMap.get(key) : r.requestedByModel === 'User' ? userMap.get(key) : null;
    return { ...r, requestedByUser: requestedByUser || null };
  });
};

/**
 * Helper: Send notifications and emails for B2B purchase lifecycle events
 */
const notifyB2BEvent = async ({ event, request, actor }) => {
  try {
    const populated = await B2BPurchaseRequest.findById(request._id)
      .populate('vendorProductId', 'vendorModel title')
      .populate('skuId', 'sku metalColor metalType size')
      .populate('storeWarehouseId', 'name')
      .populate('requestedBy', 'username email')
      .populate('dmUserId', 'username email')
      .populate('cmUserId', 'username email')
      .lean();

    const vendorProduct = populated.vendorProductId;
    const sku = populated.skuId;
    const store = populated.storeWarehouseId;
    const requester = populated.requestedBy;
    const dm = populated.dmUserId;
    const cm = populated.cmUserId;

    const productInfo = `${vendorProduct?.title || 'N/A'} (${vendorProduct?.vendorModel || 'N/A'})`;
    const skuInfo = `SKU: ${sku?.sku || 'N/A'} | ${sku?.metalColor || ''} ${sku?.metalType || ''} ${sku?.size || ''}`.trim();
    const requestLink = `/marketplace/b2b-approvals/${request._id}`;

    // Fetch all admins for admin notifications
    const admins = await User.find({ is_superuser: true }).select('_id email username').lean();

    let notifications = [];
    let emails = [];

    switch (event) {
      case 'REQUEST_CREATED': {
        // Notify DM, CM
        if (dm) {
          notifications.push({
            user: dm._id,
            content: `New B2B purchase request from ${requester?.username || 'Store Manager'} for ${productInfo} (Qty: ${request.quantity})`,
            url: requestLink,
            read: false,
          });
          if (dm.email) {
            emails.push({
              to: dm.email,
              subject: `New B2B Purchase Request - ${productInfo}`,
              html: `
                <h2>New B2B Purchase Request</h2>
                <p><strong>Store:</strong> ${store?.name || 'N/A'}</p>
                <p><strong>Product:</strong> ${productInfo}</p>
                <p><strong>${skuInfo}</strong></p>
                <p><strong>Quantity:</strong> ${request.quantity}</p>
                <p><strong>Requested By:</strong> ${requester?.username || 'N/A'}</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${requestLink}">Review Request</a></p>
              `,
            });
          }
        }
        if (cm) {
          notifications.push({
            user: cm._id,
            content: `New B2B purchase request from ${requester?.username || 'Store Manager'} for ${productInfo} (Qty: ${request.quantity})`,
            url: requestLink,
            read: false,
          });
          if (cm.email) {
            emails.push({
              to: cm.email,
              subject: `New B2B Purchase Request - ${productInfo}`,
              html: `
                <h2>New B2B Purchase Request</h2>
                <p><strong>Store:</strong> ${store?.name || 'N/A'}</p>
                <p><strong>Product:</strong> ${productInfo}</p>
                <p><strong>${skuInfo}</strong></p>
                <p><strong>Quantity:</strong> ${request.quantity}</p>
                <p><strong>Requested By:</strong> ${requester?.username || 'N/A'}</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${requestLink}">Review Request</a></p>
              `,
            });
          }
        }
        break;
      }
      case 'DM_APPROVED': {
        const actorName = actor?.username || 'District Manager';
        // Notify CM, Admin, Store Manager
        if (cm) {
          notifications.push({
            user: cm._id,
            content: `DM ${actorName} approved purchase request for ${productInfo}. Awaiting your approval.`,
            url: requestLink,
            read: false,
          });
          if (cm.email) {
            emails.push({
              to: cm.email,
              subject: `B2B Request Approved by DM - ${productInfo}`,
              html: `
                <h2>DM Approval Received</h2>
                <p><strong>Store:</strong> ${store?.name || 'N/A'}</p>
                <p><strong>Product:</strong> ${productInfo}</p>
                <p><strong>${skuInfo}</strong></p>
                <p><strong>Approved By:</strong> ${actorName}</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${requestLink}">Review Request</a></p>
              `,
            });
          }
        }
        admins.forEach((admin) => {
          notifications.push({
            user: admin._id,
            type: 'ORDER',
            content: `DM ${actorName} approved B2B purchase request for ${productInfo} (Qty: ${request.quantity})`,
            resourceId: request._id,
            resourceModel: 'B2BPurchaseRequest',
            priority: 'medium',
            read: false,
          });
        });
        if (requester) {
          notifications.push({
            user: requester._id,
            content: `Your purchase request for ${productInfo} was approved by DM ${actorName}. Status: ${request.status}`,
            url: requestLink,
            read: false,
          });
          if (requester.email) {
            emails.push({
              to: requester.email,
              subject: `B2B Purchase Request Approved by DM - ${productInfo}`,
              html: `
                <h2>Request Approved by District Manager</h2>
                <p><strong>Product:</strong> ${productInfo}</p>
                <p><strong>${skuInfo}</strong></p>
                <p><strong>Quantity:</strong> ${request.quantity}</p>
                <p><strong>Status:</strong> ${request.status}</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${requestLink}">View Request</a></p>
              `,
            });
          }
        }
        break;
      }
      case 'CM_APPROVED': {
        const actorName = actor?.username || 'Corporate Manager';
        // Notify Admin, Store Manager
        admins.forEach((admin) => {
          notifications.push({
            user: admin._id,
            type: 'ORDER',
            content: `CM ${actorName} approved B2B purchase request for ${productInfo} (Qty: ${request.quantity}). Awaiting final admin approval.`,
            resourceId: request._id,
            resourceModel: 'B2BPurchaseRequest',
            priority: 'high',
            read: false,
          });
        });
        if (requester) {
          notifications.push({
            user: requester._id,
            content: `Your purchase request for ${productInfo} was approved by CM ${actorName}. Awaiting admin approval.`,
            url: requestLink,
            read: false,
          });
          if (requester.email) {
            emails.push({
              to: requester.email,
              subject: `B2B Purchase Request Approved by CM - ${productInfo}`,
              html: `
                <h2>Request Approved by Corporate Manager</h2>
                <p><strong>Product:</strong> ${productInfo}</p>
                <p><strong>${skuInfo}</strong></p>
                <p><strong>Quantity:</strong> ${request.quantity}</p>
                <p><strong>Status:</strong> ${request.status}</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${requestLink}">View Request</a></p>
              `,
            });
          }
        }
        break;
      }
      case 'ADMIN_APPROVED': {
        const actorName = actor?.username || 'Admin';
        // Notify Store Manager, DM, CM, Vendor (if applicable)
        if (requester) {
          notifications.push({
            user: requester._id,
            content: `Your purchase request for ${productInfo} was FINALLY APPROVED by Admin. Inventory added to store.`,
            url: requestLink,
            read: false,
          });
          if (requester.email) {
            emails.push({
              to: requester.email,
              subject: `B2B Purchase Request APPROVED - ${productInfo}`,
              html: `
                <h2>✅ Purchase Request Approved</h2>
                <p><strong>Product:</strong> ${productInfo}</p>
                <p><strong>${skuInfo}</strong></p>
                <p><strong>Quantity:</strong> ${request.quantity}</p>
                <p><strong>Status:</strong> APPROVED - Inventory added to store</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/marketplace/store-inventory">View Store Inventory</a></p>
              `,
            });
          }
        }
        if (dm) {
          notifications.push({
            user: dm._id,
            content: `B2B purchase request for ${productInfo} was approved by Admin. Inventory moved to ${store?.name || 'store'}.`,
            url: requestLink,
            read: false,
          });
        }
        if (cm) {
          notifications.push({
            user: cm._id,
            content: `B2B purchase request for ${productInfo} was approved by Admin. Inventory moved to ${store?.name || 'store'}.`,
            url: requestLink,
            read: false,
          });
        }
        break;
      }
      case 'REJECTED': {
        const actorName = actor?.username || 'Approver';
        const reason = request.rejection?.reason || 'No reason provided';
        // Notify Store Manager, DM, CM, Admin
        if (requester) {
          notifications.push({
            user: requester._id,
            content: `Your purchase request for ${productInfo} was REJECTED by ${actorName}. Reason: ${reason}`,
            url: requestLink,
            read: false,
          });
          if (requester.email) {
            emails.push({
              to: requester.email,
              subject: `B2B Purchase Request Rejected - ${productInfo}`,
              html: `
                <h2>❌ Purchase Request Rejected</h2>
                <p><strong>Product:</strong> ${productInfo}</p>
                <p><strong>${skuInfo}</strong></p>
                <p><strong>Quantity:</strong> ${request.quantity}</p>
                <p><strong>Rejected By:</strong> ${actorName}</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${requestLink}">View Request</a></p>
              `,
            });
          }
        }
        break;
      }
    }

    // Save notifications (non-blocking)
    if (notifications.length > 0) {
      const customerNotifications = notifications.filter((n) => !n.type).map(({ user, content, url, read }) => ({
        user,
        content,
        url,
        read,
      }));
      const adminNotifications = notifications.filter((n) => n.type).map(({ user, type, content, resourceId, resourceModel, priority, read }) => ({
        user,
        type,
        content,
        resourceId,
        resourceModel,
        priority,
        read,
      }));

      await Promise.all([
        customerNotifications.length > 0 ? Notification.insertMany(customerNotifications) : Promise.resolve(),
        adminNotifications.length > 0 ? AdminNotification.insertMany(adminNotifications) : Promise.resolve(),
      ]);
    }

    // Send emails (non-blocking, fire and forget)
    if (emails.length > 0) {
      Promise.all(emails.map((mail) => sendEmail(mail))).catch((err) => console.error('B2B email error:', err));
    }
  } catch (error) {
    console.error('B2B notification error:', error);
    // Don't throw - notifications are non-critical
  }
};

/**
 * POST /api/v2/b2b/purchase
 *
 * Store Manager initiates purchase request from cart (pending DM approval)
 * 
 * Supports two modes:
 * 1. Cart-based (recommended): { cartId } - creates requests for all cart items
 * 2. Single-item (backward compatible): { vendorProductId, skuId, quantity, storeWarehouseId }
 */
const createPurchaseRequest = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { cartId, vendorProductId, skuId, quantity, storeWarehouseId } = req.body || {};

    // Determine selected warehouse
    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    let storeWh = storeWarehouseId ? String(storeWarehouseId) : selectedWarehouse || userWarehouses[0] || null;

    if (!storeWh || !isObjectId(storeWh)) {
      return res.status(400).json({
        success: false,
        message: 'No warehouse selected. Please select a warehouse first.',
        data: { requiresWarehouseSelection: true },
      });
    }

    const ownsStore = (selectedWarehouse && selectedWarehouse === storeWh) || userWarehouses.includes(storeWh);
    if (!actor?.isSuperUser && !ownsStore) {
      return res.status(403).json({ success: false, message: 'You are not allowed to purchase for this store warehouse' });
    }

    // Mode 1: Cart-based purchase (multi-item)
    if (cartId) {
      if (!isObjectId(cartId)) {
        return res.status(400).json({ success: false, message: 'Invalid cartId' });
      }

      const cart = await B2BCart.findOne({
        _id: cartId,
        customer: actor.id,
        storeWarehouseId: storeWh,
      })
        .populate('items.vendorProductId', '_id vendorModel title')
        .populate('items.skuId', '_id sku productId price currency')
        .lean();

      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found or does not belong to you' });
      }

      if (!cart.items || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
      }

      // Validate wallet balance
      const inventoryWallet = await InventoryWallet.findOne({ warehouse: storeWh }).lean();
      const walletBalance = inventoryWallet?.balance || 0;
      const cartTotal = cart.subtotal || 0;

      if (walletBalance < cartTotal) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Available: ${walletBalance.toFixed(2)}, Required: ${cartTotal.toFixed(2)}`,
          data: { walletBalance, required: cartTotal, shortfall: cartTotal - walletBalance },
        });
      }

      // Validate all SKUs have sufficient vendor inventory
      const storeWarehouse = await Warehouse.findById(storeWh)
        .select('_id name districtManager corporateManager isMain isActive requireDMApproval requireCMApproval')
        .lean();

      if (!storeWarehouse) return res.status(404).json({ success: false, message: 'Store warehouse not found' });
      if (storeWarehouse.isActive === false) {
        return res.status(400).json({ success: false, message: 'Store warehouse is not active' });
      }

      const dmUserId = storeWarehouse.districtManager;
      const cmUserId = storeWarehouse.corporateManager;
      // if (!dmUserId || !cmUserId) {
      //   return res.status(400).json({ success: false, message: 'Store is missing DM/CM assignment' });
      // }

      const requireDM = storeWarehouse.requireDMApproval !== false;
      const requireCM = storeWarehouse.requireCMApproval !== false;
      let initialStatus = 'PENDING_ADMIN';
      if (requireDM && requireCM) {
        initialStatus = 'PENDING_DM';
      } else if (requireDM && !requireCM) {
        initialStatus = 'PENDING_DM';
      } else if (!requireDM && requireCM) {
        initialStatus = 'PENDING_CM';
      }

      // Validate inventory for all items
      const inventoryChecks = await Promise.all(
        cart.items.map(async (item) => {
          const available = await sumSkuInventory(item.skuId._id);
          return {
            item,
            available,
            requested: item.quantity,
            sufficient: available >= item.quantity,
          };
        })
      );

      const insufficientItems = inventoryChecks.filter((check) => !check.sufficient);
      if (insufficientItems.length > 0) {
        const details = insufficientItems.map(
          (check) =>
            `SKU ${check.item.skuId.sku}: Available=${check.available}, Requested=${check.requested}`
        );
        return res.status(400).json({
          success: false,
          message: 'Insufficient vendor stock for some items',
          data: { insufficientItems: details },
        });
      }

      // Create purchase requests for each cart item
      const createdRequests = [];
      for (const item of cart.items) {
        const request = await B2BPurchaseRequest.create({
          vendorProductId: item.vendorProductId._id,
          skuId: item.skuId._id,
          quantity: item.quantity,
          storeId: storeWarehouse._id,
          storeWarehouseId: storeWarehouse._id,
          dmUserId : dmUserId || null,
          cmUserId : cmUserId || null,
          status: initialStatus,
          requestedBy: actor.id,
          requestedByModel: actor.model,
          approvals: {},
          cartId: cart._id, // Track which cart this came from
          cartItemPrice: item.price, // Store price at time of request
          cartItemCurrency: item.currency || 'USD',
        });
        createdRequests.push(request);

        // Notify DM/CM (non-blocking)
        notifyB2BEvent({ event: 'REQUEST_CREATED', request, actor }).catch((err) => console.error('Notification error:', err));
      }

      // Clear cart after successful request creation
      await B2BCart.findByIdAndUpdate(cart._id, { items: [], subtotal: 0 });

      return res.status(201).json({
        success: true,
        message: `Purchase requests created (${createdRequests.length} items)`,
        data: {
          requestIds: createdRequests.map((r) => r._id),
          status: initialStatus,
          totalAmount: cartTotal,
          walletBalance,
          remainingBalance: walletBalance - cartTotal,
        },
      });
    }

    // Mode 2: Single-item purchase (backward compatible)
    if (!isObjectId(vendorProductId) || !isObjectId(skuId)) {
      return res.status(400).json({ success: false, message: 'Invalid vendorProductId/skuId or provide cartId' });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    const [vendorProduct, sku, storeWarehouse] = await Promise.all([
      VendorProduct.findById(vendorProductId).select('_id vendorModel title').lean(),
      Sku.findById(skuId).select('_id sku productId price currency metalColor metalType size').lean(),
      Warehouse.findById(storeWh).select('_id name districtManager corporateManager isMain isActive requireDMApproval requireCMApproval').lean(),
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

    const available = await sumSkuInventory(sku._id);
    if (available < qty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient vendor stock. Available=${available}, requested=${qty}`,
        data: { available, requested: qty },
      });
    }

    // Validate wallet balance for single item
    const itemTotal = sku.price * qty;
    const inventoryWallet = await InventoryWallet.findOne({ warehouse: storeWh }).lean();
    const walletBalance = inventoryWallet?.balance || 0;

    if (walletBalance < itemTotal) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Available: ${walletBalance.toFixed(2)}, Required: ${itemTotal.toFixed(2)}`,
        data: { walletBalance, required: itemTotal, shortfall: itemTotal - walletBalance },
      });
    }

    const dmUserId = storeWarehouse.districtManager;
    const cmUserId = storeWarehouse.corporateManager;
    // if (!dmUserId || !cmUserId) {
    //   return res.status(400).json({ success: false, message: 'Store is missing DM/CM assignment' });
    // }

    // Determine initial status based on store-level approval flags (v2)
    const requireDM = storeWarehouse.requireDMApproval !== false; // Default true if not set
    const requireCM = storeWarehouse.requireCMApproval !== false; // Default true if not set

    let initialStatus = 'PENDING_ADMIN'; // Default: skip to admin if both flags off
    if (requireDM && requireCM) {
      initialStatus = 'PENDING_DM'; // Full flow: DM → CM → Admin
    } else if (requireDM && !requireCM) {
      initialStatus = 'PENDING_DM'; // DM → Admin (CM skipped)
    } else if (!requireDM && requireCM) {
      initialStatus = 'PENDING_CM'; // CM → Admin (DM skipped)
    }

    const created = await B2BPurchaseRequest.create({
      vendorProductId: vendorProduct._id,
      skuId: sku._id,
      quantity: qty,
      storeId: storeWarehouse._id,
      storeWarehouseId: storeWarehouse._id,
      dmUserId,
      cmUserId,
      status: initialStatus,
      requestedBy: actor.id,
      requestedByModel: actor.model,
      approvals: {},
      cartItemPrice: sku.price,
      cartItemCurrency: sku.currency || 'USD',
    });

    // Notify DM/CM on request creation (non-blocking)
    notifyB2BEvent({ event: 'REQUEST_CREATED', request: created, actor }).catch((err) => console.error('Notification error:', err));

    return res.status(201).json({
      success: true,
      message: 'Purchase request created',
      purchaseId: created._id,
      status: created.status,
      data: {
        requestId: created._id,
        status: created.status,
        vendorProduct: { _id: vendorProduct._id, vendorModel: vendorProduct.vendorModel, title: vendorProduct.title },
        sku: { _id: sku._id, sku: sku.sku },
        storeWarehouse: { _id: storeWarehouse._id, name: storeWarehouse.name },
        totalAmount: itemTotal,
        walletBalance,
        remainingBalance: walletBalance - itemTotal,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create purchase request', error: error.message });
  }
};

/**
 * GET /api/v2/b2b/status/:purchaseId
 * - Store manager can poll status
 * - Approvers/admin can also view
 */
const getPurchaseStatus = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { purchaseId } = req.params;
    if (!isObjectId(purchaseId)) return res.status(400).json({ success: false, message: 'Invalid purchaseId' });

    const request = await B2BPurchaseRequest.findById(purchaseId).lean();
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });

    const canView =
      actor?.isSuperUser ||
      String(request.requestedBy) === String(actor.id) ||
      String(request.dmUserId) === String(actor.id) ||
      String(request.cmUserId) === String(actor.id);

    if (!canView) return res.status(403).json({ success: false, message: 'Access denied' });

    return res.status(200).json({
      success: true,
      message: 'Status retrieved',
      status: request.status,
      data: request,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch purchase status', error: error.message });
  }
};

/**
 * GET /api/v2/b2b/requests
 *
 * Role-based:
 * - DM: only PENDING_DM for assigned stores
 * - CM: only PENDING_CM for assigned stores
 * - Admin: default PENDING_ADMIN, but can request any status via ?status=
 *
 * Optional query:
 * - status=PENDING_DM,PENDING_CM,... (admin only)
 * - storeWarehouseId=<id> (admin only)
 */
const listPurchaseRequests = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();

    const statusParam = String(req.query.status || '').trim();
    const statusList = statusParam
      ? statusParam
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : [];

    const filter = {};

    if (actor?.isSuperUser || role === 'admin') {
      // Admin can view everything; default to PENDING_ADMIN if no explicit status
      if (statusList.length) filter.status = { $in: statusList };
      else filter.status = 'PENDING_ADMIN';

      if (req.query.storeWarehouseId && isObjectId(req.query.storeWarehouseId)) {
        filter.storeWarehouseId = req.query.storeWarehouseId;
      }
    } else if (role === 'district manager') {
      filter.status = 'PENDING_DM';
      filter.dmUserId = actor.id;
    } else if (role === 'corporate manager') {
      filter.status = 'PENDING_CM';
      filter.cmUserId = actor.id;
    } else {
      // Store manager (or any other role): show own requests
      filter.requestedBy = actor.id;
      if (statusList.length) filter.status = { $in: statusList };
    }

    const requests = await B2BPurchaseRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size')
      .populate('storeWarehouseId', 'name isMain')
      .lean();

    const withRequester = await resolveRequestedByDetails(requests);

    return res.status(200).json({
      success: true,
      message: 'Purchase requests retrieved successfully',
      data: withRequester,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to list purchase requests', error: error.message });
  }
};

/**
 * POST /api/v2/b2b/approve/:requestId
 * DM -> PENDING_CM
 * CM -> PENDING_ADMIN
 * Admin -> APPROVED (and moves inventory)
 */
const approvePurchaseRequest = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const { requestId } = req.params;
    if (!isObjectId(requestId)) return res.status(400).json({ success: false, message: 'Invalid requestId' });

    const now = new Date();

    const request = await B2BPurchaseRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });
    if (request.status === 'REJECTED') return res.status(400).json({ success: false, message: 'Request is rejected' });
    if (request.status === 'APPROVED') return res.status(400).json({ success: false, message: 'Request is already approved' });

    const actorId = String(actor.id);

    // DM approval (no transaction needed)
    if (role === 'district manager' && !actor.isSuperUser) {
      if (request.status !== 'PENDING_DM') return res.status(400).json({ success: false, message: 'Request is not pending DM approval' });
      if (String(request.dmUserId) !== actorId) return res.status(403).json({ success: false, message: 'You are not the assigned DM for this store' });

      request.approvals.dm = { userId: actor.id, userModel: actor.model, approvedAt: now };

      // Auto-skip CM if store doesn't require CM approval (v2)
      const storeWarehouse = await Warehouse.findById(request.storeWarehouseId).select('requireCMApproval').lean();
      const requireCM = storeWarehouse?.requireCMApproval !== false; // Default true if not set

      if (requireCM) {
        request.status = 'PENDING_CM';
      } else {
        request.status = 'PENDING_ADMIN'; // Skip CM, go directly to Admin
      }

      await request.save();

      // Notify CM, Admin, Store Manager (non-blocking)
      const dmUser = await (actor.model === 'Customer' ? Customer : User).findById(actor.id).select('username email').lean();
      notifyB2BEvent({ event: 'DM_APPROVED', request, actor: dmUser || actor }).catch((err) => console.error('Notification error:', err));

      return res.status(200).json({ success: true, message: 'Request approved by DM', data: { requestId, status: request.status } });
    }

    // CM approval (no transaction needed)
    if (role === 'corporate manager' && !actor.isSuperUser) {
      if (request.status !== 'PENDING_CM') return res.status(400).json({ success: false, message: 'Request is not pending CM approval' });
      if (String(request.cmUserId) !== actorId) return res.status(403).json({ success: false, message: 'You are not the assigned CM for this store' });

      request.approvals.cm = { userId: actor.id, userModel: actor.model, approvedAt: now };
      request.status = 'PENDING_ADMIN';
      await request.save();

      // Notify Admin, Store Manager (non-blocking)
      const cmUser = await (actor.model === 'Customer' ? Customer : User).findById(actor.id).select('username email').lean();
      notifyB2BEvent({ event: 'CM_APPROVED', request, actor: cmUser || actor }).catch((err) => console.error('Notification error:', err));

      return res.status(200).json({ success: true, message: 'Request approved by CM', data: { requestId, status: request.status } });
    }

    // Admin final approval (inventory mutation) — prefer transaction, fallback if unsupported
    const isAdmin = actor.isSuperUser || role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin approval required' });
    if (request.status !== 'PENDING_ADMIN') return res.status(400).json({ success: false, message: 'Request is not pending admin approval' });

    const runFinalApproval = async (session) => {
      const reqQuery = B2BPurchaseRequest.findById(requestId);
      if (session) reqQuery.session(session);
      const fresh = await reqQuery;
      if (!fresh) throw new Error('Purchase request not found');
      if (fresh.status !== 'PENDING_ADMIN') throw new Error('Request is not pending admin approval');

      const available = await sumSkuInventory(fresh.skuId, session);
      if (available < fresh.quantity) {
        throw new Error(`Insufficient vendor stock at approval time. Available=${available}, requested=${fresh.quantity}`);
      }

      await deductSkuInventory({ skuId: fresh.skuId, quantity: fresh.quantity, session });

      const storeInvOpts = session ? { upsert: true, session } : { upsert: true };
      await StoreInventory.updateOne(
        {
          storeWarehouseId: fresh.storeWarehouseId,
          storeId: fresh.storeId,
          vendorProductId: fresh.vendorProductId,
          skuId: fresh.skuId,
        },
        { $inc: { quantity: fresh.quantity } },
        storeInvOpts
      );

      // Deduct wallet balance (InventoryWallet for B2B purchases)
      const itemTotal = (fresh.cartItemPrice || 0) * fresh.quantity;
      if (itemTotal > 0) {
        const inventoryWalletQuery = InventoryWallet.findOne({ warehouse: fresh.storeWarehouseId });
        if (session) inventoryWalletQuery.session(session);
        const inventoryWallet = await inventoryWalletQuery;

        if (!inventoryWallet) {
          throw new Error('Inventory wallet not found for store warehouse');
        }

        if (inventoryWallet.balance < itemTotal) {
          throw new Error(
            `Insufficient wallet balance at approval time. Available: ${inventoryWallet.balance}, Required: ${itemTotal}`
          );
        }

        inventoryWallet.balance -= itemTotal;
        inventoryWallet.lastTransaction = now;
        await inventoryWallet.save(session ? { session } : {});
      }

      fresh.approvals.admin = { userId: actor.id, userModel: actor.model, approvedAt: now };
      fresh.status = 'APPROVED';
      await fresh.save(session ? { session } : {});

      // Notify Store Manager, DM, CM (non-blocking, after save)
      const adminUser = await (actor.model === 'Customer' ? Customer : User).findById(actor.id).select('username email').lean();
      notifyB2BEvent({ event: 'ADMIN_APPROVED', request: fresh, actor: adminUser || actor }).catch((err) => console.error('Notification error:', err));
    };

    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => runFinalApproval(session));
      } finally {
        session.endSession();
      }
    } catch (txErr) {
      // Fallback for standalone MongoDB environments (no transactions)
      const msg = String(txErr?.message || '');
      if (msg.includes('Transaction numbers are only allowed') || msg.includes('replica set')) {
        await runFinalApproval(null);
      } else {
        throw txErr;
      }
    }

    return res.status(200).json({ success: true, message: 'Request approved by Admin (inventory moved to store)', data: { requestId, status: 'APPROVED' } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v2/b2b/reject/:requestId
 */
const rejectPurchaseRequest = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const { requestId } = req.params;
    const { reason } = req.body || {};

    if (!isObjectId(requestId)) return res.status(400).json({ success: false, message: 'Invalid requestId' });

    const request = await B2BPurchaseRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });
    if (request.status === 'REJECTED') return res.status(400).json({ success: false, message: 'Request is already rejected' });
    if (request.status === 'APPROVED') return res.status(400).json({ success: false, message: 'Cannot reject an approved request' });

    const actorId = String(actor.id);
    const isAdmin = actor.isSuperUser || role === 'admin';

    if (!isAdmin) {
      if (request.status === 'PENDING_DM' && (role !== 'district manager' || String(request.dmUserId) !== actorId)) {
        return res.status(403).json({ success: false, message: 'Only assigned DM can reject this request' });
      }
      if (request.status === 'PENDING_CM' && (role !== 'corporate manager' || String(request.cmUserId) !== actorId)) {
        return res.status(403).json({ success: false, message: 'Only assigned CM can reject this request' });
      }
      if (request.status === 'PENDING_ADMIN') {
        return res.status(403).json({ success: false, message: 'Only admin can reject at admin stage' });
      }
    }

    request.status = 'REJECTED';
    request.rejection = {
      rejectedBy: actor.id,
      rejectedByModel: actor.model,
      rejectedAt: new Date(),
      reason: String(reason || ''),
    };
    await request.save();

    // Notify Store Manager, DM, CM, Admin (non-blocking)
    const rejectorUser = await (actor.model === 'Customer' ? Customer : User).findById(actor.id).select('username email').lean();
    notifyB2BEvent({ event: 'REJECTED', request, actor: rejectorUser || actor }).catch((err) => console.error('Notification error:', err));

    return res.status(200).json({ success: true, message: 'Purchase request rejected', data: { requestId } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reject request', error: error.message });
  }
};

/**
 * GET /api/v2/b2b/store-inventory
 * Admin-only: view store inventory created from approved B2B purchases.
 *
 * Optional query:
 * - storeWarehouseId=<id>
 */
const listStoreInventory = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin = actor.isSuperUser || role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin access required' });

    const filter = {};
    if (req.query.storeWarehouseId && isObjectId(req.query.storeWarehouseId)) {
      filter.storeWarehouseId = req.query.storeWarehouseId;
    }

    const rows = await StoreInventory.find(filter)
      .sort({ updatedAt: -1 })
      .populate('storeWarehouseId', 'name isMain')
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size')
      .lean();

    return res.status(200).json({ success: true, message: 'Store inventory retrieved', data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to list store inventory', error: error.message });
  }
};

/**
 * GET /api/v2/b2b/store-inventory/my
 * Store managers can view inventory that was added to their store via approved B2B purchase requests.
 */
const listMyStoreInventory = async (req, res) => {
  try {
    const actor = req.b2bActor;

    // Determine selected store warehouse
    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    const storeWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!storeWarehouseId || !isObjectId(storeWarehouseId)) {
      return res.status(400).json({ success: false, message: 'No store warehouse selected' });
    }

    // Non-admin users can only view their own store inventory
    if (!actor?.isSuperUser) {
      const owns = (selectedWarehouse && selectedWarehouse === String(storeWarehouseId)) || userWarehouses.includes(String(storeWarehouseId));
      if (!owns) {
        return res.status(403).json({ success: false, message: 'You are not allowed to view this store inventory' });
      }
    }

    const rows = await StoreInventory.find({ storeWarehouseId })
      .sort({ updatedAt: -1 })
      .populate('storeWarehouseId', 'name isMain')
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size images')
      .lean();

    return res.status(200).json({ success: true, message: 'My store inventory retrieved', data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch my store inventory', error: error.message });
  }
};

module.exports = {
  createPurchaseRequest,
  getPurchaseStatus,
  listPurchaseRequests,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  listStoreInventory,
  listMyStoreInventory,
};


