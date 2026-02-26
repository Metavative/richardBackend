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

    // Ensure role exists
    if (!payload?.role) {
      const u = await User.findById(payload.sub).select("role").lean();
      payload.role = u?.role || "unassigned";
    }

    req.user = payload;
    return next();
  } catch (_err) {
    return next(createError(401, "Invalid or expired token"));
  }
}