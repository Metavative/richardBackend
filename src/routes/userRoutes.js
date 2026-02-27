// src/routes/userRoutes.js
import express from "express";
import createError from "http-errors";
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

      // Extra safety: ensure only image/*
      if (req.file) {
        const mt = String(req.file.mimetype || "").toLowerCase();
        if (!mt.startsWith("image/")) {
          return next(createError(400, "Only image files are allowed"));
        }
      }

      next();
    });
  },

  asyncHandler(editProfile)
);

export default router;