// src/routes/index.js
import express from "express";
import { responseMiddleware } from "../middleware/response.middleware.js";

import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import friendRoutes from "./friendroutes.js";
import challengeRoutes from "./challengeRoutes.js";
import presenceRoutes from "./presenceRoutes.js";
import aiCoachRoutes from "./aiCoachRoutes.js";

// ✅ Keep ONLY this one
import matchmakingRoutes from "./matchmakingRoutes.js";

const router = express.Router();

router.use(responseMiddleware);

router.get("/", (req, res) => {
  return res.ok({
    service: "LA-TREL Backend API",
    status: "ok",
    time: new Date().toISOString(),
  });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/friends", friendRoutes);
router.use("/challenges", challengeRoutes);
router.use("/matchmaking", matchmakingRoutes);
router.use("/presence", presenceRoutes);
router.use("/ai-coach", aiCoachRoutes);

export default router;
