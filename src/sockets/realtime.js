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