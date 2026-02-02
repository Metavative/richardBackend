import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { getMyAchievements, getMyHistory, getMyStats } from "./profile.service.js";

const router = express.Router();

router.get("/me/stats", requireAuth, async (req, res, next) => {
  try {
    const data = await getMyStats(req.userId);
    return res.ok(data);
  } catch (e) {
    next(e);
  }
});

router.get("/me/history", requireAuth, async (req, res, next) => {
  try {
    const data = await getMyHistory(req.userId, req.query);
    return res.ok(data);
  } catch (e) {
    next(e);
  }
});

router.get("/me/achievements", requireAuth, async (req, res, next) => {
  try {
    const achievements = await getMyAchievements(req.userId);
    return res.ok({ achievements });
  } catch (e) {
    next(e);
  }
});

export default router;
