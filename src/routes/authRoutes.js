import { Router } from "express";
import { body, validationResult } from "express-validator";
import { authLimiter, sensitiveLimiter } from "../middleware/rateLimiters.js";
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

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }
  return null;
}

// ----------------------
// REGISTER ROUTE (SIMPLIFIED)
// ----------------------
router.post(
  "/register",
  authLimiter,
  [
    // ✅ name is OPTIONAL now
    body("name").optional().trim(),

    body("email").trim().isEmail().withMessage("Email format incorrect"),

    // ✅ simpler password: 8+ chars, at least 1 letter + 1 number
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long")
      .matches(/[A-Za-z]/)
      .withMessage("Password must contain at least one letter")
      .matches(/\d/)
      .withMessage("Password must contain at least one number"),
  ],
  async (req, res, next) => {
    const validation = handleValidation(req, res);
    if (validation) return validation;

    try {
      return await register(req, res, next);
    } catch (err) {
      console.error("❌ Registration error:", err);
      return res.status(err?.status || 400).json({
        message: err?.message || "Registration failed",
      });
    }
  }
);

// ----------------------
// LOGIN ROUTE
// ----------------------
router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Invalid email").normalizeEmail(),
    body("password")
      .isString()
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  async (req, res, next) => {
    const validation = handleValidation(req, res);
    if (validation) return validation;

    try {
      return await login(req, res, next);
    } catch (err) {
      console.error("❌ Login error:", err);
      return res.status(err?.status || 400).json({
        message: err?.message || "Login failed",
      });
    }
  }
);

// ----------------------
// REFRESH TOKEN
// ----------------------
router.post("/refresh", sensitiveLimiter, async (req, res, next) => {
  try {
    return await refresh(req, res, next);
  } catch (err) {
    console.error("❌ Refresh error:", err);
    return res.status(err?.status || 401).json({
      message: err?.message || "Refresh failed",
    });
  }
});

// ----------------------
// LOGOUT
// ----------------------
router.post("/logout", sensitiveLimiter, async (req, res, next) => {
  try {
    return await logout(req, res, next);
  } catch (err) {
    console.error("❌ Logout error:", err);
    return res.status(err?.status || 400).json({
      message: err?.message || "Logout failed",
    });
  }
});

// ----------------------
// VERIFY EMAIL
// ----------------------
router.post(
  "/verify-email",
  sensitiveLimiter,
  [body("uid").isString(), body("code").isLength({ min: 5, max: 5 })],
  async (req, res, next) => {
    const validation = handleValidation(req, res);
    if (validation) return validation;

    try {
      const result = await verifyEmail(req, res, next);
      console.log("ℹ Email verified for UID:", req.body.uid);
      return result;
    } catch (err) {
      console.error("❌ Verify Email error:", err);
      return res.status(err?.status || 400).json({
        message: err?.message || "Verification failed (OTP may be expired)",
      });
    }
  }
);

// ----------------------
// RESEND VERIFICATION
// ----------------------
router.post(
  "/resend-verification",
  sensitiveLimiter,
  [body("email").isEmail().normalizeEmail()],
  async (req, res, next) => {
    const validation = handleValidation(req, res);
    if (validation) return validation;

    try {
      const result = await resendVerification(req, res, next);
      console.log("ℹ Verification email resent to:", req.body.email);
      return result;
    } catch (err) {
      console.error("❌ Resend Verification error:", err);
      return res.status(err?.status || 400).json({
        message: err?.message || "Resend verification failed",
      });
    }
  }
);

// ----------------------
// FORGOT PASSWORD
// ----------------------
router.post(
  "/forgot-password",
  sensitiveLimiter,
  [body("email").isEmail().normalizeEmail()],
  async (req, res, next) => {
    const validation = handleValidation(req, res);
    if (validation) return validation;

    try {
      const result = await forgotPassword(req, res, next);
      console.log("ℹ Forgot password request for:", req.body.email);
      return result;
    } catch (err) {
      console.error("❌ Forgot Password error:", err);
      return res.status(err?.status || 400).json({
        message: err?.message || "Forgot password failed",
      });
    }
  }
);

// ----------------------
// RESET PASSWORD
// ----------------------
router.post(
  "/reset-password",
  sensitiveLimiter,
  [
    body("uid").isString(),
    body("code").isLength({ min: 5, max: 5 }),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  async (req, res, next) => {
    const validation = handleValidation(req, res);
    if (validation) return validation;

    try {
      const result = await resetPassword(req, res, next);
      console.log("ℹ Password reset for UID:", req.body.uid);
      return result;
    } catch (err) {
      console.error("❌ Reset Password error:", err);
      return res.status(err?.status || 400).json({
        message: err?.message || "Reset password failed (OTP may be expired)",
      });
    }
  }
);

// ----------------------
// SELECT ROLE
// ----------------------
router.post(
  "/select-role",
  [body("uid").isString(), body("role").isIn(["sourcer", "investor"])],
  async (req, res, next) => {
    const validation = handleValidation(req, res);
    if (validation) return validation;

    try {
      const result = await selectRole(req, res, next);
      console.log(`ℹ Role selected: ${req.body.role} for UID: ${req.body.uid}`);
      return result;
    } catch (err) {
      console.error("❌ Select Role error:", err);
      return res.status(err?.status || 400).json({
        message: err?.message || "Select role failed",
      });
    }
  }
);

// ----------------------
// FETCH USERS
// ----------------------
router.get("/fetchUsers", async (req, res, next) => {
  try {
    const result = await fetchUsers(req, res, next);
    console.log("ℹ Fetched users");
    return result;
  } catch (err) {
    console.error("❌ Fetch Users error:", err);
    return res.status(err?.status || 400).json({
      message: err?.message || "Fetch users failed",
    });
  }
});

export default router;
