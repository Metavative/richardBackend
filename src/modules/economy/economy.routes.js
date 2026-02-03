// src/modules/economy/economy.routes.js
import express from "express";
import { getMyEconomy, claimMyCoins, buyCoins } from "./economy.controller.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = express.Router();

router.get("/me", requireAuth, getMyEconomy);

// ✅ Claim coins (XP thresholds)
router.post("/claim", requireAuth, claimMyCoins);

// ✅ NEW: Buy coins (dev placeholder - credits coins)
router.post("/buy-coins", requireAuth, buyCoins);

// ✅ Aliases (optional but recommended for client fallbacks)
router.post("/buy", requireAuth, buyCoins);
router.post("/coins/buy", requireAuth, buyCoins);

export default router;
