import createError from "http-errors";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return next(createError(401, "Missing token"));
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET); // { sub, email, role? }
    if (!payload.role) {
      const u = await User.findById(payload.sub).select("role").lean();
      payload.role = u?.role || "unassigned";
    }
    req.user = payload;
    next();
  } catch {
    next(createError(401, "Invalid or expired token"));
  }
}
