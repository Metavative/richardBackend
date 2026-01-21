// src/middleware/validateRequest.js
import createError from "http-errors";
import { validationResult } from "express-validator";

/**
 * Converts express-validator errors into a clean 400 response.
 * Uses your centralized error middleware to format the response.
 */
export function validateRequest(req, _res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array().map((e) => ({
    field: e.param,
    message: e.msg,
  }));

  const err = createError(400, "Validation failed");
  err.code = "VALIDATION_ERROR";
  err.details = { errors };
  return next(err);
}
