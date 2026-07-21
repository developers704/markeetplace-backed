const fs = require('fs');
const path = require('path');
const SupportChat = require('../models/supportChat.model');
const User = require('../models/user.model');
const UserRole = require('../models/userRole.model');
const supportChatAgent = require('../services/supportChatAgent.service');
const { getUploadsStaticDir, filePathToPublicUrl } = require('../config/uploadPaths');
const {
  emitSupportChatMessage,
  emitSupportChatSessionUpdated,
} = require('../socket/supportChat.socket');
const { notifySupportChatRecipientsForSession } = require('../services/supportChatEmailRecipient.service');

function normId(ref) {
  if (ref == null) return '';
  if (typeof ref === 'object' && ref._id != null) return String(ref._id);
  return String(ref);
}

async function appendHumanSupportEmailNotifications(session, options = {}) {
  const result = await notifySupportChatRecipientsForSession(session, options);
  if (result.sent > 0) {
    await appendMessage(session, {
      role: 'system',
      text: `Support request emailed to **${result.sent}** configured agent${result.sent === 1 ? '' : 's'}.`,
      senderName: 'System',
    });
  } else if (result.skipped) {
    await appendMessage(session, {
      role: 'system',
      text: 'Human support requested. Configure email recipients in **Settings → Support Chat Email Recipients**.',
      senderName: 'System',
    });
  }
  return result;
}

async function isPrivilegedAdminUser(user) {
  if (!user?._id) return false;
  if (user.is_superuser) return true;
  const u = await User.findById(user._id).select('is_superuser role username').lean();
  if (u?.is_superuser) return true;
  if (u?.role) {
    const roleDoc = await UserRole.findById(u.role).select('role_name').lean();
    const rn = String(roleDoc?.role_name || '').toLowerCase().trim();
    if (rn === 'admin' || rn === 'super admin' || rn === 'superuser') return true;
  }
  return false;
}

