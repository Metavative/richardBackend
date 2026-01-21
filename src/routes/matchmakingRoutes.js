// src/routes/matchmakingRoutes.js
import express from "express";
import createError from "http-errors";

import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import {
  getQueueStatus,
  joinQueue,
  leaveQueue,
  getActiveMatches,
  adminFlushQueue,
} from "../controllers/matchmakingController.js";

const router = express.Router();

/**
 * Public-ish: queue status (still safe, but you can require auth if you want)
 */
router.get(
  "/status",
  asyncHandler(getQueueStatus)
);

/**
 * Join matchmaking queue (auth required)
 */
router.post(
  "/join",
  requireAuth,
  asyncHandler(joinQueue)
);

/**
 * Leave matchmaking queue (auth required)
 */
router.post(
  "/leave",
  requireAuth,
  asyncHandler(leaveQueue)
);

/**
 * Get active matches for current user (auth required)
 */
router.get(
  "/active",
  requireAuth,
  asyncHandler(getActiveMatches)
);

/**
 * Admin-only: flush queue (production safety)
 */
router.post(
  "/admin/flush",
  requireAuth,
  requireRole("admin"),
  asyncHandler(adminFlushQueue)
);

export default router;
