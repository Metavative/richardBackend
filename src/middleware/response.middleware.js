// src/middleware/response.middleware.js

/**
 * Attaches standardized response helpers to res.
 *
 * Success response format:
 * {
 *   ok: true,
 *   data: any,
 *   requestId: "uuid"
 * }
 */
export function responseMiddleware(req, res, next) {
    res.ok = function (data = null) {
      return res.json({
        ok: true,
        data,
        requestId: req.requestId,
      });
    };
  
    res.created = function (data = null) {
      return res.status(201).json({
        ok: true,
        data,
        requestId: req.requestId,
      });
    };
  
    next();
  }
  