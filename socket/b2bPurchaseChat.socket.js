const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const UserRole = require('../models/userRole.model');
const B2BPurchaseRequest = require('../models/b2bPurchaseRequest.model');
const { getImportProgressIo, initImportProgressSocket } = require('./importProgress.socket');

let handlersAttached = false;

async function resolveUserFromToken(token) {
  if (!token) return null;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  let user = await Customer.findById(decoded.id);
  if (!user) user = await User.findById(decoded.id);
  return user ? user.toObject({ getters: true }) : null;
}

async function canAccessB2bPurchase(user, purchaseId) {
  if (!user?._id || !purchaseId) return false;
  const order = await B2BPurchaseRequest.findById(purchaseId)
    .select('requestedBy dmUserId cmUserId')
    .lean();
  if (!order) return false;
  if (user.is_superuser) return true;
  const u = await User.findById(user._id).select('is_superuser role').lean();
  if (u?.is_superuser) return true;
  if (u?.role) {
    const roleDoc = await UserRole.findById(u.role).select('role_name').lean();
    const rn = String(roleDoc?.role_name || '').toLowerCase().trim();
    if (rn === 'admin' || rn === 'super admin' || rn === 'superuser') return true;
  }
  if (String(order.requestedBy) === String(user._id)) return true;
  if (order.dmUserId && String(order.dmUserId) === String(user._id)) return true;
  if (order.cmUserId && String(order.cmUserId) === String(user._id)) return true;
  return false;
}

function emitB2bPurchaseChatMessage(purchaseId, message) {
  const io = getImportProgressIo();
  if (!io || !purchaseId || !message) return;
  io.to(`b2bPurchase:${purchaseId}`).emit('b2bPurchaseChatMessage', message);
}

function emitB2bPurchaseChatSeen(purchaseId, payload) {
  const io = getImportProgressIo();
  if (!io || !purchaseId || !payload) return;
  io.to(`b2bPurchase:${purchaseId}`).emit('b2bPurchaseChatSeen', payload);
}

function initB2bPurchaseChatSocket(httpServer) {
  initImportProgressSocket(httpServer);
  const io = getImportProgressIo();
  if (!io || handlersAttached) return io;
  handlersAttached = true;

  io.on('connection', (socket) => {
    socket.on('subscribeB2bPurchase', async (payload, ack) => {
      const reply = (err, data) => {
        if (typeof ack === 'function') {
          if (err) ack({ ok: false, error: err });
          else ack({ ok: true, ...data });
        }
      };

      try {
        const purchaseId =
          typeof payload === 'object' && payload !== null ? payload.orderId || payload.purchaseId : payload;
        const token =
          (typeof payload === 'object' && payload?.token) ||
          socket.handshake.auth?.token ||
          socket.handshake.query?.token;

        if (!purchaseId) {
          reply('purchaseId required');
          return;
        }

        const user = await resolveUserFromToken(token);
        if (!user?._id) {
          reply('Unauthorized');
          return;
        }

        const ok = await canAccessB2bPurchase(user, purchaseId);
        if (!ok) {
          reply('Forbidden');
          return;
        }

        socket.join(`b2bPurchase:${purchaseId}`);
        reply(null, { room: `b2bPurchase:${purchaseId}` });
      } catch (e) {
        reply(e.message || 'subscribe failed');
      }
    });

    socket.on('unsubscribeB2bPurchase', (purchaseId) => {
      if (purchaseId) socket.leave(`b2bPurchase:${purchaseId}`);
    });
  });

  return io;
}

module.exports = {
  initB2bPurchaseChatSocket,
  emitB2bPurchaseChatMessage,
  emitB2bPurchaseChatSeen,
};
