// src/middleware/requireAuth.js
import createError from "http-errors";
import { verifyAccessToken } from "../services/token.service.js";
import User from "../models/User.js";

/**
 * REST authentication middleware.
 *
 * - Accepts Bearer token OR cookie token
 * - Verifies JWT
 * - Loads user from DB
 * - Blocks deleted / disabled users
 * - Attaches req.user + req.userId
 */
export async function requireAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    const bearer =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    const token =
      bearer ||
      req.cookies?.accessToken ||
      req.cookies?.token ||
      null;

    if (!token) {
      throw createError(401, "Authentication required");
    }

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.userId).select(
      "_id role status emailVerified moderation.isBanned moderation.suspendedUntil"
    );

    if (!user) {
      throw createError(401, "User not found");
    }

    if (user.status === "blocked" || user?.moderation?.isBanned === true) {
      const err = createError(403, "Account is banned");
      err.code = "ACCOUNT_BANNED";
      throw err;
    }

    const suspendedUntil = user?.moderation?.suspendedUntil
      ? new Date(user.moderation.suspendedUntil)
      : null;
    if (suspendedUntil && suspendedUntil.getTime() > Date.now()) {
      const err = createError(
        403,
        `Account is suspended until ${suspendedUntil.toISOString()}`
      );
      err.code = "ACCOUNT_SUSPENDED";
      throw err;
    }

    req.userId = user._id.toString();
    req.user = {
      id: req.userId,
      role: user.role,
      emailVerified: user.emailVerified,
    };

    User.updateOne(
      { _id: req.userId },
      { $set: { "notifications.lastActiveAt": new Date() } }
    ).catch(() => {});

    next();
  } catch (err) {
    next(err);
  }
}
