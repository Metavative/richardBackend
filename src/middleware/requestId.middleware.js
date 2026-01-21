// src/middleware/requestId.middleware.js
import crypto from "crypto";

/**
 * Adds a unique request ID to every HTTP request.
 *
 * - Sets req.requestId
 * - Returns it in response header: X-Request-Id
 * - Used for tracing errors in production
 */
export function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers["x-request-id"];

  const requestId =
    typeof incomingId === "string" && incomingId.trim().length > 0
      ? incomingId
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
}
