import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

let io: Server;

export function initSocketIO(httpServer: HttpServer, allowedOrigins: string | string[]): Server {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('join:campaign', (campaignId: string) => {
      socket.join(`campaign:${campaignId}`);
    });

    socket.on('join:session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}
