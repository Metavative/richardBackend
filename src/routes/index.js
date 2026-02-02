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

// ✅ NEW
import profileRoutes from "../modules/profile/profile.routes.js";
import cosmeticsRoutes from "../modules/cosmetics/cosmetics.routes.js";
import economyRoutes from "../modules/economy/economy.routes.js";
import achievementsRoutes from "../modules/achievements/achievements.routes.js";
import entitlementsRoutes from "../modules/entitlements/entitlements.routes.js";
import adsRoutes from "../modules/ads/ads.routes.js";
import statsRoutes from "../modules/stats/stats.routes.js";

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

// ✅ NEW MODULES
router.use("/profile", profileRoutes);
router.use("/cosmetics", cosmeticsRoutes);
router.use("/economy", economyRoutes);
router.use("/achievements", achievementsRoutes);
router.use("/entitlements", entitlementsRoutes);
router.use("/ads", adsRoutes);
router.use("/stats", statsRoutes);
export default router;
