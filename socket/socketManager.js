const { Server } = require('socket.io');

let io = null;

function initSocketServer(httpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  return io;
}

function getSocketIo() {
  return io;
}

module.exports = {
  initSocketServer,
  getSocketIo,
};