// src/services/token.service.js
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Verify access token
 * Throws a standardized error if invalid/expired
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (err) {
    err.status = 401;
    err.code = "INVALID_TOKEN";
    err.message = "Invalid or expired access token";
    throw err;
  }
}

/**
 * Sign access token
 */
export function signAccessToken(payload, options = {}) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN || "15m",
    ...options,
  });
}

/**
 * Sign refresh token
 */
export function signRefreshToken(payload, options = {}) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN || "7d",
    ...options,
  });
}
