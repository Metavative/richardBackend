import jwt from "jsonwebtoken";
import createError from "http-errors";
import { env } from "../config/env.js";

function assertEnv(key, value) {
  if (!value || String(value).trim().length === 0) {
    throw createError(500, `Server misconfigured: ${key} is missing`);
  }
}

function safeExpires(value, keyName) {
  // allow values like "15m", "7d", "3600s", or numeric seconds
  if (value === undefined || value === null || String(value).trim() === "") {
    throw createError(500, `Server misconfigured: ${keyName} is missing`);
  }
  return value;
}

export function generateAccessToken(payload) {
  assertEnv("JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET);
  const expiresIn = safeExpires(env.JWT_ACCESS_EXPIRES, "JWT_ACCESS_EXPIRES");

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn });
}

export function generateRefreshToken(payload) {
  assertEnv("JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET);
  const expiresIn = safeExpires(env.JWT_REFRESH_EXPIRES, "JWT_REFRESH_EXPIRES");

  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn });
}

export function verifyAccessToken(token) {
  assertEnv("JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET);
  if (!token || String(token).trim() === "") {
    throw createError(401, "Missing access token");
  }
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  assertEnv("JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET);
  if (!token || String(token).trim() === "") {
    throw createError(401, "Missing refresh token");
  }
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
