const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const SpecialOrder = require('../models/specialOrder.model');
const { getImportProgressIo, initImportProgressSocket } = require('./importProgress.socket');

let handlersAttached = false;

async function resolveUserFromToken(token) {
  if (!token) return null;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  let user = await Customer.findById(decoded.id);
  if (!user) user = await User.findById(decoded.id);
  return user ? user.toObject({ getters: true }) : null;
}

async function canAccessSpoOrder(user, orderId) {
  if (!user?._id || !orderId) return false;
  const order = await SpecialOrder.findById(orderId).select('requestedBy').lean();
  if (!order) return false;
  if (user.is_superuser) return true;
  return String(order.requestedBy) === String(user._id);
}

function emitSpoChatMessage(orderId, message) {
  const io = getImportProgressIo();
  if (!io || !orderId || !message) return;
  io.to(`spoOrder:${orderId}`).emit('spoChatMessage', message);
}

/**
 * Registers Socket.IO handlers on the shared server instance (same `io` as import progress).
 */
function initSpoChatSocket(httpServer) {
  initImportProgressSocket(httpServer);
  const io = getImportProgressIo();
  if (!io || handlersAttached) return io;
  handlersAttached = true;

  io.on('connection', (socket) => {
    socket.on('subscribeSpoOrder', async (payload, ack) => {
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

        const ok = await canAccessSpoOrder(user, orderId);
        if (!ok) {
          reply('Forbidden');
          return;
        }

        socket.join(`spoOrder:${orderId}`);
        reply(null, { room: `spoOrder:${orderId}` });
      } catch (e) {
        reply(e.message || 'subscribe failed');
      }
    });

    socket.on('unsubscribeSpoOrder', (orderId) => {
      if (orderId) socket.leave(`spoOrder:${orderId}`);
    });
  });

  return io;
}

module.exports = {
  initSpoChatSocket,
  emitSpoChatMessage,
};
