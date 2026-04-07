// src/sockets/realtime.js
let _io = null;

/**
 * Store io instance so REST routes can emit without importing server.js
 * (prevents circular import issues in ESM).
 */
export function setIO(io) {
  _io = io;
}

export function getIO() {
  return _io;
}

export function emitToUserRoom(userId, event, payload) {
  const io = _io;
  const uid = String(userId || "").trim();
  if (!io || !uid || !event) return false;
  io.to(`user:${uid}`).emit(event, payload);
  return true;
}

export async function disconnectUserSockets(userId) {
  const io = _io;
  const uid = String(userId || "").trim();
  if (!io || !uid) return 0;

  try {
    const sockets = await io.in(`user:${uid}`).fetchSockets();
    for (const s of sockets) {
      try {
        s.disconnect(true);
      } catch (_) {}
    }
    return sockets.length;
  } catch (_) {
    return 0;
  }
}
