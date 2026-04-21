const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const ImportJob = require('../models/importJob.model');

let io = null;

async function resolveUserFromToken(token) {
  if (!token) return null;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  let user = await Customer.findById(decoded.id);
  if (!user) user = await User.findById(decoded.id);
  return user ? user.toObject({ getters: true }) : null;
}

function initImportProgressSocket(httpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    socket.on('subscribeVendorImport', async (payload, ack) => {
      const reply = (err, data) => {
        if (typeof ack === 'function') {
          if (err) ack({ ok: false, error: err });
          else ack({ ok: true, ...data });
        }
      };

      try {
        const jobId = typeof payload === 'string' ? payload : payload?.jobId;
        const token =
          (typeof payload === 'object' && payload?.token) ||
          socket.handshake.auth?.token ||
          socket.handshake.query?.token;

        if (!jobId) {
          reply('jobId required');
          return;
        }

        const user = await resolveUserFromToken(token);
        if (!user?._id) {
          reply('Unauthorized');
          return;
        }

        const importDoc = await ImportJob.findOne({ jobId }).lean();
        if (!importDoc) {
          reply('Import job not found');
          return;
        }

        const uid = String(user._id);
        const isSuper = !!user.is_superuser;
        if (importDoc.requestedBy) {
          if (String(importDoc.requestedBy) !== uid && !isSuper) {
            reply('Forbidden');
            return;
          }
        } else if (!isSuper) {
          reply('Forbidden');
          return;
        }

        socket.join(`importJob:${jobId}`);
        reply(null, { room: `importJob:${jobId}` });
      } catch (e) {
        reply(e.message || 'subscribe failed');
      }
    });

    socket.on('unsubscribeVendorImport', (jobId) => {
      if (jobId) socket.leave(`importJob:${jobId}`);
    });
  });

  return io;
}

function emitImportJobProgress(payload) {
  if (!io || !payload?.jobId) return;
  io.to(`importJob:${payload.jobId}`).emit('vendorImportProgress', payload);
}

function getImportProgressIo() {
  return io;
}

module.exports = {
  initImportProgressSocket,
  emitImportJobProgress,
  getImportProgressIo,
};
