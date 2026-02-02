import express from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { getMyStatsController } from "./stats.controller.js";

const router = express.Router();

router.get("/me", authMiddleware, getMyStatsController);

export default router;
