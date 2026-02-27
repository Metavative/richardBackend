// src/middleware/validateRequest.js
import createError from "http-errors";
import { validationResult } from "express-validator";

/**
 * Converts express-validator errors into a clean 400 response.
 * Uses centralized error middleware to format the response.
 */
export function validateRequest(req, _res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array().map((e) => ({
    // express-validator may use param OR path depending on version
    field: e.param || e.path || "unknown",
    message: e.msg,
  }));

  // ✅ Helpful server log (Railway)
  // eslint-disable-next-line no-console
  console.log("❌ VALIDATION_ERROR:", {
    path: req.originalUrl,
    method: req.method,
    errors,
  });

  const err = createError(400, "Validation failed");
  err.code = "VALIDATION_ERROR";
  err.details = { errors };
  return next(err);
}