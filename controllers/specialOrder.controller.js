const { sendEmail } = require('../config/sendMails');
const SpecialOrder = require('../models/specialOrder.model');
const { attachUnreadChatCount, markChatMessagesSeen } = require('../utils/chatUnread');
const mongoose = require('mongoose');
const specialOrderReceiverModel = require('../models/specialOrderReceiver.model');
const { emitSpoChatMessage } = require('../socket/spoChat.socket');
const { emitAdminChatUnreadChanged } = require('../socket/adminChat.socket');
const { emitCustomerChatUnreadChanged } = require('../socket/customerChat.socket');
const { notifySpoRequesterSms } = require('../utils/spoRequesterSms');
const {
  buildCreatorSpecialOrderEmail,
  buildAdminSpecialOrderEmail,
} = require('../utils/specialOrderEmailTemplates');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());
const MAX_REPLY_PREVIEW = 88;

function getRequesterId(order) {
  const rb = order.requestedBy;
  if (!rb) return '';
  return String(rb._id || rb);
}

function normalizeRefId(ref) {
  if (ref == null) return '';
  if (typeof ref === 'object' && ref._id != null) return String(ref._id);
  return String(ref);
}

/** JWT-selected warehouse / store — same scope as GET /special-orders?view=store */
function userSelectedWarehouseId(req) {
  const w = req.user?.selectedWarehouse;
  return normalizeRefId(w);
}

function orderStoreId(order) {
  if (!order?.storeId) return '';
  return normalizeRefId(order.storeId);
}

/** Same-store teammates can view / chat on orders for their warehouse (not only the requester). */
function userSharesOrderStore(req, order) {
  const wid = userSelectedWarehouseId(req);
  const sid = orderStoreId(order);
  if (!wid || !sid) return false;
  return wid === sid;
}

/** Dashboard admins who may manage SPO without superuser flag */
function isPrivilegedSpecialOrderAdmin(req) {
  if (!req.user) return false;
  if (req.user.is_superuser) return true;
  const r = String(req.user.role || '')
    .toLowerCase()
    .trim();
  return r === 'admin' || r === 'super admin' || r === 'superuser';
}

function canAccessSpecialOrderDoc(req, order) {
  if (!order) return false;
  if (isPrivilegedSpecialOrderAdmin(req)) return true;
  if (getRequesterId(order) === String(req.user._id)) return true;
  if (userSharesOrderStore(req, order)) return true;
  return false;
}




/**
 * POST /api/special-orders
 * Store Manager submits a special order request
 */
const createSpecialOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const userModel = req.user.constructor?.modelName === 'User' ? 'User' : 'Customer';

    const selectedWarehouse = req.user?.selectedWarehouse;
    const userWarehouses = Array.isArray(req.user?.warehouse)
      ? req.user.warehouse.map((w) => (typeof w === 'object' ? w._id : w))
      : [];

    let storeId = null;
    if (selectedWarehouse) {
      storeId = typeof selectedWarehouse === 'object' ? selectedWarehouse._id : selectedWarehouse;
    }
    if (!storeId && userWarehouses.length) {
      storeId = typeof userWarehouses[0] === 'object' ? userWarehouses[0]._id : userWarehouses[0];
    }

    if (!storeId || !isObjectId(storeId)) {
      return res.status(400).json({
        success: false,
        message: 'No store/warehouse found. Please log in with a selected warehouse.',
      });
    }

    const {
      receiptNumber,
      customerNumber,
      typeOfRequest,
      eta,
      referenceSkuNumber,
      metalQuality,
      diamondType,
      diamondColor,
      diamondClarity,
      diamondDetails,
      customization,
      notes,
    } = req.body || {};

    if (!typeOfRequest || !metalQuality || !diamondType) {
      return res.status(400).json({
        success: false,
        message: 'TYPE OF REQUEST, METAL QUALITY, and DIAMOND TYPE are required.',
      });
    }

    const files = req.files || {};
    const attachmentFiles = files.attachments || [];
    const canvasFile = Array.isArray(files.canvasDrawing) ? files.canvasDrawing[0] : files.canvasDrawing;
    const attachmentPaths = attachmentFiles.map((f) => `spo/${f.filename}`);
    const canvasDrawingPath = canvasFile ? `spo/${canvasFile.filename}` : '';

    const order = await SpecialOrder.create({
      receiptNumber: receiptNumber || '',
      storeId,
      assignedTo: null,
      customerNumber: customerNumber || '',
      typeOfRequest,
      referenceSkuNumber: referenceSkuNumber || '',
      metalQuality,
      diamondType,
      diamondColor: diamondColor || '',
      diamondClarity: diamondClarity || '',
      diamondDetails: diamondDetails || '',
      customization: customization || '',
      attachments: attachmentPaths,
      canvasDrawing: canvasDrawingPath || '',
      status: 'SUBMITTED',
      notes: notes || '',
      eta: eta ? new Date(eta) : null,
      requestedBy: userId,
      requestedByModel: userModel,
    });

    const populated = await SpecialOrder.findById(order._id)
      .populate('storeId', 'name storeEmail')
      .lean();
      
      // send email dynamic user start
      const emails = [];
      const customerOrderUrl = `${process.env.FRONTEND_URL || 'https://vallianimarketplace.com'}/en/special-order/${order._id}`;
      const adminOrderUrl = `${process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com'}/#/products/special-orders/${order._id}`;
      const requester = req.user;
      const formData = {
        receiptNumber,
        customerNumber,
        typeOfRequest,
        referenceSkuNumber,
        metalQuality,
        diamondType,
        diamondColor,
        diamondClarity,
        diamondDetails,
        customization,
        notes,
        eta,
      };

      const sharedEmailPayload = {
        order,
        requester,
        populated,
        formData,
        attachmentCount: attachmentPaths.length,
      };

      const creatorEmailHtml = buildCreatorSpecialOrderEmail({
        ...sharedEmailPayload,
        orderUrl: customerOrderUrl,
      });
      const adminEmailHtml = buildAdminSpecialOrderEmail({
        ...sharedEmailPayload,
        orderUrl: adminOrderUrl,
      });
     
      if (requester?.email) {
        emails.push({
          to: requester.email,
          subject: `Special Order Submitted - ${order.ticketNumber}`,
          html: creatorEmailHtml,
        });
      }

      // 2️⃣ Get admin receivers from DB
      const receivers = await specialOrderReceiverModel.find({ isActive: true })
        .populate('userId', 'email username')
        .lean();

      receivers.forEach(r => {
        if (r.userId?.email) {
          emails.push({
            to: r.userId.email,
            subject: `New Special Order - ${order.ticketNumber}`,
            html: adminEmailHtml,
          });
        }
      });

      const storeEmail = String(populated?.storeId?.storeEmail || '').trim().toLowerCase();
      if (storeEmail) {
        const alreadyNotified = emails.some(
          (mail) => String(mail.to || '').trim().toLowerCase() === storeEmail
        );
        if (!alreadyNotified) {
          emails.push({
            to: storeEmail,
            subject: `New Special Order - ${order.ticketNumber}`,
            html: adminEmailHtml,
          });
        }
      }

      // 3️⃣ Send emails (non-blocking like your existing system)
      if (emails.length > 0) {
        Promise.all(emails.map(mail => sendEmail(mail)))
          .catch(err => console.error('Special Order email error:', err));
      }

      // send email dynamic user end


    return res.status(201).json({
      success: true,
      message: 'Special order request submitted successfully',
      data: populated,
      ticketNumber: order.ticketNumber,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to submit special order',
      error: error.message,
    });
  }
};

/**
 * GET /api/special-orders (user's own requests)
 */
const listMySpecialOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const selectedWarehouse = req.user.selectedWarehouse;

    const view = String(req.query.view || 'mine').toLocaleLowerCase();
    let filter ={};

    if (view === 'store'){
      if(!selectedWarehouse){
        return res.status(400).json({
          success: false,
          message : "no warehouse assigned to this user",
        });
      }
      filter = {
        $or:[
          {storeId: selectedWarehouse}
        ],
      };

    } else {
      filter = {
        requestedBy: userId,
      }
    }

    const orders = await SpecialOrder.find(filter)
    .populate('storeId', 'name')
    .populate('requestedBy', 'username email userId')
    .sort({ createdAt: -1 })
    .lean();

    const viewerModel = req.b2bActor?.model || 'Customer';
    const data = attachUnreadChatCount(orders, req.user._id, viewerModel);
    
    return res.status(200).json({
      success: true,
      message: view === "store" ? 'Store special orders retrieved' :"My special orders retrieved",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch special orders',
      error: error.message,
    });
  }
};

/**
 * GET /api/special-orders/admin (admin list - all requests)
 */
const listAdminSpecialOrders = async (req, res) => {
  try {
    const status = req.query.status;
    const storeId = req.query.storeId;
    const search = req.query.search;

    const statusValues = Array.isArray(status)
      ? status
      : typeof status === 'string'
      ? status.split(',').map((s) => s.trim()).filter(Boolean)
      : []
    const storeIds = Array.isArray(storeId)
      ? storeId
      : typeof storeId === 'string'
      ? storeId.split(',').map((id) => id.trim()).filter(Boolean)
      : []

    const filter = {};
    if (statusValues.length) filter.status = { $in: statusValues };
    if (storeIds.length) {
      const validStoreIds = storeIds.filter(isObjectId)
      if (validStoreIds.length) filter.storeId = { $in: validStoreIds };
    }
    if (search && search.trim()) {
      filter.$or = [
        { ticketNumber: { $regex: search.trim(), $options: 'i' } },
        { receiptNumber: { $regex: search.trim(), $options: 'i' } },
        { customerNumber: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const [total, orders] = await Promise.all([
      SpecialOrder.countDocuments(filter),
      SpecialOrder.find(filter)
        .populate('storeId', 'name')
        .populate('requestedBy', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const viewerModel = req.b2bActor?.model || 'User';
    const data = attachUnreadChatCount(orders, req.user._id, viewerModel);

    return res.status(200).json({
      success: true,
      message: 'Special orders retrieved',
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
        hasNextPage: page * limit < total,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch special orders',
      error: error.message,
    });
  }
};

/**
 * GET /api/special-orders/:id (admin get single order by id)
 */
const getSpecialOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const order = await SpecialOrder.findById(id)
      .populate('storeId', 'name')
      .populate('requestedBy', 'username email userId')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // if (!canAccessSpecialOrderDoc(req, order)) {
    //   return res.status(403).json({ success: false, message: 'Access denied' });
    // }

    return res.status(200).json({
      success: true,
      message: 'Special order retrieved',
      data: order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch special order',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/special-orders/:id (admin update status, assignedTo, eta, notes)
 */
const updateSpecialOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    const { status, assignedTo, eta, notes ,trackingId , trackingProvider ,trackingUrl} = req.body || {};

    if (status === 'FINALIZED') {
      return res.status(400).json({
        success: false,
        message: 'FINALIZED is set only when the requester confirms receipt.',
      });
    }

    const TRACKING_URLS = {
      UPS: 'https://www.ups.com/track?tracknum=',
      FEDEX: 'https://www.fedex.com/fedextrack/?trknbr=',
    };

    const update = {};

    if (status != null) update.status = status;
    if (assignedTo != null) update.assignedTo = assignedTo;
    if (eta != null) update.eta = eta === '' ? null : new Date(eta);
    if (notes != null) update.notes = notes;
    if (trackingId != null) update.trackingId = String(trackingId).trim();

    if (trackingProvider != null) {
      update.trackingProvider = trackingProvider;
      update.trackingUrl = TRACKING_URLS[trackingProvider] || '';
    }

    const existingOrder = await SpecialOrder.findById(id).lean();

    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const changes = {};
    const updatedFields = [];

    Object.keys(update).forEach((key) => {
      const oldValue =
        existingOrder[key] instanceof Date
          ? existingOrder[key].toISOString()
          : existingOrder[key];

      const newValue =
        update[key] instanceof Date
          ? update[key].toISOString()
          : update[key];

      if (String(oldValue ?? '') !== String(newValue ?? '')) {
        updatedFields.push(key);
        changes[key] = {
          from: existingOrder[key] ?? null,
          to: update[key] ?? null,
        };
      }
    });

    if (updatedFields.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No changes detected',
        data: existingOrder,
      });
    }

    const updaterId = req.user?._id || req.user?.id;
    const updaterModel = req.user?.constructor?.modelName === 'User' ? 'User' : 'Customer';
    const updaterName =
      req.user?.username ||
      req.user?.name ||
      req.user?.email ||
      'Unknown User';

    const order = await SpecialOrder.findByIdAndUpdate(
      id,
      {
        $set: update,
        $push: {
          updateHistory: {
            updatedBy: updaterId,
            updatedByModel: updaterModel,
            updatedByName: updaterName,
            updatedFields,
            changes,
            updatedAt: new Date(),
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('storeId', 'name')
      .populate('requestedBy', 'username email')
      .populate('updateHistory.updatedBy', 'username email')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Special order updated',
      data: order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update special order',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/special-orders/:id/finalize — requester marks a delivered (CLOSED) order as finalized.
 */
const finalizeSpecialOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const order = await SpecialOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const orderLean = order.toObject();
    const canFinalize =
      isPrivilegedSpecialOrderAdmin(req) ||
      String(order.requestedBy) === String(req.user._id) ||
      userSharesOrderStore(req, orderLean);

    if (!canFinalize) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (order.status !== 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'You can finalize only after the order is marked delivered by the team.',
      });
    }

    order.status = 'FINALIZED';
    await order.save();

    const populated = await SpecialOrder.findById(order._id)
      .populate('storeId', 'name')
      .populate('requestedBy', 'username email phone_number')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Order finalized',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to finalize order',
      error: error.message,
    });
  }
};

const listSpoChatMessages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const order = await SpecialOrder.findById(id)
      .populate('requestedBy', 'username email')
      .select('requestedBy storeId chatMessages status')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    // if (!canAccessSpecialOrderDoc(req, order)) {
    //   return res.status(403).json({ success: false, message: 'Access denied' });
    // }

    const messages = (order.chatMessages || []).map((m) => ({
      _id: m._id,
      text: m.text,
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
      role: m.role,
      senderId: m.senderId,
      senderName: m.senderName,
      replyToMessageId: m.replyToMessageId || null,
      replyToText: m.replyToText || '',
      replyToSenderName: m.replyToSenderName || '',
      seenBy: Array.isArray(m.seenBy) ? m.seenBy : [],
      createdAt: m.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load messages',
      error: error.message,
    });
  }
};

const markSpoChatSeen = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const order = await SpecialOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    // if (!canAccessSpecialOrderDoc(req, order.toObject())) {
    //   return res.status(403).json({ success: false, message: 'Access denied' });
    // }

    const viewerModel = req.b2bActor?.model || 'User';
    const touched = markChatMessagesSeen(order, req.user._id, viewerModel);
    if (touched) {
      await order.save();
      const storeId = normalizeRefId(order.storeId);
      const requesterId = getRequesterId(order);
      emitAdminChatUnreadChanged({
        channel: 'spo',
        orderId: String(order._id),
        action: 'seen',
      });
      emitCustomerChatUnreadChanged({
        channel: 'spo',
        orderId: String(order._id),
        action: 'seen',
        userId: requesterId,
        warehouseId: storeId,
      });
    }

    return res.status(200).json({ success: true, data: { updated: touched } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to mark messages seen',
      error: error.message,
    });
  }
};

const postSpoChatMessage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const text = String(req.body?.text || '').trim();
    const replyToMessageIdRaw = req.body?.replyToMessageId;
    const chatFiles = Array.isArray(req.files) ? req.files : [];
    const attachmentPaths = chatFiles.map((f) => `spo/${f.filename}`);

    if (!text && attachmentPaths.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message text or at least one attachment is required',
      });
    }
    if (text.length > 4000) {
      return res.status(400).json({ success: false, message: 'Message too long' });
    }

    const order = await SpecialOrder.findById(id).populate(
      'requestedBy',
      'username email phone_number'
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const orderLean = order.toObject();
    // if (!canAccessSpecialOrderDoc(req, orderLean)) {
    //   return res.status(403).json({ success: false, message: 'Access denied' });
    // }

    const isAdmin = isPrivilegedSpecialOrderAdmin(req);
    const role = isAdmin ? 'admin' : 'user';

    if (order.status === 'FINALIZED' && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'This order is finalized. Chat is read-only.',
      });
    }

    const senderName =
      req.user.username ||
      req.user.email ||
      (isAdmin ? 'Admin' : 'User');

    let replyToMessageId = null;
    let replyToText = '';
    let replyToSenderName = '';
    if (replyToMessageIdRaw && isObjectId(replyToMessageIdRaw)) {
      const ref = order.chatMessages.id(replyToMessageIdRaw);
      if (ref) {
        replyToMessageId = ref._id;
        replyToSenderName = ref.senderName || (ref.role === 'admin' ? 'Admin' : 'User');
        const compact = String(ref.text || '').replace(/\s+/g, ' ').trim();
        replyToText =
          compact.length > MAX_REPLY_PREVIEW
            ? `${compact.slice(0, MAX_REPLY_PREVIEW)}...`
            : compact;
      }
    }

    const viewerModel = req.b2bActor?.model || 'User';
    order.chatMessages.push({
      text,
      attachments: attachmentPaths,
      role,
      senderId: req.user._id,
      senderName,
      replyToMessageId,
      replyToText,
      replyToSenderName,
      seenBy: [{ userId: req.user._id, userModel: viewerModel, seenAt: new Date() }],
    });

    await order.save();
    const last = order.chatMessages[order.chatMessages.length - 1];
    const payload = {
      _id: last._id,
      text: last.text,
      attachments: Array.isArray(last.attachments) ? last.attachments : [],
      role: last.role,
      senderId: last.senderId,
      senderName: last.senderName,
      replyToMessageId: last.replyToMessageId || null,
      replyToText: last.replyToText || '',
      replyToSenderName: last.replyToSenderName || '',
      seenBy: Array.isArray(last.seenBy) ? last.seenBy : [],
      createdAt: last.createdAt,
    };

    emitSpoChatMessage(String(order._id), payload);
    const storeId = normalizeRefId(order.storeId);
    const requesterId = getRequesterId(order);
    if (role === 'user') {
      emitAdminChatUnreadChanged({
        channel: 'spo',
        orderId: String(order._id),
        action: 'message',
      });
    } else if (role === 'admin') {
      emitCustomerChatUnreadChanged({
        channel: 'spo',
        orderId: String(order._id),
        action: 'message',
        userId: requesterId,
        warehouseId: storeId,
      });
    }

    if (role === 'admin' && order.requestedBy) {
      const rb = order.requestedBy;
      const phone = rb.phone_number || rb.phone;
      if (phone) {
        void notifySpoRequesterSms({
          to: phone,
          ticketNumber: order.ticketNumber,
          snippet: text || (attachmentPaths.length ? 'Sent an attachment' : ''),
        });
      }
    }

    return res.status(201).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message,
    });
  }
};

module.exports = {
  createSpecialOrder,
  listMySpecialOrders,
  listAdminSpecialOrders,
  getSpecialOrderById,
  updateSpecialOrder,
  finalizeSpecialOrder,
  listSpoChatMessages,
  postSpoChatMessage,
  markSpoChatSeen,
  isPrivilegedSpecialOrderAdmin,
};
