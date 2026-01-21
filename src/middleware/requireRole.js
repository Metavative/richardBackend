// src/middleware/requireRole.js
import createError from "http-errors";

/**
 * Usage:
 *   router.get("/admin", requireAuth, requireRole("admin"), handler)
 *
 * Accepts one or multiple roles:
 *   requireRole("admin")
 *   requireRole(["admin", "moderator"])
 */
export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, _res, next) => {
    try {
      const role = req.user?.role;

      if (!role) {
        throw createError(401, "Authentication required");
      }

      if (!allowed.includes(role)) {
        throw createError(403, "You do not have permission to perform this action");
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
