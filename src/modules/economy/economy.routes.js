// src/modules/economy/economy.routes.js
import express from "express";
import { getMyEconomy, claimMyCoins } from "./economy.controller.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = express.Router();

router.get("/me", requireAuth, getMyEconomy);

// ✅ NEW: claim coins (XP thresholds)
router.post("/claim", requireAuth, claimMyCoins);

export default router;
