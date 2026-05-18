const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const UserRole = require('../models/userRole.model');
const { getImportProgressIo, initImportProgressSocket } = require('./importProgress.socket');

const ADMIN_CHAT_ROOM = 'adminChatDashboard';
let adminHandlersAttached = false;

async function resolveUserFromToken(token) {
  if (!token) return null;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  let user = await Customer.findById(decoded.id);
  if (!user) user = await User.findById(decoded.id);
  return user ? user.toObject({ getters: true }) : null;
}

async function isPrivilegedAdminUser(user) {
  if (!user?._id) return false;
  if (user.is_superuser) return true;
  const u = await User.findById(user._id).select('is_superuser role').lean();
  if (u?.is_superuser) return true;
  if (u?.role) {
    const roleDoc = await UserRole.findById(u.role).select('role_name').lean();
    const rn = String(roleDoc?.role_name || '').toLowerCase().trim();
    if (rn === 'admin' || rn === 'super admin' || rn === 'superuser') return true;
  }
  return false;
}

/**
 * Notify admin dashboards to refresh unread badges / list rows.
 * @param {{ channel: 'b2b'|'spo'|'storeTransfer', orderId: string, action?: 'message'|'seen' }} payload
 */
function emitAdminChatUnreadChanged(payload) {
  const io = getImportProgressIo();
  if (!io || !payload?.channel || !payload?.orderId) return;
  io.to(ADMIN_CHAT_ROOM).emit('adminChatUnreadChanged', {
    channel: payload.channel,
    orderId: String(payload.orderId),
    action: payload.action || 'message',
    at: new Date().toISOString(),
  });
}

function initAdminChatSocket(httpServer) {
  initImportProgressSocket(httpServer);
  const io = getImportProgressIo();
  if (!io || adminHandlersAttached) return io;
  adminHandlersAttached = true;

  io.on('connection', (socket) => {
    // Auto-join admin dashboard room when a privileged admin connects (no client subscribe required).
    (async () => {
      try {
        const token =
          socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return;
        const user = await resolveUserFromToken(token);
        if (!user?._id) return;
        if (await isPrivilegedAdminUser(user)) {
          socket.join(ADMIN_CHAT_ROOM);
        }
      } catch (_) {
        /* invalid token */
      }
    })();

    socket.on('subscribeAdminChat', async (payload, ack) => {
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

        const ok = await isPrivilegedAdminUser(user);
        if (!ok) {
          reply('Forbidden');
          return;
        }

        socket.join(ADMIN_CHAT_ROOM);
        reply(null, { room: ADMIN_CHAT_ROOM });
      } catch (e) {
        reply(e.message || 'subscribe failed');
      }
    });

    socket.on('unsubscribeAdminChat', () => {
      socket.leave(ADMIN_CHAT_ROOM);
    });
  });

  return io;
}

module.exports = {
  initAdminChatSocket,
  emitAdminChatUnreadChanged,
  ADMIN_CHAT_ROOM,
};
