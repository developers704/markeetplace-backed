const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const { getImportProgressIo, initImportProgressSocket } = require('./importProgress.socket');

let customerHandlersAttached = false;

function normId(ref) {
  if (ref == null) return '';
  if (typeof ref === 'object' && ref._id != null) return String(ref._id);
  return String(ref);
}

function customerChatUserRoom(userId) {
  return `customerChat:${normId(userId)}`;
}

function customerChatWarehouseRoom(warehouseId) {
  return `customerChatWh:${normId(warehouseId)}`;
}

async function resolveUserFromToken(token) {
  if (!token) return null;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  let user = await Customer.findById(decoded.id);
  if (!user) user = await User.findById(decoded.id);
  if (!user) return null;
  const u = user.toObject({ getters: true });
  if (decoded.warehouse != null) u.selectedWarehouse = decoded.warehouse;
  return u;
}

/**
 * Notify customer list sidebars / order cards to refresh unread badges.
 * @param {{
 *   channel: 'b2b'|'spo'|'storeTransfer',
 *   orderId: string,
 *   action?: 'message'|'seen',
 *   userId?: string,
 *   warehouseId?: string,
 * }} payload
 */
function emitCustomerChatUnreadChanged(payload) {
  const io = getImportProgressIo();
  if (!io || !payload?.channel || !payload?.orderId) return;

  const event = {
    channel: payload.channel,
    orderId: String(payload.orderId),
    action: payload.action || 'message',
    at: new Date().toISOString(),
  };

  if (payload.userId) {
    io.to(customerChatUserRoom(payload.userId)).emit('customerChatUnreadChanged', event);
  }
  if (payload.warehouseId) {
    io.to(customerChatWarehouseRoom(payload.warehouseId)).emit('customerChatUnreadChanged', event);
  }
}

function initCustomerChatSocket(httpServer) {
  initImportProgressSocket(httpServer);
  const io = getImportProgressIo();
  if (!io || customerHandlersAttached) return io;
  customerHandlersAttached = true;

  io.on('connection', (socket) => {
    socket.on('subscribeCustomerChat', async (payload, ack) => {
      const reply = (err, data) => {
        if (typeof ack === 'function') {
          if (err) ack({ ok: false, error: err });
          else ack({ ok: true, ...data });
        }
      };

      try {
        const token =
          (typeof payload === 'object' && payload?.token) ||
          socket.handshake.auth?.token ||
          socket.handshake.query?.token;

        const user = await resolveUserFromToken(token);
        if (!user?._id) {
          reply('Unauthorized');
          return;
        }

        const rooms = [customerChatUserRoom(user._id)];
        const wh = normId(user.selectedWarehouse);
        if (wh) rooms.push(customerChatWarehouseRoom(wh));

        for (const room of rooms) {
          socket.join(room);
        }

        reply(null, { rooms });
      } catch (e) {
        reply(e.message || 'subscribe failed');
      }
    });

    socket.on('unsubscribeCustomerChat', async (payload) => {
      try {
        const token =
          (typeof payload === 'object' && payload?.token) ||
          socket.handshake.auth?.token ||
          socket.handshake.query?.token;
        const user = await resolveUserFromToken(token);
        if (!user?._id) return;
        socket.leave(customerChatUserRoom(user._id));
        const wh = normId(user.selectedWarehouse);
        if (wh) socket.leave(customerChatWarehouseRoom(wh));
      } catch (_) {
        /* ignore */
      }
    });
  });

  return io;
}

module.exports = {
  initCustomerChatSocket,
  emitCustomerChatUnreadChanged,
  customerChatUserRoom,
  customerChatWarehouseRoom,
};
