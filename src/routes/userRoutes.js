// src/routes/userRoutes.js
import express from "express";
import createError from "http-errors";
import path from "path";
import { requireAuth } from "../middleware/requireAuth.js";
import { upload } from "../middleware/upload.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  editProfile,
  getMe,
  getPublicProfile,
  searchUsers,
} from "../controllers/userController.js";

const router = express.Router();

const ALLOWED_IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".avif",
  ".ico",
  ".svg",
]);

function isAllowedUploadedImage(file) {
  if (!file) return true;

  const mt = String(file.mimetype || "").toLowerCase();
  if (mt.startsWith("image/")) return true;

  if (mt === "application/octet-stream") {
    const ext = path.extname(String(file.originalname || "")).toLowerCase();
    if (ext && ALLOWED_IMAGE_EXTS.has(ext)) return true;
  }

  return false;
}

/**
 * GET /api/users/me
 * Auth required. Returns my profile.
 */
router.get("/me", requireAuth, asyncHandler(getMe));

/**
 * GET /api/users/search?q=...
 * Auth required. Returns safe search results.
 */
router.get("/search", requireAuth, asyncHandler(searchUsers));

/**
 * GET /api/users/:id
 * Public-safe profile.
 */
router.get("/:id", asyncHandler(getPublicProfile));

/**
 * PUT /api/users/edit
 * Auth required.
 * Supports:
 * - name
 * - nickname
 * - bio
 * - username
 * - profilePic (multipart image upload, optional)
 */
router.put(
  "/edit",
  requireAuth,

  // ✅ Handle multipart image upload safely
  (req, res, next) => {
    upload.single("profilePic")(req, res, (err) => {
      if (err) {
        // Multer errors -> clean 400
        return next(createError(400, err.message));
      }

      // Extra safety: accept image/* and octet-stream with image extension.
      if (!isAllowedUploadedImage(req.file)) {
        return next(createError(400, "Only image files are allowed"));
      }

      next();
    });
  },

  asyncHandler(editProfile)
);

// Compatibility alias for clients/proxies that use PATCH semantics.
router.patch(
  "/edit",
  requireAuth,
  (req, res, next) => {
    upload.single("profilePic")(req, res, (err) => {
      if (err) {
        return next(createError(400, err.message));
      }
      if (!isAllowedUploadedImage(req.file)) {
        return next(createError(400, "Only image files are allowed"));
      }
      next();
    });
  },
  asyncHandler(editProfile)
);

export default router;
