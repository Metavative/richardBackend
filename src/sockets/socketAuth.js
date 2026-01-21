// src/sockets/socketAuth.js
import { verifyAccessToken } from "../utils/generateTokens.js";

/**
 * Extract a bearer token from Socket.IO handshake.
 *
 * Supported:
 * - socket.handshake.auth.token
 * - Authorization: Bearer <token>
 * - x-access-token: <token>
 */
function extractToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (authToken && String(authToken).trim()) return String(authToken).trim();

  const headers = socket.handshake?.headers || {};
  const rawAuth = headers.authorization || headers.Authorization;
  if (rawAuth && typeof rawAuth === "string") {
    const v = rawAuth.trim();
    if (v.toLowerCase().startsWith("bearer ")) {
      return v.slice(7).trim();
    }
    // If someone sends the token directly in Authorization
    if (v.length > 20) return v;
  }

  const xToken = headers["x-access-token"] || headers["x-access-token".toUpperCase()];
  if (xToken && typeof xToken === "string" && xToken.trim()) return xToken.trim();

  return null;
}

/**
 * Attaches an io middleware that tries to authenticate sockets.
 *
 * IMPORTANT: This is intentionally non-blocking to avoid breaking existing
 * connections while we incrementally roll out realtime features.
 *
 * Authenticated sockets get:
 * - socket.userId
 * - socket.userEmail
 */
export function attachSocketAuth(io) {
  io.use((socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next();

      const payload = verifyAccessToken(token);
      const userId = payload?.sub ? String(payload.sub) : null;

      if (userId) {
        socket.userId = userId;
        socket.userEmail = payload?.email ? String(payload.email) : undefined;
      }

      return next();
    } catch (err) {
      // Non-blocking: allow connection but without userId.
      // Consumers (presence/challenges...) will require auth per event.
      return next();
    }
  });
}
