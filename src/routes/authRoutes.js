import { Router } from "express";
import { body } from "express-validator";
import { authLimiter, sensitiveLimiter } from "../middleware/rateLimiters.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import {
  register,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  selectRole,
  fetchUsers,
} from "../controllers/authController.js";

const router = Router();

// REGISTER
router.post(
  "/register",
  authLimiter,
  [
    body("name").optional().trim(),
    body("email").trim().isEmail().withMessage("Email format incorrect"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long")
      .matches(/[A-Za-z]/)
      .withMessage("Password must contain at least one letter")
      .matches(/\d/)
      .withMessage("Password must contain at least one number"),
  ],
  validateRequest,
  asyncHandler(register)
);

// LOGIN
router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Email format incorrect"),
    body("password").notEmpty().withMessage("Password required"),
  ],
  validateRequest,
  asyncHandler(login)
);

// VERIFY EMAIL OTP  (expects { uid, code })
router.post(
  "/verify-email",
  authLimiter,
  [
    body("uid").notEmpty().withMessage("uid required"),
    body("code").trim().notEmpty().withMessage("Verification code required"),
  ],
  validateRequest,
  asyncHandler(verifyEmail)
);

// RESEND VERIFICATION
router.post(
  "/resend-verification",
  sensitiveLimiter,
  [body("email").isEmail().withMessage("Email format incorrect")],
  validateRequest,
  asyncHandler(resendVerification)
);

// REFRESH TOKENS
router.post(
  "/refresh",
  sensitiveLimiter,
  [body("refreshToken").notEmpty().withMessage("refreshToken required")],
  validateRequest,
  asyncHandler(refresh)
);

// LOGOUT
router.post(
  "/logout",
  sensitiveLimiter,
  [body("refreshToken").notEmpty().withMessage("refreshToken required")],
  validateRequest,
  asyncHandler(logout)
);

// FORGOT PASSWORD (expects { email })
router.post(
  "/forgot-password",
  sensitiveLimiter,
  [body("email").isEmail().withMessage("Email format incorrect")],
  validateRequest,
  asyncHandler(forgotPassword)
);

// RESET PASSWORD (expects { uid, code, password })
router.post(
  "/reset-password",
  sensitiveLimiter,
  [
    body("uid").notEmpty().withMessage("uid required"),
    body("code").trim().notEmpty().withMessage("Reset code required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long")
      .matches(/[A-Za-z]/)
      .withMessage("Password must contain at least one letter")
      .matches(/\d/)
      .withMessage("Password must contain at least one number"),
  ],
  validateRequest,
  asyncHandler(resetPassword)
);

// SELECT ROLE (expects { email, role })
router.post(
  "/select-role",
  authLimiter,
  [
    body("email").isEmail().withMessage("Email format incorrect"),
    body("role").trim().notEmpty().withMessage("Role required"),
  ],
  validateRequest,
  asyncHandler(selectRole)
);

// FETCH USERS
router.get("/fetchUsers", asyncHandler(fetchUsers));

export default router;
