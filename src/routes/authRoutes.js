// src/routes/authRoutes.js
import { Router } from "express";
import createError from "http-errors";
import { body } from "express-validator";
import { authLimiter, sensitiveLimiter } from "../middleware/rateLimiters.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

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
  deleteAccount,
} from "../controllers/authController.js";

const router = Router();

// ✅ helper: enable multipart for register (profile picture upload)
function registerUpload(req, res, next) {
  upload.single("profilePic")(req, res, (err) => {
    if (err) return next(createError(400, err.message));
    next();
  });
}

// REGISTER
// ✅ requires username + profile picture upload (multipart file "profilePic")
router.post(
  "/register",
  authLimiter,
  registerUpload,
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

    body("username")
      .trim()
      .notEmpty()
      .withMessage("Username is required")
      .matches(/^[a-z0-9_]{3,20}$/i)
      .withMessage(
        "Username must be 3-20 chars and contain only letters, numbers, or underscore"
      ),

    // ✅ NEW: require uploaded file
    body().custom((_, { req }) => {
      if (!req.file) {
        throw new Error("Profile picture is required");
      }

      // Multer filter already enforces image/*, but keep this for safety.
      const mt = String(req.file.mimetype || "").toLowerCase();
      if (!mt.startsWith("image/")) {
        throw new Error("Only image files are allowed");
      }

      return true;
    }),
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

// VERIFY EMAIL OTP (expects { uid, code })
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

// REFRESH
router.post(
  "/refresh",
  sensitiveLimiter,
  [body("refreshToken").optional().isString()],
  validateRequest,
  asyncHandler(refresh)
);

// LOGOUT
router.post(
  "/logout",
  sensitiveLimiter,
  [body("refreshToken").optional().isString()],
  validateRequest,
  asyncHandler(logout)
);

// FORGOT PASSWORD
router.post(
  "/forgot-password",
  sensitiveLimiter,
  [body("email").isEmail().withMessage("Email format incorrect")],
  validateRequest,
  asyncHandler(forgotPassword)
);

// RESET PASSWORD
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

// SELECT ROLE
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

router.delete("/delete-account", requireAuth, deleteAccount);

export default router;