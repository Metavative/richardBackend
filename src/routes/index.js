import { Router } from "express";
import authRoutes from "./authRoutes.js";
import friendRoutes from "./friendroutes.js";
import userRoutes from "./userRoutes.js";
import matchmakingRoutes from "./matchmakingRoutes.js";
import aiCoachRoutes from "./aiCoachRoutes.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);
router.use("/friends", friendRoutes);
router.use("/user", userRoutes);
router.use("/matchmaking", matchmakingRoutes);
router.use("/ai", aiCoachRoutes);

export default router;
