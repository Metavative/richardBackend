import createError from "http-errors";
import { requireAuth } from "./requireAuth.js";

export async function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);

    const role = String(req?.user?.role || "").trim().toLowerCase();
    if (role !== "admin") {
      return next(createError(403, "Admin access required"));
    }

    return next();
  });
}

