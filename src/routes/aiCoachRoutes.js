// src/routes/aiCoachRoutes.js
import express from "express";

import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getAiAdvice } from "../controllers/aiCoachController.js";

const router = express.Router();

/**
 * POST /api/ai-coach/advice
 * Body: { prompt, context? }
 * Auth required so it can be rate limited per-user and not abused publicly.
 */
router.post("/advice", requireAuth, asyncHandler(getAiAdvice));

export default router;
