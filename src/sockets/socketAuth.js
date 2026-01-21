// src/sockets/socketAuth.js
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import User from "../models/User.js";

/**
 * Socket auth:
 * - Reads token from socket.handshake.auth.token
 * - Verifies JWT_ACCESS_SECRET
 * - Attaches socket.data.user = { userId, role, email }
 * - If missing/invalid token => guest socket (still connected, but limited features)
 */
export function socketAuth() {
  return async (socket, next) => {
    try {
      const token =
        socket.handshake?.auth?.token ||
        socket.handshake?.headers?.authorization?.replace("Bearer ", "") ||
        socket.handshake?.query?.token;

      if (!token) {
        socket.data.user = { userId: null, role: "guest", email: null };
        return next();
      }

      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);

      // payload uses { sub } in your backend
      const userId = payload?.sub?.toString?.() || null;
      let role = payload?.role || null;
      const email = payload?.email || null;

      if (userId && !role) {
        const u = await User.findById(userId).select("role email").lean();
        role = u?.role || "unassigned";
      }

      socket.data.user = {
        userId,
        role: role || "unassigned",
        email,
      };

      return next();
    } catch (err) {
      // Treat invalid token as guest so app still works and can show errors gracefully
      socket.data.user = { userId: null, role: "guest", email: null };
      return next();
    }
  };
}
