const { sendEmail } = require('../config/sendMails');
const SpecialOrder = require('../models/specialOrder.model');
const mongoose = require('mongoose');
const specialOrderReceiverModel = require('../models/specialOrderReceiver.model');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

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
      eta: null,
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
      .populate('requestedBy', 'username email')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

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

module.exports = {
  createSpecialOrder,
  listMySpecialOrders,
  listAdminSpecialOrders,
  getSpecialOrderById,
  updateSpecialOrder,
};
