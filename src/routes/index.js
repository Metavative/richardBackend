import { Router } from "express";

import authRoutes from "./authRoutes.js";
import friendRoutes from "./friendroutes.js"; // ⚠️ ensure filename matches exactly
import userRoutes from "./userRoutes.js";
import matchmakingRoutes from "./matchmakingRoutes.js";
import aiCoachRoutes from "./aiCoachRoutes.js";
import challengeRoutes from "./challengeRoutes.js"; // new

const router = Router();

/**
 * Health check
 * GET /api/health
 */
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "LA-TREL Backend",
    time: new Date().toISOString(),
  });
});

/**
 * Auth
 * /api/auth/*
 */
router.use("/auth", authRoutes);

/**
 * Friends
 * /api/friends/*
 * - POST   /send
 * - PATCH  /accept/:id
 * - PATCH  /reject/:id
 * - GET    /all
 * - GET    /mine/:userId
 */
router.use("/friends", friendRoutes);

/**
 * Users
 * /api/users/*
 * - GET /search?q=...
 */
router.use("/users", userRoutes);

/**
 * Challenges
 * /api/challenges/*
 * - POST /create
 */
router.use("/challenges", challengeRoutes);

/**
 * Matchmaking
 * /api/matchmaking/*
 */
router.use("/matchmaking", matchmakingRoutes);

/**
 * AI Coach
 * /api/ai/*
 */
router.use("/ai", aiCoachRoutes);

export default router;
