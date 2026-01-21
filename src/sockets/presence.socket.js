// src/sockets/presence.socket.js
import { presenceStore } from "../stores/presence.store.js";

/**
 * Events:
 * - presence:list (ack) => { online: [{userId,lastSeenAt,socketCount}] }
 * - presence:ping => updates lastSeenAt
 *
 * Broadcasts:
 * - presence:online  { userId }
 * - presence:offline { userId }
 */
export function bindPresenceSockets(io) {
  io.on("connection", (socket) => {
    const userId = socket?.data?.user?.userId || null;

    // Join personal room if authed
    if (userId) {
      socket.join(`user:${userId}`);
      presenceStore.upsert(userId, socket.id);

      io.emit("presence:online", { userId });
    }

    socket.on("presence:ping", () => {
      if (!userId) return;
      presenceStore.upsert(userId, socket.id);
    });

    socket.on("presence:list", (payload, ack) => {
      const online = presenceStore.snapshot();
      if (typeof ack === "function") {
        return ack({ ok: true, online });
      }
      socket.emit("presence:list_result", { ok: true, online });
    });

    socket.on("disconnect", () => {
      if (!userId) return;
      const { becameOffline } = presenceStore.removeSocket(userId, socket.id);
      if (becameOffline) {
        io.emit("presence:offline", { userId });
      }
    });
  });
}
