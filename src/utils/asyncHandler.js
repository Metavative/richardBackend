// src/utils/asyncHandler.js

/**
 * Wrap async route handlers so errors go to the error middleware.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
