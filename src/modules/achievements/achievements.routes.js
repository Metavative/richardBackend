// src/modules/achievements/achievements.routes.js
import express from "express";
import { getAchievementsCatalog, getMyAchievements } from "./achievements.controller.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = express.Router();

// public catalog
router.get("/", getAchievementsCatalog);

// protected
router.get("/me", requireAuth, getMyAchievements);

export default router;
