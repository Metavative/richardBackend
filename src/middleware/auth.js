// src/middleware/auth.js
import createError from "http-errors";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import User from "../models/User.js"; // ✅ default import (matches export default User)

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
      return next(createError(401, "Missing token"));
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) return next(createError(401, "Missing token"));

    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET); // { sub, email, role? }
    const userId = payload?.sub?.toString?.() || payload?.userId?.toString?.() || null;

    // Ensure role exists
    if (!payload?.role || userId) {
      const u = userId
        ? await User.findById(userId)
          .select("role moderation.isBanned moderation.suspendedUntil")
          .lean()
        : null;
      payload.role = u?.role || "unassigned";

      if (u?.moderation?.isBanned === true) {
        const err = createError(403, "Account is banned");
        err.code = "ACCOUNT_BANNED";
        return next(err);
      }

      const suspendedUntil = u?.moderation?.suspendedUntil
        ? new Date(u.moderation.suspendedUntil)
        : null;
      if (suspendedUntil && suspendedUntil.getTime() > Date.now()) {
        const err = createError(
          403,
          `Account is suspended until ${suspendedUntil.toISOString()}`
        );
        err.code = "ACCOUNT_SUSPENDED";
        return next(err);
      }
    }

    req.user = payload;
    return next();
  } catch (_err) {
    return next(createError(401, "Invalid or expired token"));
  }
}
