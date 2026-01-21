// src/routes/userRoutes.js
import express from "express";
import createError from "http-errors";
import { requireAuth } from "../middleware/requireAuth.js";
import { upload } from "../middleware/upload.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { editProfile } from "../controllers/userController.js";

const router = express.Router();

/**
 * PUT /api/users/edit
 * Auth required. Supports multipart form with optional profilePic.
 */
router.put(
  "/edit",
  requireAuth,
  (req, res, next) => {
    upload.single("profilePic")(req, res, (err) => {
      if (err) return next(createError(400, err.message));
      next();
    });
  },
  asyncHandler(editProfile)
);

export default router;
