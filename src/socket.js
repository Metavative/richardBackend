// src/socket.js
import { Server } from "socket.io";

let _io; // private variable
export const presence = new Map();

export function initSocket(server) {
  if (_io) return _io; // already initialized
  _io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  _io.on("connection", (socket) => {
    console.log("🟢 User connected:", socket.id);

    socket.on("join", (userId) => {
      presence.set(userId, socket.id);
      console.log(`User ${userId} joined with socket ${socket.id}`);
    });

    socket.on("disconnect", () => {
      for (const [userId, sId] of presence.entries()) {
        if (sId === socket.id) {
          presence.delete(userId);
          break;
        }
      }
      console.log("🔴 User disconnected:", socket.id);
    });
  });

  return _io;
}

export function getIo() {
  if (!_io) throw new Error("Socket.IO not initialized. Call initSocket(server) first.");
  return _io;
}
