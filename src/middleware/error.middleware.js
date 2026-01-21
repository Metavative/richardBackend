// src/middleware/error.middleware.js
import { env } from "../config/env.js";

/**
 * Centralized error handler.
 *
 * REST error response format:
 * {
 *   ok: false,
 *   error: {
 *     code: "ERROR_CODE",
 *     message: "Human readable message",
 *     details?: any (dev only),
 *     stack?: string (dev only)
 *   },
 *   requestId: "uuid"
 * }
 */
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;

  const code =
    err.code ||
    (status === 400
      ? "BAD_REQUEST"
      : status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "FORBIDDEN"
          : status === 404
            ? "NOT_FOUND"
            : "SERVER_ERROR");

  // Mongo duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      ok: false,
      error: {
        code: "DUPLICATE",
        message: `${field} already exists`,
        ...(env.NODE_ENV !== "production" && {
          details: err.keyValue,
        }),
      },
      requestId: req.requestId,
    });
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        ...(env.NODE_ENV !== "production" && {
          details: errors,
        }),
      },
      requestId: req.requestId,
    });
  }

  const message =
    typeof err.message === "string" && err.message.trim()
      ? err.message
      : "Internal server error";

  const response = {
    ok: false,
    error: {
      code,
      message,
    },
    requestId: req.requestId,
  };

  if (env.NODE_ENV !== "production") {
    response.error.details = err.details || null;
    response.error.stack = err.stack || null;
  }

  // Central logging (safe for prod)
  console.error("❌ API Error", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    message,
  });

  res.status(status).json(response);
}

export function notFound(req, res) {
  res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
    requestId: req.requestId,
  });
}
