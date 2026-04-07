// src/routes/index.js
import express from "express";
import { responseMiddleware } from "../middleware/response.middleware.js";
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import friendRoutes from "./friendroutes.js";
import challengeRoutes from "./challengeRoutes.js";
import presenceRoutes from "./presenceRoutes.js";
import aiCoachRoutes from "./aiCoachRoutes.js";
import matchmakingRoutes from "./matchmakingRoutes.js";
import profileRoutes from "../modules/profile/profile.routes.js";
import cosmeticsRoutes from "../modules/cosmetics/cosmetics.routes.js";
import economyRoutes from "../modules/economy/economy.routes.js";
import achievementsRoutes from "../modules/achievements/achievements.routes.js";
import entitlementsRoutes from "../modules/entitlements/entitlements.routes.js";
import statsRoutes from "../modules/stats/stats.routes.js";
import historyRoutes from "../modules/history/history.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import notificationsRoutes from "../modules/notifications/notifications.routes.js";

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
router.use("/profile", profileRoutes);
router.use("/cosmetics", cosmeticsRoutes);
router.use("/economy", economyRoutes);
router.use("/achievements", achievementsRoutes);
router.use("/entitlements", entitlementsRoutes);
// Ads routes are disabled for now.
// To re-enable from UI later, restore adsRoutes import + mount.
router.use("/stats", statsRoutes);
router.use("/history", historyRoutes);
router.use("/admin", adminRoutes);
router.use("/notifications", notificationsRoutes);
export default router;
