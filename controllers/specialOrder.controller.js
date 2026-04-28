const { sendEmail } = require('../config/sendMails');
const SpecialOrder = require('../models/specialOrder.model');
const mongoose = require('mongoose');
const specialOrderReceiverModel = require('../models/specialOrderReceiver.model');
const { emitSpoChatMessage } = require('../socket/spoChat.socket');
const { notifySpoRequesterSms } = require('../utils/spoRequesterSms');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());
const MAX_REPLY_PREVIEW = 88;

function getRequesterId(order) {
  const rb = order.requestedBy;
  if (!rb) return '';
  return String(rb._id || rb);
}

function canAccessSpecialOrderDoc(req, order) {
  if (!order) return false;
  if (req.user?.is_superuser) return true;
  return getRequesterId(order) === String(req.user._id);
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
      .populate('storeId', 'name')
      .lean();
      
      // send email dynamic user start
      // 1️⃣ Creator email
      const emails = [];

      const requester = req.user;
      if (requester?.email) {
        emails.push({
          to: requester.email,
          subject: `Special Order Submitted - ${order.ticketNumber}`,
          html: `
            <h2>Special Order Submitted</h2>
            <p>Your special order <strong>${order.ticketNumber}</strong> has been submitted successfully.</p>
            <p>Store: ${populated?.storeId?.name || ''}</p>
            <p>Status: SUBMITTED</p>
          `
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
            html: `
              <h2>New Special Order Received</h2>
              <p><strong>Ticket:</strong> ${order.ticketNumber}</p>
              <p><strong>Requested By:</strong> ${requester?.username || ''}</p>
              <p><strong>Store:</strong> ${populated?.storeId?.name || ''}</p>
              <p><a href="${process.env.ADMIN_URL}/special-orders/${order._id}">
              View Order</a></p>
            `
          });
        }
      });

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
    const orders = await SpecialOrder.find({ requestedBy: userId })
      .populate('storeId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Special orders retrieved',
      data: orders,
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

    const filter = {};
    if (status) filter.status = status;
    if (storeId && isObjectId(storeId)) filter.storeId = storeId;
    if (search && search.trim()) {
      filter.$or = [
        { ticketNumber: { $regex: search.trim(), $options: 'i' } },
        { receiptNumber: { $regex: search.trim(), $options: 'i' } },
        { customerNumber: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const orders = await SpecialOrder.find(filter)
      .populate('storeId', 'name')
      .populate('requestedBy', 'username email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Special orders retrieved',
      data: orders,
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
      .populate('requestedBy', 'username email phone_number')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!canAccessSpecialOrderDoc(req, order)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

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
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const { status, assignedTo, eta, notes } = req.body || {};

    if (status === 'FINALIZED') {
      return res.status(400).json({
        success: false,
        message: 'FINALIZED is set only when the requester confirms receipt.',
      });
    }

    const update = {};
    if (status != null) update.status = status;
    if (assignedTo != null) update.assignedTo = assignedTo;
    if (eta != null) update.eta = eta === '' ? null : new Date(eta);
    if (notes != null) update.notes = notes;

    const order = await SpecialOrder.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .populate('storeId', 'name')
      .populate('requestedBy', 'username email')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

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

    if (String(order.requestedBy) !== String(req.user._id)) {
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
      .select('requestedBy chatMessages status')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!canAccessSpecialOrderDoc(req, order)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.status(200).json({
      success: true,
      data: order.chatMessages || [],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load messages',
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
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
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
    if (!canAccessSpecialOrderDoc(req, orderLean)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const isAdmin = !!req.user.is_superuser;
    const role = isAdmin ? 'admin' : 'user';

    if (order.status === 'FINALIZEDs') {
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

    order.chatMessages.push({
      text,
      role,
      senderId: req.user._id,
      senderName,
      replyToMessageId,
      replyToText,
      replyToSenderName,
    });

    await order.save();
    const last = order.chatMessages[order.chatMessages.length - 1];
    const payload = {
      _id: last._id,
      text: last.text,
      role: last.role,
      senderId: last.senderId,
      senderName: last.senderName,
      replyToMessageId: last.replyToMessageId || null,
      replyToText: last.replyToText || '',
      replyToSenderName: last.replyToSenderName || '',
      createdAt: last.createdAt,
    };

    emitSpoChatMessage(String(order._id), payload);

    if (role === 'admin' && order.requestedBy) {
      const rb = order.requestedBy;
      const phone = rb.phone_number || rb.phone;
      if (phone) {
        void notifySpoRequesterSms({
          to: phone,
          ticketNumber: order.ticketNumber,
          snippet: text,
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
};
