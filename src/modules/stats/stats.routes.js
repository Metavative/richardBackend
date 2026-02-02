// src/modules/stats/stats.routes.js
import { Router } from "express";
import { getMyStatsController } from "./stats.controller.js";
import requireAuth from "../../middleware/requireAuth.js"; // adjust if your middleware file name differs

const router = Router();

// GET /stats/me
router.get("/me", requireAuth, getMyStatsController);

export default router;
