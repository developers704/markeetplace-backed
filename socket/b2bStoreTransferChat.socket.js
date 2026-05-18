const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const B2bStoreTransferOrder = require('../models/b2bStoreTransferOrder.model');
const { getImportProgressIo, initImportProgressSocket } = require('./importProgress.socket');

let storeTransferHandlersAttached = false;

async function resolveUserFromToken(token) {
  if (!token) return null;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  let user = await Customer.findById(decoded.id);
  if (!user) user = await User.findById(decoded.id);
  return user ? user.toObject({ getters: true }) : null;
}

async function canAccessB2bTransfer(user, orderId) {
  if (!user?._id || !orderId) return false;
  const order = await B2bStoreTransferOrder.findById(orderId).select('requestedBy').lean();
  if (!order) return false;
  if (user.is_superuser) return true;
  const u = await User.findById(user._id).select('is_superuser').lean();
  if (u?.is_superuser) return true;
  return String(order.requestedBy) === String(user._id);
}

function emitB2bStoreTransferChatMessage(orderId, message) {
  const io = getImportProgressIo();
  if (!io || !orderId || !message) return;
  io.to(`b2bStoreTransfer:${orderId}`).emit('b2bStoreTransferChatMessage', message);
}

function initB2bStoreTransferChatSocket(httpServer) {
  initImportProgressSocket(httpServer);
  const io = getImportProgressIo();
  if (!io || storeTransferHandlersAttached) return io;
  storeTransferHandlersAttached = true;

  io.on('connection', (socket) => {
    socket.on('subscribeB2bStoreTransfer', async (payload, ack) => {
      const reply = (err, data) => {
        if (typeof ack === 'function') {
          if (err) ack({ ok: false, error: err });
          else ack({ ok: true, ...data });
        }
      };

      try {
        const orderId =
          typeof payload === 'object' && payload !== null ? payload.orderId : payload;
        const token =
          (typeof payload === 'object' && payload?.token) ||
          socket.handshake.auth?.token ||
          socket.handshake.query?.token;

        if (!orderId) {
          reply('orderId required');
          return;
        }

        const user = await resolveUserFromToken(token);
        if (!user?._id) {
          reply('Unauthorized');
          return;
        }

        const ok = await canAccessB2bTransfer(user, orderId);
        if (!ok) {
          reply('Forbidden');
          return;
        }

        socket.join(`b2bStoreTransfer:${orderId}`);
        reply(null, { room: `b2bStoreTransfer:${orderId}` });
      } catch (e) {
        reply(e.message || 'subscribe failed');
      }
    });

    socket.on('unsubscribeB2bStoreTransfer', (orderId) => {
      if (orderId) socket.leave(`b2bStoreTransfer:${orderId}`);
    });
  });

  return io;
}

module.exports = {
  initB2bStoreTransferChatSocket,
  emitB2bStoreTransferChatMessage,
};