function toMessagePayload(msg) {
  if (!msg) return null;
  const plain = msg.toObject ? msg.toObject() : msg;
  return {
    _id: plain._id,
    role: plain.role,
    text: plain.text || '',
    senderId: plain.senderId ? String(plain.senderId) : null,
    senderName: plain.senderName || '',
    attachments: plain.attachments || [],
    imageAnalysis: plain.imageAnalysis || null,
    products: plain.products || [],
    productSearch: plain.productSearch
      ? {
          totalMatches: Number(plain.productSearch.totalMatches || 0),
          hasMore: plain.productSearch.hasMore === true,
        }
      : null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

function toSessionPayload(session, options = {}) {
  const plain = session.toObject ? session.toObject() : session;
  const allMessages = plain.messages || [];
  const limit =
    options.limit !== undefined
      ? Math.min(Math.max(Number(options.limit) || 0, 0), 100)
      : null;
  const before = options.before ? String(options.before) : null;

  let selectedMessages = allMessages;
  let messagePagination = null;

  if (limit !== null) {
    const total = allMessages.length;
    if (limit === 0) {
      selectedMessages = [];
      messagePagination = {
        total,
        hasOlder: total > 0,
        hasNewer: false,
        oldestLoadedId: null,
        newestLoadedId: total ? allMessages[total - 1]?._id : null,
      };
    } else if (before) {
      const beforeIdx = allMessages.findIndex((m) => String(m._id) === before);
      if (beforeIdx === -1) {
        selectedMessages = allMessages.slice(-limit);
      } else {
        const start = Math.max(0, beforeIdx - limit);
        selectedMessages = allMessages.slice(start, beforeIdx);
      }
      const startIdx =
        selectedMessages.length > 0
          ? allMessages.findIndex((m) => String(m._id) === String(selectedMessages[0]._id))
          : -1;
      messagePagination = {
        total,
        hasOlder: startIdx > 0,
        hasNewer: beforeIdx !== -1 && beforeIdx < allMessages.length,
        oldestLoadedId: selectedMessages[0]?._id || null,
        newestLoadedId: selectedMessages[selectedMessages.length - 1]?._id || null,
      };
    } else {
      selectedMessages = allMessages.slice(-limit);
      const startIdx =
        selectedMessages.length > 0
          ? allMessages.findIndex((m) => String(m._id) === String(selectedMessages[0]._id))
          : -1;
      messagePagination = {
        total,
        hasOlder: startIdx > 0,
        hasNewer: false,
        oldestLoadedId: selectedMessages[0]?._id || null,
        newestLoadedId: selectedMessages[selectedMessages.length - 1]?._id || null,
      };
    }
  }

  const payload = {
    _id: String(plain._id),
    customerId: String(plain.customerId),
    customerName: plain.customerName || '',
    customerEmail: plain.customerEmail || '',
    warehouseId: plain.warehouseId || '',
    mode: plain.mode,
    assignedAdminId: plain.assignedAdminId ? String(plain.assignedAdminId) : null,
    assignedAdminName: plain.assignedAdminName || '',
    unreadByCustomer: plain.unreadByCustomer || 0,
    unreadByAdmin: plain.unreadByAdmin || 0,
    status: plain.status,
    lastMessageAt: plain.lastMessageAt,
    messages: selectedMessages.map(toMessagePayload),
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };

  if (messagePagination) {
    payload.messagePagination = messagePagination;
  }

  return payload;
}

function customerDisplayName(user) {
  const first = user?.first_name || user?.firstName || '';
  const last = user?.last_name || user?.lastName || '';
  const full = `${first} ${last}`.trim();
  return full || user?.username || user?.email || 'Customer';
}

function saveSupportChatImage(buffer, originalname) {
  const dir = path.join(getUploadsStaticDir(), 'support-chat');
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(String(originalname || '')).toLowerCase() || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
  const filename = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
  const absPath = path.join(dir, filename);
  fs.writeFileSync(absPath, buffer);
  return filePathToPublicUrl(`uploads/support-chat/${filename}`);
}

async function getOrCreateOpenSession(user) {
  let session = await SupportChat.findOne({
    customerId: user._id,
    status: 'open',
  }).sort({ updatedAt: -1 });

  if (!session) {
    session = await SupportChat.create({
      customerId: user._id,
      customerName: customerDisplayName(user),
      customerEmail: user.email || '',
      warehouseId: normId(user.selectedWarehouse),
      mode: 'ai',
      messages: [
        {
          role: 'assistant',
          text: [
            'Welcome to Valliani Support.',
            '',
            'I can answer live inventory questions, find products by SKU or vendor model, and match jewelry photos to our catalog.',
            '',
            'Upload an image or ask anything — say **Connect to human** anytime for a live agent.',
          ].join('\n'),
          senderName: 'Valliani AI',
        },
      ],
      lastMessageAt: new Date(),
    });
  }

  return session;
}

async function appendMessage(session, payload) {
  session.messages.push(payload);
  session.lastMessageAt = new Date();
  await session.save();
  const last = session.messages[session.messages.length - 1];
  const messagePayload = toMessagePayload(last);
  emitSupportChatMessage(String(session._id), messagePayload);
  return messagePayload;
}

exports.getMySession = async (req, res) => {
  try {
    const session = await getOrCreateOpenSession(req.user);
    if (session.unreadByCustomer > 0) {
      session.unreadByCustomer = 0;
      await session.save();
    }

    const limitParam = req.query.limit;
    const parsedLimit =
      limitParam !== undefined && limitParam !== null && String(limitParam).trim() !== ''
        ? Math.min(Math.max(parseInt(String(limitParam), 10) || 0, 0), 100)
        : 40;
    const before = req.query.before ? String(req.query.before) : null;

    return res.json({
      success: true,
      data: toSessionPayload(session, { limit: parsedLimit, before }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load chat' });
  }
};

exports.loadMoreProducts = async (req, res) => {
  try {
    const session = await SupportChat.findOne({
      _id: req.params.sessionId,
      customerId: req.user._id,
      status: 'open',
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    const message = session.messages.id(req.params.messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    if (!message.productSearch?.searchParams || message.productSearch.hasMore !== true) {
      return res.status(400).json({ success: false, message: 'No more products available for this message' });
    }

    const loadedCount = (message.products || []).length;
    const moreResult = await supportChatAgent.loadMoreCatalogProducts(
      message.productSearch.searchParams,
      loadedCount,
    );

    if (!moreResult.products.length) {
      message.productSearch.hasMore = false;
      await session.save();
      return res.json({
        success: true,
        data: {
          message: toMessagePayload(message),
          addedProducts: [],
        },
      });
    }

    const existingIds = new Set((message.products || []).map((p) => String(p.productId)));
    const newProducts = moreResult.products.filter((p) => !existingIds.has(String(p.productId)));
    message.products.push(...newProducts);

    const totalLoaded = message.products.length;
    message.productSearch.totalMatches = Number(
      moreResult.productSearch?.totalMatches || message.productSearch.totalMatches || totalLoaded,
    );
    message.productSearch.hasMore =
      moreResult.productSearch?.hasMore === true && newProducts.length > 0;

    await session.save();
    const messagePayload = toMessagePayload(message);
    emitSupportChatMessage(String(session._id), messagePayload);

    return res.json({
      success: true,
      data: {
        message: messagePayload,
        addedProducts: newProducts,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load more products' });
  }
};

exports.markSeen = async (req, res) => {
  try {
    const session = await SupportChat.findOne({
      _id: req.params.sessionId,
      customerId: req.user._id,
      status: 'open',
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }
    session.unreadByCustomer = 0;
    await session.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const session = await getOrCreateOpenSession(req.user);
    const userMessage = await appendMessage(session, {
      role: 'user',
      text,
      senderId: req.user._id,
      senderName: customerDisplayName(req.user),
    });

    if (session.mode === 'human_pending' || session.mode === 'human_active') {
      session.unreadByAdmin += 1;
      await session.save();
      emitSupportChatSessionUpdated({
        sessionId: String(session._id),
        mode: session.mode,
        unreadByAdmin: session.unreadByAdmin,
        customerName: session.customerName,
        customerId: String(session.customerId),
      });
      return res.json({
        success: true,
        data: {
          session: toSessionPayload(session),
          userMessage,
          assistantMessage: null,
        },
      });
    }

    const recentMessages = (session.messages || [])
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text || '' }));
    const aiResult = await supportChatAgent.processTextMessage(text, {
      recentMessages,
      customerName: customerDisplayName(req.user),
      customerId: req.user._id,
      selectedWarehouseId: req.user.selectedWarehouse || session.warehouseId || null,
    });
    if (aiResult.escalate) {
      session.mode = 'human_pending';
      session.unreadByAdmin += 1;
    }

    const assistantMessage = await appendMessage(session, {
      role: 'assistant',
      text: aiResult.text,
      senderName: 'Valliani AI',
      products: aiResult.products || [],
      productSearch: aiResult.productSearch || null,
    });

    if (aiResult.escalate) {
      await appendMessage(session, {
        role: 'system',
        text: 'A support specialist has been notified and will join this conversation shortly.',
        senderName: 'System',
      });
      await appendHumanSupportEmailNotifications(session);
      emitSupportChatSessionUpdated({
        sessionId: String(session._id),
        mode: session.mode,
        unreadByAdmin: session.unreadByAdmin,
        customerName: session.customerName,
        customerId: String(session.customerId),
      });
    }

    await session.save();
    return res.json({
      success: true,
      data: {
        session: toSessionPayload(session),
        userMessage,
        assistantMessage,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to send message' });
  }
};

exports.requestHuman = async (req, res) => {
  try {
    const session = await getOrCreateOpenSession(req.user);
    if (session.mode === 'human_active') {
      return res.json({
        success: true,
        data: { session: toSessionPayload(session), message: 'Already connected to a human agent' },
      });
    }

    const userMessage = await appendMessage(session, {
      role: 'user',
      text: 'Connect to human support',
      senderId: req.user._id,
      senderName: customerDisplayName(req.user),
    });

    session.mode = 'human_pending';
    session.unreadByAdmin += 1;
    const assistantMessage = await appendMessage(session, {
      role: 'assistant',
      text: 'I am connecting you with a Valliani support specialist. Please stay in this chat — an agent will respond shortly.',
      senderName: 'Valliani AI',
    });
    await appendMessage(session, {
      role: 'system',
      text: 'Human support requested.',
      senderName: 'System',
    });
    await appendHumanSupportEmailNotifications(session);
    await session.save();

    emitSupportChatSessionUpdated({
      sessionId: String(session._id),
      mode: session.mode,
      unreadByAdmin: session.unreadByAdmin,
      customerName: session.customerName,
      customerId: String(session.customerId),
    });

    return res.json({
      success: true,
      data: { session: toSessionPayload(session), userMessage, assistantMessage },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.returnToAi = async (req, res) => {
  try {
    const session = await getOrCreateOpenSession(req.user);
    if (session.mode === 'ai') {
      return res.json({ success: true, data: { session: toSessionPayload(session) } });
    }

    session.mode = 'ai';
    session.assignedAdminId = null;
    session.assignedAdminName = '';
    session.unreadByAdmin = 0;

    await appendMessage(session, {
      role: 'system',
      text: 'You are now chatting with **Valliani AI** again. Ask about stock, SKU, or upload a product photo.',
      senderName: 'System',
    });

    await session.save();
    emitSupportChatSessionUpdated({
      sessionId: String(session._id),
      mode: session.mode,
      assignedAdminId: null,
      assignedAdminName: '',
      customerId: String(session.customerId),
    });

    return res.json({ success: true, data: { session: toSessionPayload(session) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to return to AI' });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const session = await getOrCreateOpenSession(req.user);
    const imageUrl = saveSupportChatImage(req.file.buffer, req.file.originalname);
    const isHumanMode = session.mode === 'human_pending' || session.mode === 'human_active';

    if (isHumanMode) {
      const userMessage = await appendMessage(session, {
        role: 'user',
        text: 'Shared a product image',
        senderId: req.user._id,
        senderName: customerDisplayName(req.user),
        attachments: [imageUrl],
      });
      session.unreadByAdmin += 1;
      await session.save();
      emitSupportChatSessionUpdated({
        sessionId: String(session._id),
        mode: session.mode,
        unreadByAdmin: session.unreadByAdmin,
        customerName: session.customerName,
        customerId: String(session.customerId),
      });
      return res.json({
        success: true,
        data: {
          session: toSessionPayload(session),
          userMessage,
          assistantMessage: null,
        },
      });
    }

    const aiResult = await supportChatAgent.processImageUpload(
      req.file.buffer,
      req.file.originalname,
    );

    const userMessage = await appendMessage(session, {
      role: 'user',
      text: 'Shared a product image for visual search',
      senderId: req.user._id,
      senderName: customerDisplayName(req.user),
      attachments: [imageUrl],
    });

    const assistantMessage = await appendMessage(session, {
      role: 'assistant',
      text: aiResult.text,
      senderName: 'Valliani AI',
      imageAnalysis: aiResult.imageAnalysis,
      products: aiResult.products || [],
    });

    await session.save();

    return res.json({
      success: true,
      data: {
        session: toSessionPayload(session),
        userMessage,
        assistantMessage,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Image upload failed' });
  }
};

exports.adminListSessions = async (req, res) => {
  try {
    if (!(await isPrivilegedAdminUser(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const mode = req.query.mode;
    const filter = { status: 'open' };
    if (mode) filter.mode = mode;

    const sessions = await SupportChat.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      data: sessions.map((s) => ({
        _id: String(s._id),
        customerId: String(s.customerId),
        customerName: s.customerName,
        customerEmail: s.customerEmail,
        mode: s.mode,
        unreadByAdmin: s.unreadByAdmin || 0,
        assignedAdminId: s.assignedAdminId ? String(s.assignedAdminId) : null,
        assignedAdminName: s.assignedAdminName || '',
        lastMessageAt: s.lastMessageAt,
        preview: s.messages?.[s.messages.length - 1]?.text || '',
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.adminGetSession = async (req, res) => {
  try {
    if (!(await isPrivilegedAdminUser(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const session = await SupportChat.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const limitParam = req.query.limit;
    const parsedLimit =
      limitParam !== undefined && limitParam !== null && String(limitParam).trim() !== ''
        ? Math.min(Math.max(parseInt(String(limitParam), 10) || 0, 0), 100)
        : 40;
    const before = req.query.before ? String(req.query.before) : null;

    session.unreadByAdmin = 0;
    await session.save();

    return res.json({
      success: true,
      data: toSessionPayload(session, { limit: parsedLimit, before }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.adminAcceptSession = async (req, res) => {
  try {
    if (!(await isPrivilegedAdminUser(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const session = await SupportChat.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    session.mode = 'human_active';
    session.assignedAdminId = req.user._id;
    session.assignedAdminName = req.user.username || req.user.email || 'Support Agent';
    session.unreadByCustomer += 1;

    const systemMessage = await appendMessage(session, {
      role: 'system',
      text: `${session.assignedAdminName} has joined the conversation.`,
      senderName: 'System',
    });

    await session.save();
    emitSupportChatSessionUpdated({
      sessionId: String(session._id),
      mode: session.mode,
      customerId: String(session.customerId),
    });

    return res.json({ success: true, data: { session: toSessionPayload(session), systemMessage } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.adminSendMessage = async (req, res) => {
  try {
    if (!(await isPrivilegedAdminUser(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const session = await SupportChat.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (session.mode === 'human_pending') {
      session.mode = 'human_active';
      session.assignedAdminId = req.user._id;
      session.assignedAdminName = req.user.username || req.user.email || 'Support Agent';
    }

    const adminMessage = await appendMessage(session, {
      role: 'admin',
      text,
      senderId: req.user._id,
      senderName: session.assignedAdminName || req.user.username || 'Support Agent',
    });

    session.unreadByCustomer += 1;
    await session.save();

    return res.json({
      success: true,
      data: { session: toSessionPayload(session), adminMessage },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.adminCloseSession = async (req, res) => {
  try {
    if (!(await isPrivilegedAdminUser(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const session = await SupportChat.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    session.status = 'closed';
    session.mode = 'closed';
    session.unreadByCustomer += 1;

    await appendMessage(session, {
      role: 'system',
      text: 'This support conversation has been closed. Start a new chat anytime from the support widget.',
      senderName: 'System',
    });

    await session.save();
    emitSupportChatSessionUpdated({
      sessionId: String(session._id),
      status: 'closed',
      customerId: String(session.customerId),
    });

    return res.json({ success: true, data: toSessionPayload(session) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

async function getSupportChatAdminSummary() {
  const [humanPendingCount, openCount, agg] = await Promise.all([
    SupportChat.countDocuments({ status: 'open', mode: 'human_pending' }),
    SupportChat.countDocuments({ status: 'open' }),
    SupportChat.aggregate([
      { $match: { status: 'open', mode: { $in: ['human_pending', 'human_active'] } } },
      { $group: { _id: null, unread: { $sum: '$unreadByAdmin' } } },
    ]),
  ]);

  return {
    humanPendingCount,
    openSessionCount: openCount,
    unreadHumanSessions: agg[0]?.unread || 0,
    badgeCount: humanPendingCount,
  };
}

exports.adminGetSummary = async (req, res) => {
  try {
    if (!(await isPrivilegedAdminUser(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const data = await getSupportChatAdminSummary();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.adminResendSupportEmails = async (req, res) => {
  try {
    if (!(await isPrivilegedAdminUser(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const note = String(req.body?.note || '').trim();
    const session = await SupportChat.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const result = await notifySupportChatRecipientsForSession(session, {
      note,
      requestedByName: req.user.username || req.user.email || 'Admin',
    });

    if (!result.sent) {
      return res.status(400).json({
        success: false,
        message: 'No active support chat email recipients configured in settings.',
      });
    }

    const systemMessage = await appendMessage(session, {
      role: 'system',
      text: `Support request re-emailed to **${result.sent}** configured agent${result.sent === 1 ? '' : 's'}.`,
      senderName: 'System',
    });

    await session.save();
    emitSupportChatMessage(String(session._id), toMessagePayload(systemMessage));

    return res.json({
      success: true,
      message: `Notification sent to ${result.sent} recipient(s)`,
      data: {
        sent: result.sent,
        recipients: result.recipients,
        systemMessage: toMessagePayload(systemMessage),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to resend emails' });
  }
};
