// src/routes/presenceRoutes.js
import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { presenceStore } from "../stores/presence.store.js";

const router = express.Router();

/**
 * GET /api/presence/online
 * Auth required (recommended) so random users can’t scrape who’s online.
 */
router.get(
  "/online",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const online = presenceStore.snapshot();
    return res.ok({ online });
  })
);

export default router;
