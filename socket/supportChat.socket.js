const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const UserRole = require('../models/userRole.model');
const SupportChat = require('../models/supportChat.model');
const { getImportProgressIo, initImportProgressSocket } = require('./importProgress.socket');

const SUPPORT_ADMIN_ROOM = 'supportChatAdmin';
let supportHandlersAttached = false;

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

function supportSessionRoom(sessionId) {
  return `supportChat:${String(sessionId)}`;
}

function emitSupportChatMessage(sessionId, message) {
  const io = getImportProgressIo();
  if (!io || !sessionId || !message) return;
  io.to(supportSessionRoom(sessionId)).emit('supportChatMessage', message);
}

function emitSupportChatSessionUpdated(payload) {
  const io = getImportProgressIo();
  if (!io || !payload?.sessionId) return;
  io.to(SUPPORT_ADMIN_ROOM).emit('supportChatSessionUpdated', {
    ...payload,
    at: new Date().toISOString(),
  });
  if (payload.customerId) {
    io.to(`supportChatCustomer:${payload.customerId}`).emit('supportChatSessionUpdated', {
      ...payload,
      at: new Date().toISOString(),
    });
  }
}

function initSupportChatSocket(httpServer) {
  initImportProgressSocket(httpServer);
  const io = getImportProgressIo();
  if (!io || supportHandlersAttached) return io;
  supportHandlersAttached = true;

  io.on('connection', (socket) => {
    socket.on('subscribeSupportChat', async (payload, ack) => {
      const reply = (err, data) => {
        if (typeof ack === 'function') {
          if (err) ack({ ok: false, error: err });
          else ack({ ok: true, ...data });
        }
      };

      try {
        const sessionId =
          typeof payload === 'object' && payload !== null ? payload.sessionId : payload;
        const token =
          (typeof payload === 'object' && payload?.token) ||
          socket.handshake.auth?.token ||
          socket.handshake.query?.token;

        if (!sessionId) {
          reply('sessionId required');
          return;
        }

        const user = await resolveUserFromToken(token);
        if (!user?._id) {
          reply('Unauthorized');
          return;
        }

        const session = await SupportChat.findById(sessionId).select('customerId').lean();
        if (!session) {
          reply('Session not found');
          return;
        }

        const isAdmin = await isPrivilegedAdminUser(user);
        const isOwner = String(session.customerId) === String(user._id);
        if (!isAdmin && !isOwner) {
          reply('Forbidden');
          return;
        }

        socket.join(supportSessionRoom(sessionId));
        if (isOwner) socket.join(`supportChatCustomer:${user._id}`);
        if (isAdmin) socket.join(SUPPORT_ADMIN_ROOM);

        reply(null, { room: supportSessionRoom(sessionId) });
      } catch (e) {
        reply(e.message || 'subscribe failed');
      }
    });

    socket.on('subscribeSupportChatAdmin', async (payload, ack) => {
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
        if (!(await isPrivilegedAdminUser(user))) {
          reply('Forbidden');
          return;
        }
        socket.join(SUPPORT_ADMIN_ROOM);
        reply(null, { room: SUPPORT_ADMIN_ROOM });
      } catch (e) {
        reply(e.message || 'subscribe failed');
      }
    });

    socket.on('unsubscribeSupportChat', (sessionId) => {
      if (sessionId) socket.leave(supportSessionRoom(sessionId));
    });
  });

  return io;
}

module.exports = {
  initSupportChatSocket,
  emitSupportChatMessage,
  emitSupportChatSessionUpdated,
  SUPPORT_ADMIN_ROOM,
};
