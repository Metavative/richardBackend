// src/modules/stats/stats.routes.js
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getMyStatsController } from "./stats.controller.js";

const router = express.Router();

// GET /api/stats/me (if your main router is mounted at /api)
router.get("/me", requireAuth, getMyStatsController);

export default router;
