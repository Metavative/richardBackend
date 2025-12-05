import { Router } from "express";
import { body } from "express-validator";
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
import { io } from "../server.js"; // Socket.io instance

const router = Router();

// ----------------------
// REGISTER ROUTE
// ----------------------
router.post(
  "/register",
  authLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").trim().isEmail().withMessage("Email format incorrect"),
    body("password")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters long")
      .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
      .matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter")
      .matches(/\d/).withMessage("Password must contain at least one number")
      .matches(/[@$!%*?&#^()_\-+=]/).withMessage(
        "Password must contain at least one symbol character (e.g. @, #, !)"
      ),
  ],
  async (req, res, next) => {
    try {
      const result = await register(req, res, next);
      return result;
    } catch (err) {
      console.error("🚨 Registration error:", err.message);
      return res.status(400).json({ message: err.message || "Registration failed" });
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
    body("email").isEmail().normalizeEmail(),
    body("password").isString().isLength({ min: 8 }),
  ],
  async (req, res, next) => {
    try {
      const result = await login(req, res, next);
      return result;
    } catch (err) {
      console.error("🚨 Login error:", err.message);
      return res.status(400).json({ message: err.message || "Login failed" });
    }
  }
);

// ----------------------
// VERIFY EMAIL
// ----------------------
router.post(
  "/verify-email",
  sensitiveLimiter,
  [body("uid").isString(), body("code").isLength({ min: 5, max: 5 })],
  async (req, res, next) => {
    try {
      const result = await verifyEmail(req, res, next);
      console.log("🟢 Email verified for UID:", req.body.uid);
      return result;
    } catch (err) {
      console.error("🚨 Verify Email error:", err.message);
      return res.status(400).json({ message: err.message || "Verification failed (OTP may be expired)" });
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
    try {
      const result = await resendVerification(req, res, next);
      console.log("ℹ Verification email resent to:", req.body.email);
      return result;
    } catch (err) {
      console.error("🚨 Resend Verification error:", err.message);
      return res.status(400).json({ message: err.message || "Resend verification failed" });
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
    try {
      const result = await forgotPassword(req, res, next);
      console.log("ℹ Forgot password request for:", req.body.email);
      return result;
    } catch (err) {
      console.error("🚨 Forgot Password error:", err.message);
      return res.status(400).json({ message: err.message || "Forgot password failed" });
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
    body("password").isStrongPassword({ minLength: 8, minSymbols: 0 }),
  ],
  async (req, res, next) => {
    try {
      const result = await resetPassword(req, res, next);
      console.log("🟢 Password reset for UID:", req.body.uid);
      return result;
    } catch (err) {
      console.error("🚨 Reset Password error:", err.message);
      return res.status(400).json({ message: err.message || "Reset password failed (OTP may be expired)" });
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
    try {
      const result = await selectRole(req, res, next);
      console.log(`🟢 Role selected: ${req.body.role} for UID: ${req.body.uid}`);
      return result;
    } catch (err) {
      console.error("🚨 Select Role error:", err.message);
      return res.status(400).json({ message: err.message || "Select role failed" });
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
    console.error("🚨 Fetch Users error:", err.message);
    return res.status(400).json({ message: err.message || "Fetch users failed" });
  }
});

export default router;