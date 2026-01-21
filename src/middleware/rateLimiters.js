// src/middleware/rateLimiters.js
import rateLimit from "express-rate-limit";

const jsonHandler = (code) => (req, res /*, next */) => {
  return res.status(429).json({
    ok: false,
    error: {
      code,
      message: "Too many requests. Please try again shortly.",
    },
    requestId: req.requestId,
  });
};

/**
 * General auth limiter:
 * - Used on login/signup/otp endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("RATE_LIMIT_AUTH"),
});

/**
 * More strict limiter for very sensitive endpoints
 * - password reset, otp verify, etc.
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("RATE_LIMIT_SENSITIVE"),
});
