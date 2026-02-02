// src/services/token.service.js
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

function normalizePayload(payload) {
  // Support multiple historical token shapes:
  // - { userId }
  // - { sub } (JWT standard)
  // - { id }
  // - { _id }
  if (!payload || typeof payload !== "object") return payload;

  const userId =
    payload.userId ||
    payload.sub ||
    payload.id ||
    payload._id ||
    null;

  if (userId && !payload.userId) {
    payload.userId = userId;
  }

  return payload;
}

/**
 * Verify access token
 * Throws a standardized error if invalid/expired
 */
export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    return normalizePayload(payload);
  } catch (err) {
    err.status = 401;
    err.code = "INVALID_TOKEN";
    err.message = "Invalid or expired access token";
    throw err;
  }
}

/**
 * Sign access token
 * Always includes userId for consistency.
 */
export function signAccessToken(payload, options = {}) {
  const p = normalizePayload({ ...(payload || {}) });

  return jwt.sign(p, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN || "15m",
    ...options,
  });
}

/**
 * Sign refresh token
 * Always includes userId for consistency.
 */
export function signRefreshToken(payload, options = {}) {
  const p = normalizePayload({ ...(payload || {}) });

  return jwt.sign(p, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN || "7d",
    ...options,
  });
}
