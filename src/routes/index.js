// src/routes/index.js
import express from "express";

import { responseMiddleware } from "../middleware/response.middleware.js";

// Route modules (adjust these imports to match your existing filenames if needed)
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import friendRoutes from "./friendroutes.js";
import challengeRoutes from "./challengeRoutes.js";
import matchmakingRoutes from "./matchmakingRoutes.js";
import presenceRoutes from "./presenceRoutes.js";
import aiCoachRoutes from "./aiCoachRoutes.js";

const router = express.Router();

// ✅ Standardize ALL success responses across REST
router.use(responseMiddleware);

// Health / sanity
router.get("/", (req, res) => {
  return res.ok({
    service: "LA-TREL Backend API",
    status: "ok",
    time: new Date().toISOString(),
  });
});

// Mount feature routes
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/friends", friendRoutes);
router.use("/challenges", challengeRoutes);
router.use("/matchmaking", matchmakingRoutes);
router.use("/presence", presenceRoutes);
router.use("/ai-coach", aiCoachRoutes);

export default router;
